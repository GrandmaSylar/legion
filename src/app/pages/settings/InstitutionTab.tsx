import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Check,
  Globe,
  GraduationCap,
  ImagePlus,
  Mail,
  MapPin,
  Phone,
  Receipt,
  Trash2,
} from "lucide-react";
import { useAuth } from "../../../lib/auth/AuthProvider";
import {
  getInstitutionDetails,
  updateInstitutionDetails,
  type InstitutionDetails,
} from "../../../lib/data/setup";
import { friendlyError } from "../../../lib/data/errors";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";
import { Field, FormMessage, NativeSelect } from "../../components/fields";

/** Resize an uploaded logo image to a crisp <= 256x256 PNG data URL for receipts & PDFs. */
function resizeLogoToDataUrl(file: File, maxSize = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read image file"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Invalid image file"));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas not available"));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/png", 0.92));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export default function InstitutionTab() {
  const { refreshProfile } = useAuth();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const q = useQuery({
    queryKey: ["institution-details"],
    queryFn: getInstitutionDetails,
  });

  const [form, setForm] = useState<Omit<InstitutionDetails, "id">>({
    name: "",
    logoUrl: null,
    motto: "",
    address: "",
    phone: "",
    email: "",
    website: "",
    taxOrRegNo: "",
    currency: "GHS",
    brandPrimary: "#c2410c",
    receiptFooter: "Fees paid are non-refundable. Thank you for your payment.",
    bankDetails: "",
  });
  const [logoError, setLogoError] = useState<string | null>(null);

  useEffect(() => {
    if (!q.data) return;
    setForm({
      name: q.data.name,
      logoUrl: q.data.logoUrl,
      motto: q.data.motto,
      address: q.data.address,
      phone: q.data.phone,
      email: q.data.email,
      website: q.data.website,
      taxOrRegNo: q.data.taxOrRegNo,
      currency: q.data.currency || "GHS",
      brandPrimary: q.data.brandPrimary ?? "#c2410c",
      receiptFooter:
        q.data.receiptFooter ||
        "Fees paid are non-refundable. Thank you for your payment.",
      bankDetails: q.data.bankDetails,
    });
  }, [q.data]);

  const patch = (p: Partial<Omit<InstitutionDetails, "id">>) =>
    setForm((cur) => ({ ...cur, ...p }));

  const onPickLogo = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setLogoError(null);
    try {
      const dataUrl = await resizeLogoToDataUrl(file, 256);
      patch({ logoUrl: dataUrl });
    } catch {
      setLogoError("Could not process that image file. Try a PNG or JPG logo.");
    }
  };

  const save = useMutation({
    mutationFn: () => updateInstitutionDetails(q.data!.id, form),
    onSuccess: async () => {
      void qc.invalidateQueries({ queryKey: ["institution-details"] });
      await refreshProfile();
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!q.data || !form.name.trim()) return;
    save.mutate();
  };

  if (q.isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
      {/* Institution Details Form */}
      <form onSubmit={onSubmit} className="surface space-y-5 p-4 sm:p-6">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Building2 className="size-4 text-primary" aria-hidden />
            Institution &amp; receipt details
          </h2>
          <p className="text-xs text-muted-foreground">
            These details appear on all official fee receipts, invoices, and
            student report cards.
          </p>
        </div>

        {/* Crest / Logo Upload */}
        <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-background/50 p-3.5">
          {form.logoUrl ? (
            <img
              src={form.logoUrl}
              alt={form.name || "School logo"}
              className="size-16 rounded-2xl border border-border bg-white object-contain p-1"
            />
          ) : (
            <div className="grid size-16 place-items-center rounded-2xl bg-primary/15 text-primary">
              <GraduationCap className="size-8" aria-hidden />
            </div>
          )}

          <div className="min-w-0 flex-1 space-y-1">
            <div className="text-sm font-medium">School crest / logo</div>
            <p className="text-xs text-muted-foreground">
              Shown at the top of all printed receipts, invoices, and terminal
              report cards.
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => void onPickLogo(e)}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <ImagePlus className="size-3.5" aria-hidden />
                {form.logoUrl ? "Change logo" : "Upload logo"}
              </Button>
              {form.logoUrl ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => patch({ logoUrl: null })}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                  Remove
                </Button>
              ) : null}
            </div>
            {logoError ? (
              <p className="text-xs text-destructive">{logoError}</p>
            ) : null}
          </div>
        </div>

        {/* Identity */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="School / Institution name" htmlFor="inst-name">
            <Input
              id="inst-name"
              value={form.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="e.g. Pinks Academy"
              required
            />
          </Field>
          <Field label="Motto / Tagline" htmlFor="inst-motto">
            <Input
              id="inst-motto"
              value={form.motto}
              onChange={(e) => patch({ motto: e.target.value })}
              placeholder="e.g. Excellence and Integrity"
            />
          </Field>
        </div>

        {/* Contact & Address */}
        <Field label="Physical & postal address" htmlFor="inst-address">
          <Input
            id="inst-address"
            value={form.address}
            onChange={(e) => patch({ address: e.target.value })}
            placeholder="e.g. P.O. Box CT 120, East Legon, Accra, Ghana"
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Telephone number(s)" htmlFor="inst-phone">
            <Input
              id="inst-phone"
              value={form.phone}
              onChange={(e) => patch({ phone: e.target.value })}
              placeholder="e.g. +233 24 000 0000 / +233 30 200 0000"
            />
          </Field>
          <Field label="Official email" htmlFor="inst-email">
            <Input
              id="inst-email"
              type="email"
              value={form.email}
              onChange={(e) => patch({ email: e.target.value })}
              placeholder="e.g. office@pinksacademy.edu.gh"
            />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Website" htmlFor="inst-website">
            <Input
              id="inst-website"
              value={form.website}
              onChange={(e) => patch({ website: e.target.value })}
              placeholder="e.g. www.pinksacademy.edu.gh"
            />
          </Field>
          <Field label="GES Reg. No. / TIN" htmlFor="inst-reg">
            <Input
              id="inst-reg"
              value={form.taxOrRegNo}
              onChange={(e) => patch({ taxOrRegNo: e.target.value })}
              placeholder="e.g. GES/GA/2026/014"
            />
          </Field>
          <Field label="Default currency" htmlFor="inst-currency">
            <NativeSelect
              id="inst-currency"
              value={form.currency}
              onChange={(e) => patch({ currency: e.target.value })}
            >
              <option value="GHS">GHS (GH₵)</option>
              <option value="USD">USD ($)</option>
              <option value="GBP">GBP (£)</option>
              <option value="EUR">EUR (€)</option>
              <option value="NGN">NGN (₦)</option>
            </NativeSelect>
          </Field>
        </div>

        {/* Brand color & Receipt customization */}
        <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
          <Field label="Brand colour" htmlFor="inst-brand">
            <div className="flex items-center gap-2">
              <input
                id="inst-brand"
                type="color"
                value={form.brandPrimary || "#c2410c"}
                onChange={(e) => patch({ brandPrimary: e.target.value })}
                className="h-10 w-14 cursor-pointer rounded-xl border border-border bg-transparent p-1"
              />
              <Input
                value={form.brandPrimary || ""}
                onChange={(e) => patch({ brandPrimary: e.target.value })}
                placeholder="#c2410c"
                className="w-28 font-mono text-xs"
              />
            </div>
          </Field>

          <Field
            label="Bank / Mobile Money payment details (shown on invoices & receipts)"
            htmlFor="inst-bank"
          >
            <Input
              id="inst-bank"
              value={form.bankDetails}
              onChange={(e) => patch({ bankDetails: e.target.value })}
              placeholder="e.g. MTN MoMo: 024 000 0000 (Pinks Academy) · GCB Bank: 10111222333"
            />
          </Field>
        </div>

        <Field
          label="Official receipt footer message"
          htmlFor="inst-receipt-footer"
        >
          <Input
            id="inst-receipt-footer"
            value={form.receiptFooter}
            onChange={(e) => patch({ receiptFooter: e.target.value })}
            placeholder="e.g. Fees paid are non-refundable. Thank you for your payment."
          />
        </Field>

        <FormMessage
          error={save.isError ? friendlyError(save.error) : null}
          ok={save.isSuccess ? "Institution details saved." : null}
        />

        <Button
          type="submit"
          disabled={save.isPending || !form.name.trim()}
        >
          <Check className="size-4" aria-hidden />
          {save.isPending ? "Saving..." : "Save institution details"}
        </Button>
      </form>

      {/* Live Official Receipt Preview */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Receipt className="size-3.5 text-primary" aria-hidden />
          Live Receipt Header &amp; Footer Preview
        </div>

        <article className="surface overflow-hidden border border-border p-5 shadow-sm">
          <div
            className="-mx-5 -mt-5 mb-4 h-2"
            style={{
              background: form.brandPrimary || "var(--primary)",
            }}
          />

          <header className="flex items-start justify-between gap-3 border-b border-border pb-4">
            <div className="flex items-start gap-3">
              {form.logoUrl ? (
                <img
                  src={form.logoUrl}
                  alt={form.name || "Logo"}
                  className="size-12 shrink-0 rounded-xl border border-border bg-white object-contain p-1"
                />
              ) : (
                <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
                  <GraduationCap className="size-6" aria-hidden />
                </div>
              )}
              <div className="space-y-0.5">
                <h3 className="text-base font-bold uppercase tracking-tight">
                  {form.name || "School Name"}
                </h3>
                {form.motto ? (
                  <p className="text-xs italic text-muted-foreground">
                    “{form.motto}”
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 pt-1 text-[11px] text-muted-foreground">
                  {form.address ? (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="size-3" aria-hidden />
                      {form.address}
                    </span>
                  ) : null}
                  {form.phone ? (
                    <span className="inline-flex items-center gap-1">
                      <Phone className="size-3" aria-hidden />
                      {form.phone}
                    </span>
                  ) : null}
                  {form.email ? (
                    <span className="inline-flex items-center gap-1">
                      <Mail className="size-3" aria-hidden />
                      {form.email}
                    </span>
                  ) : null}
                  {form.website ? (
                    <span className="inline-flex items-center gap-1">
                      <Globe className="size-3" aria-hidden />
                      {form.website}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="text-right text-xs">
              <div className="font-bold uppercase tracking-wider text-primary">
                Official Receipt
              </div>
              <div className="font-mono text-[11px] text-muted-foreground">
                RCT/{new Date().getFullYear()}/000001
              </div>
              {form.taxOrRegNo ? (
                <div className="mt-0.5 text-[10px] text-muted-foreground">
                  Reg: {form.taxOrRegNo}
                </div>
              ) : null}
            </div>
          </header>

          <div className="my-4 space-y-2 rounded-xl border border-border/70 bg-foreground/[0.02] p-3 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Received from:</span>
              <span className="font-semibold">Sample Pupil (V/2026/0001)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Amount paid:</span>
              <span className="font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                {form.currency || "GHS"} 1,250.00
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Payment method:</span>
              <span>Mobile Money (MTN)</span>
            </div>
          </div>

          {form.bankDetails ? (
            <div className="mb-3 rounded-lg bg-foreground/[0.03] px-3 py-2 text-[11px] text-muted-foreground">
              <strong className="text-foreground">Payment accounts:</strong>{" "}
              {form.bankDetails}
            </div>
          ) : null}

          <footer className="border-t border-border pt-3 text-center text-[11px] italic text-muted-foreground">
            {form.receiptFooter ||
              "Fees paid are non-refundable. Thank you for your payment."}
          </footer>
        </article>
      </div>
    </div>
  );
}
