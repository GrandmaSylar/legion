-- Online fee payments through Paystack.
--
-- The browser never records a payment. The paystack Edge Function starts a payment
-- (an online_payments row in 'pending'), and only a signed Paystack webhook, or the
-- function's own check with Paystack, turns it into a real payments row through
-- record_online_payment() below. That function is callable by the service role only.

alter type public.payment_method add value if not exists 'card';

create table public.online_payments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null default public.current_school_id() references public.schools (id),
  invoice_id uuid not null references public.invoices (id),
  initiated_by uuid references public.profiles (id) on delete set null,
  -- Our own unique reference, sent to Paystack and echoed back on the webhook.
  reference text not null unique,
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null default 'GHS',
  status text not null default 'pending' check (status in ('pending', 'success', 'failed', 'abandoned')),
  channel text,
  payment_id uuid references public.payments (id) on delete set null,
  -- Anything that needs a person to look at it (amount mismatch, voided invoice, ...).
  note text,
  provider_response jsonb,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.online_payments (school_id, status);
create index on public.online_payments (invoice_id);
create index on public.online_payments (initiated_by);

create trigger set_updated_at before update on public.online_payments
  for each row execute function public.set_updated_at();
create trigger audit_row after insert or update or delete on public.online_payments
  for each row execute function public.audit_row();

alter table public.online_payments enable row level security;

-- Finance staff see every attempt; a parent sees only the ones they started.
-- There are no write policies: only the Edge Function (service role) writes.
create policy online_payments_read on public.online_payments for select to authenticated
  using (school_id = public.current_school_id()
         and (initiated_by = auth.uid()
              or public.has_any_role(array['school_admin','accountant','principal']::public.app_role[])));

-- Turns a successful Paystack charge into a payment, exactly once.
-- p_paid is in cedis. Returns the payment id, or null when the charge needs a person
-- to review it (the reason is stored in online_payments.note).
create function public.record_online_payment(
  p_reference text, p_paid numeric, p_channel text, p_network text, p_raw jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  op public.online_payments;
  inv public.invoices;
  v_method public.payment_method;
  v_net public.momo_network;
  v_guardian uuid;
  v_payment uuid;
begin
  select * into op from public.online_payments where reference = p_reference for update;
  if not found then
    raise exception 'Unknown payment reference' using errcode = 'P0002';
  end if;
  -- Paystack may send the same event more than once; the second one changes nothing.
  if op.status = 'success' then return op.payment_id; end if;

  if p_paid <> op.amount then
    update public.online_payments set status = 'failed', channel = p_channel, provider_response = p_raw,
      note = format('Amount mismatch: expected %s, Paystack reports %s. Check Paystack and refund if needed.', op.amount, p_paid)
      where id = op.id;
    return null;
  end if;

  select * into inv from public.invoices where id = op.invoice_id;
  if inv.status = 'void' or inv.deleted_at is not null then
    update public.online_payments set status = 'failed', channel = p_channel, provider_response = p_raw,
      note = 'The invoice was voided or removed before this payment arrived. Refund it in Paystack.'
      where id = op.id;
    return null;
  end if;

  v_method := case lower(coalesce(p_channel, ''))
    when 'mobile_money' then 'mobile_money'
    when 'bank_transfer' then 'bank_transfer'
    when 'bank' then 'bank_transfer'
    else 'card' end;
  if v_method = 'mobile_money' then
    v_net := case
      when lower(coalesce(p_network, '')) like '%vod%' or lower(coalesce(p_network, '')) like '%telecel%' then 'telecel'
      when lower(coalesce(p_network, '')) like '%airtel%' or lower(coalesce(p_network, '')) like '%tigo%' then 'airteltigo'
      else 'mtn' end;
  end if;

  select id into v_guardian from public.guardians where profile_id = op.initiated_by;

  insert into public.payments (school_id, invoice_id, amount, method, network, reference, paid_on, paid_by_guardian_id, received_by_name)
  values (op.school_id, op.invoice_id, op.amount, v_method, v_net, p_reference, current_date, v_guardian, 'Paystack (online)')
  returning id into v_payment;

  update public.online_payments set status = 'success', channel = p_channel, payment_id = v_payment,
    provider_response = p_raw, paid_at = now(), note = null
    where id = op.id;
  return v_payment;
end $$;

revoke all on function public.record_online_payment(text, numeric, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.record_online_payment(text, numeric, text, text, jsonb) to service_role;
