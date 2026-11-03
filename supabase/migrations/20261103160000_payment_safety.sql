-- Money safety.
--
-- 1. A receipt can no longer be edited or erased by anyone. The only way to undo one
--    is to CANCEL it with a reason; the row stays, marked with who cancelled it, when
--    and why, and the invoice balance recovers. Recording a payment is unchanged.
-- 2. Online payments that need a person's eyes (a wrong amount, a voided invoice, an
--    overpayment) are flagged, and a person marks them reviewed with a note.
-- 3. Cancelling the receipt of an online payment requires the Paystack refund
--    reference, so a receipt is never cancelled without the money being returned.

-- ── Cancelling a receipt ────────────────────────────────────────────────────
alter table public.payments
  add column voided_by uuid references public.profiles (id) on delete set null,
  add column void_reason text,
  add column refund_reference text;

alter table public.payments
  add constraint payments_void_has_reason
  check (voided_at is null or length(btrim(coalesce(void_reason, ''))) >= 5);

-- Staff may read and record payments; nothing may update or delete one directly.
drop policy payments_finance on public.payments;
create policy payments_finance_read on public.payments for select to authenticated
  using (school_id = public.current_school_id()
         and public.has_any_role(array['school_admin','accountant']::public.app_role[]));
create policy payments_finance_insert on public.payments for insert to authenticated
  with check (school_id = public.current_school_id() and voided_at is null
              and public.has_any_role(array['school_admin','accountant']::public.app_role[]));

create function public.void_payment(p_payment uuid, p_reason text, p_refund_reference text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  pay public.payments;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_refund text := nullif(btrim(coalesce(p_refund_reference, '')), '');
begin
  if not public.has_any_role(array['school_admin','accountant']::public.app_role[]) then
    raise exception 'You do not have permission to cancel a receipt.' using errcode = '42501';
  end if;
  if length(v_reason) < 5 then
    raise exception 'Please give a reason of at least a few words.' using errcode = '22023';
  end if;

  select * into pay from public.payments
    where id = p_payment and school_id = public.current_school_id() for update;
  if not found then
    raise exception 'That payment was not found.' using errcode = 'P0002';
  end if;
  if pay.voided_at is not null then
    raise exception 'That receipt has already been cancelled.' using errcode = '22023';
  end if;

  if exists (select 1 from public.online_payments where payment_id = pay.id) and v_refund is null then
    raise exception 'This was paid online. Refund it in Paystack first, then enter the refund reference here.'
      using errcode = '22023';
  end if;

  update public.payments
     set voided_at = now(), voided_by = auth.uid(), void_reason = v_reason, refund_reference = v_refund
   where id = pay.id;

  update public.online_payments
     set status = 'refunded', needs_review = false
   where payment_id = pay.id;
end $$;

revoke all on function public.void_payment(uuid, text, text) from public, anon;
grant execute on function public.void_payment(uuid, text, text) to authenticated;

-- ── Online payments that need a person's eyes ───────────────────────────────
alter table public.online_payments
  drop constraint online_payments_status_check,
  add constraint online_payments_status_check
    check (status in ('pending', 'success', 'failed', 'abandoned', 'refunded')),
  add column needs_review boolean not null default false,
  add column reviewed_by uuid references public.profiles (id) on delete set null,
  add column reviewed_at timestamptz,
  add column review_note text;
create index on public.online_payments (school_id) where needs_review;

create function public.resolve_online_payment(p_id uuid, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare v_note text := btrim(coalesce(p_note, ''));
begin
  if not public.has_any_role(array['school_admin','accountant']::public.app_role[]) then
    raise exception 'You do not have permission to review online payments.' using errcode = '42501';
  end if;
  if length(v_note) < 5 then
    raise exception 'Please write what was done about it.' using errcode = '22023';
  end if;
  update public.online_payments
     set needs_review = false, reviewed_by = auth.uid(), reviewed_at = now(), review_note = v_note
   where id = p_id and school_id = public.current_school_id();
  if not found then
    raise exception 'That payment was not found.' using errcode = 'P0002';
  end if;
end $$;

revoke all on function public.resolve_online_payment(uuid, text) from public, anon;
grant execute on function public.resolve_online_payment(uuid, text) to authenticated;

-- The recorder now flags every case that needs review, and an overpayment.
create or replace function public.record_online_payment(
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
  v_billed numeric;
  v_paid numeric;
begin
  select * into op from public.online_payments where reference = p_reference for update;
  if not found then
    raise exception 'Unknown payment reference' using errcode = 'P0002';
  end if;
  -- Paystack may send the same event more than once; the second one changes nothing.
  if op.status in ('success', 'refunded') then return op.payment_id; end if;

  if p_paid <> op.amount then
    update public.online_payments set status = 'failed', needs_review = true, channel = p_channel, provider_response = p_raw,
      note = format('Amount mismatch: expected %s, Paystack reports %s. Check Paystack and refund if needed.', op.amount, p_paid)
      where id = op.id;
    return null;
  end if;

  select * into inv from public.invoices where id = op.invoice_id;
  if inv.status = 'void' or inv.deleted_at is not null then
    update public.online_payments set status = 'failed', needs_review = true, channel = p_channel, provider_response = p_raw,
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

  -- Two people can pay the same invoice at the same moment. The money is real, so the
  -- receipt stands, but the extra has to be refunded: flag it.
  select coalesce(sum(amount), 0) into v_billed from public.invoice_items where invoice_id = op.invoice_id;
  select coalesce(sum(amount), 0) into v_paid from public.payments where invoice_id = op.invoice_id and voided_at is null;
  if v_paid > v_billed then
    update public.online_payments set needs_review = true,
      note = format('Overpaid by %s: the invoice was already settled or paid twice at once. Refund the extra in Paystack.', v_paid - v_billed)
      where id = op.id;
  end if;
  return v_payment;
end $$;
