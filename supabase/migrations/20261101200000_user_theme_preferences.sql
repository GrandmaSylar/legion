-- Allow users to store and synchronize their personal theme preferences
-- (mode, surface, accent, wallpaper type, preset, dim, and blur).
alter table public.profiles
  add column if not exists theme jsonb default null;

-- RPC so any authenticated user can update their own theme preferences without
-- needing wider write access to the profiles table.
create or replace function public.set_my_theme(p_theme jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  update public.profiles
  set theme = p_theme,
      updated_at = now()
  where id = auth.uid();
end;
$$;
