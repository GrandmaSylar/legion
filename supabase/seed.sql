-- Seed data for Pinks Academy (pilot school). Runs on `supabase db reset`;
-- against the remote project, run it once by hand after the migrations.
-- Everything seeded here is editable by the school afterwards.

do $$
declare
  v_school uuid;
  v_ges uuid;
  v_desc uuid;
  v_lvl text;
  v_i int := 0;
begin
  insert into public.schools (name) values ('Pinks Academy') returning id into v_school;

  -- Grading scales
  insert into public.grading_scales (school_id, name, type)
    values (v_school, 'GES Basic (1-7)', 'ges_numeric') returning id into v_ges;
  insert into public.grading_scales (school_id, name, type)
    values (v_school, 'Descriptive remarks', 'descriptive') returning id into v_desc;

  insert into public.grade_bands (school_id, scale_id, min_score, max_score, grade, remark) values
    (v_school, v_ges, 80, 100, '1', 'Excellent'),
    (v_school, v_ges, 70, 79.99, '2', 'Very Good'),
    (v_school, v_ges, 60, 69.99, '3', 'Good'),
    (v_school, v_ges, 50, 59.99, '4', 'Credit'),
    (v_school, v_ges, 40, 49.99, '5', 'Pass'),
    (v_school, v_ges, 30, 39.99, '6', 'Below Average'),
    (v_school, v_ges, 0, 29.99, '7', 'Weak / Fail');

  -- Levels: creche to KG 2 are descriptive, Basic 1-9 use GES. BECE is Basic 9 only.
  foreach v_lvl in array array[
    'Creche','Nursery 1','Nursery 2','KG 1','KG 2',
    'Basic 1','Basic 2','Basic 3','Basic 4','Basic 5','Basic 6',
    'Basic 7','Basic 8','Basic 9'
  ]
  loop
    v_i := v_i + 1;
    insert into public.levels (school_id, name, sort_order, grading_scale_id, sits_bece)
    values (v_school, v_lvl, v_i,
            case when v_i <= 5 then v_desc else v_ges end,
            v_lvl = 'Basic 9');
  end loop;

  -- Default learning areas (descriptive levels); the school can edit these.
  insert into public.learning_areas (school_id, name, sort_order) values
    (v_school, 'Language and Literacy', 1),
    (v_school, 'Numeracy', 2),
    (v_school, 'Our World Our People', 3),
    (v_school, 'Creative Arts', 4),
    (v_school, 'Physical Development', 5),
    (v_school, 'Social and Emotional Development', 6);

  -- Fee categories
  insert into public.fee_categories (school_id, name, is_one_off) values
    (v_school, 'Admission', true),
    (v_school, 'School fees', false),
    (v_school, 'Books and stationery', false);

  -- Numbering: V/2026/0001 style admission numbers; the year restarts the counter.
  insert into public.number_sequences (school_id, kind, format) values
    (v_school, 'admission_no', 'V/{YYYY}/{NNNN}'),
    (v_school, 'staff_no', 'S/{NNNN}'),
    (v_school, 'invoice_no', 'INV/{YYYY}/{NNNNNN}'),
    (v_school, 'receipt_no', 'RCT/{YYYY}/{NNNNNN}');
end $$;
