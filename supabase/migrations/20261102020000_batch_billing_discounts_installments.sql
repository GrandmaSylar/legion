-- Batch Class/Level Term Billing RPC with Automatic Scholarship/Discount Application.
-- Generates invoices for all active enrolled pupils in a class (or all classes in a level)
-- for a given term using public.fee_structures, and applies any active public.student_discounts
-- assigned to each pupil for that academic year. Skips pupils who already have a non-void
-- invoice for that term so running batch billing twice is idempotent and safe.

create or replace function public.batch_generate_term_invoices(
  p_term_id uuid,
  p_class_id uuid default null,
  p_due_on date default null,
  p_include_one_off boolean default false
) returns table (
  invoices_created int,
  students_skipped int,
  total_billed numeric
)
language plpgsql set search_path = public as $$
declare
  v_school uuid := public.current_school_id();
  v_year uuid;
  v_created int := 0;
  v_skipped int := 0;
  v_total_billed numeric := 0;
  v_inv_id uuid;
  v_gross numeric;
  v_disc_amt numeric;
  enr record;
  fs record;
  sd record;
begin
  if not public.has_any_role(array['school_admin','accountant']::public.app_role[]) then
    raise exception 'permission denied for batch term billing';
  end if;

  select t.academic_year_id into v_year
  from public.terms t
  where t.id = p_term_id and t.school_id = v_school;

  if v_year is null then
    raise exception 'term not found in your school';
  end if;

  for enr in
    select
      e.student_id,
      e.class_id,
      c.level_id
    from public.enrollments e
    join public.classes c on c.id = e.class_id
    join public.students s on s.id = e.student_id
    where e.school_id = v_school
      and e.academic_year_id = v_year
      and e.status = 'enrolled'
      and s.status = 'active'
      and s.deleted_at is null
      and (p_class_id is null or e.class_id = p_class_id)
  loop
    -- Skip if student already has a non-void invoice for this term
    if exists (
      select 1 from public.invoices i
      where i.school_id = v_school
        and i.student_id = enr.student_id
        and i.term_id = p_term_id
        and i.deleted_at is null
        and i.status <> 'void'
    ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    -- Check that at least one fee_structure applies to this student's level
    select coalesce(sum(f.amount), 0) into v_gross
    from public.fee_structures f
    join public.fee_categories fc on fc.id = f.fee_category_id
    where f.school_id = v_school
      and f.level_id = enr.level_id
      and fc.is_active = true
      and (
        f.term_id = p_term_id
        or (f.term_id is null and (not fc.is_one_off or p_include_one_off))
      );

    if v_gross <= 0 then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    -- Create the invoice (invoices_assign_number trigger generates INV/YYYY/NNNNNN)
    insert into public.invoices (
      school_id,
      student_id,
      term_id,
      number,
      issued_on,
      due_on
    ) values (
      v_school,
      enr.student_id,
      p_term_id,
      '',
      current_date,
      p_due_on
    ) returning id into v_inv_id;

    -- Insert fee items from fee_structures
    for fs in
      select
        f.fee_category_id,
        f.amount,
        fc.name as category_name
      from public.fee_structures f
      join public.fee_categories fc on fc.id = f.fee_category_id
      where f.school_id = v_school
        and f.level_id = enr.level_id
        and fc.is_active = true
        and f.amount > 0
        and (
          f.term_id = p_term_id
          or (f.term_id is null and (not fc.is_one_off or p_include_one_off))
        )
    loop
      insert into public.invoice_items (
        school_id,
        invoice_id,
        fee_category_id,
        kind,
        description,
        amount
      ) values (
        v_school,
        v_inv_id,
        fs.fee_category_id,
        'fee',
        fs.category_name,
        fs.amount
      );
      v_total_billed := v_total_billed + fs.amount;
    end loop;

    -- Apply active student_discounts for this academic year
    for sd in
      select
        d.id as discount_id,
        d.name as discount_name,
        d.type as discount_type,
        d.value as discount_value,
        d.applies_to_category_id
      from public.student_discounts sdisc
      join public.discounts d on d.id = sdisc.discount_id
      where sdisc.school_id = v_school
        and sdisc.student_id = enr.student_id
        and sdisc.academic_year_id = v_year
        and d.is_active = true
    loop
      v_disc_amt := 0;
      if sd.discount_type = 'fixed' then
        v_disc_amt := sd.discount_value;
      else
        -- percent discount: either on a specific category or on total gross fees
        if sd.applies_to_category_id is not null then
          select coalesce(sum(ii.amount), 0) * (sd.discount_value / 100.0)
          into v_disc_amt
          from public.invoice_items ii
          where ii.invoice_id = v_inv_id
            and ii.kind = 'fee'
            and ii.fee_category_id = sd.applies_to_category_id;
        else
          v_disc_amt := v_gross * (sd.discount_value / 100.0);
        end if;
      end if;

      v_disc_amt := round(least(v_disc_amt, v_gross), 2);
      if v_disc_amt > 0 then
        insert into public.invoice_items (
          school_id,
          invoice_id,
          fee_category_id,
          kind,
          description,
          amount
        ) values (
          v_school,
          v_inv_id,
          sd.applies_to_category_id,
          'discount',
          'Scholarship / Discount: ' || sd.discount_name,
          -v_disc_amt
        );
        v_total_billed := v_total_billed - v_disc_amt;
      end if;
    end loop;

    v_created := v_created + 1;
  end loop;

  invoices_created := v_created;
  students_skipped := v_skipped;
  total_billed := greatest(0, v_total_billed);
  return next;
end $$;

revoke execute on function public.batch_generate_term_invoices(uuid, uuid, date, boolean) from public, anon;
grant execute on function public.batch_generate_term_invoices(uuid, uuid, date, boolean) to authenticated;
