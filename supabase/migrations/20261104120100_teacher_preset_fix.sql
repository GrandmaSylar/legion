-- A teacher reaches grades through "enter marks for their own classes", which already includes
-- seeing them. "See grades" means every class, and the teacher preset should never have held it.
-- Remove it from the preset and from teachers who only got it from that preset.
delete from public.access_preset_capabilities where role = 'teacher' and capability = 'grades.view';

delete from public.user_capabilities uc using public.user_roles ur
  where ur.profile_id = uc.profile_id and uc.capability = 'grades.view' and ur.role = 'teacher'
    and not exists (select 1 from public.user_roles r2 join public.access_preset_capabilities p on p.role = r2.role
                    where r2.profile_id = uc.profile_id and p.capability = 'grades.view');
