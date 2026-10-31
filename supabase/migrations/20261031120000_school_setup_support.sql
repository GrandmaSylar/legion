-- Support for the school setup screens.

-- Rows default to the caller's school, so the browser never sends school_id.
-- RLS WITH CHECK still rejects any attempt to write another school's id.
do $$
declare t text;
begin
  for t in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables tb
      on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name = 'school_id'
      and tb.table_type = 'BASE TABLE' and c.table_name <> 'audit_log'
  loop
    execute format('alter table public.%I alter column school_id set default public.current_school_id()', t);
  end loop;
end $$;

-- Make a year current atomically (the one-current-year index forbids two at
-- once). SECURITY INVOKER: RLS applies, so only an admin's updates take effect.
create function public.set_current_academic_year(p_year uuid) returns void
language plpgsql set search_path = public as $$
begin
  update public.academic_years
    set is_current = false
    where is_current and id <> p_year and school_id = public.current_school_id();
  update public.academic_years set is_current = true where id = p_year;
  if not found then
    raise exception 'academic year not found or not permitted';
  end if;
  -- A current term must belong to the current year.
  update public.terms set is_current = false where is_current and academic_year_id <> p_year;
end $$;

-- Making a term current also makes its year current.
create function public.set_current_term(p_term uuid) returns void
language plpgsql set search_path = public as $$
declare v_year uuid;
begin
  select academic_year_id into v_year from public.terms where id = p_term;
  if v_year is null then
    raise exception 'term not found or not permitted';
  end if;
  perform public.set_current_academic_year(v_year);
  update public.terms
    set is_current = false
    where is_current and id <> p_term and school_id = public.current_school_id();
  update public.terms set is_current = true where id = p_term;
end $$;

revoke execute on function public.set_current_academic_year(uuid) from public, anon;
revoke execute on function public.set_current_term(uuid) from public, anon;
grant execute on function public.set_current_academic_year(uuid) to authenticated;
grant execute on function public.set_current_term(uuid) to authenticated;
