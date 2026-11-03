-- Two fixes found in an audit.
--
-- 1. issue_number could hand out a number that was already used. Records
--    inserted with hand-made numbers (a seed or an import) do not advance the
--    counter, so the next generated number collided and every insert of an
--    invoice, receipt or staff member failed with a duplicate-key error, which
--    also broke creating a staff login. It now checks the target table and
--    skips taken numbers, so the counter catches up by itself.
--
-- 2. Some SECURITY DEFINER functions were callable without signing in because
--    they never revoked the default PUBLIC execute grant. They check the caller
--    internally, so nothing leaked, but they should not be reachable at all.

-- ─── 1. Collision-safe numbering ─────────────────────────────────────────────
create or replace function public.issue_number(p_school uuid, p_kind public.number_kind)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_format text;
  v_year int := extract(year from now())::int;
  v_value int;
  v_pad int;
  v_candidate text;
  v_taken boolean;
  v_tries int := 0;
begin
  select format into v_format from public.number_sequences
  where school_id = p_school and kind = p_kind
  order by year desc limit 1;
  if v_format is null then
    raise exception 'no number sequence configured for % in school %', p_kind, p_school;
  end if;

  if v_format not like '%{YYYY}%' then v_year := 0; end if;
  v_pad := length(substring(v_format from '\{(N+)\}'));

  loop
    insert into public.number_sequences (school_id, kind, format, year, next_value)
    values (p_school, p_kind, v_format, v_year, 2)
    on conflict (school_id, kind, year)
    do update set next_value = public.number_sequences.next_value + 1
    returning next_value - 1 into v_value;

    v_candidate := replace(
      regexp_replace(v_format, '\{N+\}', lpad(v_value::text, greatest(v_pad, 1), '0')),
      '{YYYY}', v_year::text
    );

    -- Soft-deleted rows count as taken: a number is never reissued.
    v_taken := case p_kind
      when 'admission_no' then exists (select 1 from public.students  where school_id = p_school and admission_no = v_candidate)
      when 'staff_no'     then exists (select 1 from public.staff     where school_id = p_school and staff_no     = v_candidate)
      when 'invoice_no'   then exists (select 1 from public.invoices  where school_id = p_school and number       = v_candidate)
      when 'receipt_no'   then exists (select 1 from public.payments  where school_id = p_school and receipt_no   = v_candidate)
      else false
    end;
    exit when not v_taken;

    v_tries := v_tries + 1;
    if v_tries > 100000 then
      raise exception 'could not find a free % for school %', p_kind, p_school;
    end if;
  end loop;

  return v_candidate;
end $$;

-- ─── 2. No anonymous access to SECURITY DEFINER functions ────────────────────
-- Revoke the default PUBLIC/anon execute grant from every one that has it, and
-- re-grant to signed-in users only where they could run it before.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as fn, has_function_privilege('authenticated', p.oid, 'execute') as auth_ok
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and has_function_privilege('anon', p.oid, 'execute')
  loop
    execute format('revoke execute on function %s from public, anon', r.fn);
    if r.auth_ok then
      execute format('grant execute on function %s to authenticated', r.fn);
    end if;
    execute format('grant execute on function %s to service_role', r.fn);
  end loop;
end $$;
