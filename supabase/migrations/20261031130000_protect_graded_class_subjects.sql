-- Removing a subject from a class must never silently delete its assessments
-- and scores. Block it once any assessment exists; the subject is switched off
-- for the class by the school instead (or the assessments are cleared first).
alter table public.assessments
  drop constraint assessments_class_subject_id_fkey,
  add constraint assessments_class_subject_id_fkey
    foreign key (class_subject_id) references public.class_subjects (id) on delete restrict;
