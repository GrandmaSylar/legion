-- School / Institution details displayed on all official receipts, invoices, and report cards.

alter table public.schools
  add column if not exists motto text,
  add column if not exists address text,
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists website text,
  add column if not exists tax_or_reg_no text,
  add column if not exists receipt_footer text,
  add column if not exists bank_details text;

-- Store cashier/bursar name on payments so parents printing a receipt can see
-- who received the payment without opening up profiles_read.
alter table public.payments
  add column if not exists received_by_name text;

create or replace function public.payments_stamp_receiver() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and new.received_by is null then
    new.received_by := auth.uid();
  end if;
  if new.received_by is not null and (new.received_by_name is null or new.received_by_name = '') then
    select full_name into new.received_by_name
    from public.profiles
    where id = new.received_by;
  end if;
  return new;
end $$;

drop trigger if exists payments_stamp_receiver on public.payments;
create trigger payments_stamp_receiver
before insert or update on public.payments
for each row execute function public.payments_stamp_receiver();

revoke execute on function public.payments_stamp_receiver() from public, anon, authenticated;
