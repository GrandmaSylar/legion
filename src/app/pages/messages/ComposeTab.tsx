import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { countSegments, PLACEHOLDERS } from "../../../lib/sms";
import { listAcademicYears, listClasses } from "../../../lib/data/setup";
import {
  AUDIENCE_LABELS, continueBatch, getSmsStatus, listTemplates, previewMessage, sendMessage,
  type Audience, type Draft, type SendResult,
} from "../../../lib/data/messaging";
import { Button } from "../../components/ui/button";
import { Textarea } from "../../components/ui/textarea";
import { Field, FormMessage, NativeSelect, controlClass } from "../../components/fields";
import { cn } from "../../components/ui/utils";
import { useMessagingRights } from "./useMessagingRights";

const ALL_AUDIENCES = Object.keys(AUDIENCE_LABELS) as Audience[];

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong. Please try again.";
}

export default function ComposeTab() {
  const qc = useQueryClient();
  const { feeOnly } = useMessagingRights();
  const audiences = feeOnly ? (["fee_balance"] as Audience[]) : ALL_AUDIENCES;

  const status = useQuery({ queryKey: ["sms-status"], queryFn: getSmsStatus, staleTime: 60_000, retry: false });
  const templates = useQuery({ queryKey: ["message-templates"], queryFn: listTemplates });
  const years = useQuery({ queryKey: ["academic-years"], queryFn: listAcademicYears });
  const year = years.data?.find((y) => y.isCurrent) ?? null;
  const classes = useQuery({ queryKey: ["classes", year?.id], queryFn: () => listClasses(year!.id), enabled: !!year });

  const [audience, setAudience] = useState<Audience>(audiences[0]);
  const [classId, setClassId] = useState("");
  const [customNumbers, setCustomNumbers] = useState("");
  const [templateKey, setTemplateKey] = useState("");
  const [body, setBody] = useState("");
  const [sandbox, setSandbox] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<SendResult | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  const draft: Draft = {
    audience, body, templateKey: templateKey || undefined,
    classId: audience === "class_parents" ? classId : undefined,
    customNumbers: audience === "custom" ? customNumbers : undefined,
  };

  const preview = useMutation({ mutationFn: () => previewMessage(draft) });
  const send = useMutation({
    mutationFn: async () => {
      let r = await sendMessage({ ...draft, sandbox });
      // A big send may not finish in one go; keep going until the queue is empty.
      for (let i = 0; i < 30 && r.remaining > 0; i++) {
        setProgress(`Sending… ${r.remaining} still to go`);
        const next = await continueBatch(r.batchId);
        r = { ...r, sent: r.sent + next.sent, failed: r.failed + next.failed, remaining: next.remaining };
      }
      return r;
    },
    onSuccess: (r) => {
      setResult(r);
      setConfirming(false);
      setProgress(null);
      void qc.invalidateQueries({ queryKey: ["message-batches"] });
      void qc.invalidateQueries({ queryKey: ["sms-status"] });
    },
    onError: () => setProgress(null),
  });

  // Any change to the draft makes an earlier preview untrustworthy.
  const touch = () => {
    preview.reset();
    setConfirming(false);
    setResult(null);
  };

  const pickTemplate = (key: string) => {
    setTemplateKey(key);
    const t = templates.data?.find((x) => x.key === key);
    if (t) setBody(t.body);
    touch();
  };

  const insert = (token: string) => {
    const el = box.current;
    const at = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? body.length;
    setBody(body.slice(0, at) + `{${token}}` + body.slice(end));
    touch();
    requestAnimationFrame(() => el?.focus());
  };

  const seg = countSegments(body);
  const ready = body.trim().length > 0 && (audience !== "class_parents" || !!classId) && (audience !== "custom" || customNumbers.trim().length > 0);
  const p = preview.data;
  const needsCredit = p && status.data?.balance != null && p.parts > status.data.balance;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-4">
        {status.data && !status.data.configured ? (
          <section className="surface flex items-start gap-3 p-4 text-sm" role="status">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden />
            <span>SMS is not connected yet, so you can preview a message but not send it. See the Setup tab.</span>
          </section>
        ) : null}

        <section className="surface space-y-4 p-4">
          <h2 className="text-base font-medium">Who is it for?</h2>
          <Field label="Recipients" htmlFor="msg-audience">
            <NativeSelect id="msg-audience" value={audience} onChange={(e) => { setAudience(e.target.value as Audience); touch(); }}>
              {audiences.map((a) => <option key={a} value={a}>{AUDIENCE_LABELS[a]}</option>)}
            </NativeSelect>
          </Field>
          {audience === "class_parents" ? (
            <Field label="Class" htmlFor="msg-class">
              <NativeSelect id="msg-class" value={classId} onChange={(e) => { setClassId(e.target.value); touch(); }}>
                <option value="">Choose a class</option>
                {classes.data?.map((c) => <option key={c.id} value={c.id}>{c.levelName} {c.section}</option>)}
              </NativeSelect>
            </Field>
          ) : null}
          {audience === "custom" ? (
            <Field label="Phone numbers (one per line, or separated by commas)" htmlFor="msg-numbers">
              <Textarea id="msg-numbers" rows={3} value={customNumbers} onChange={(e) => { setCustomNumbers(e.target.value); touch(); }} placeholder={"024 412 3456\n020 123 4567"} />
            </Field>
          ) : null}
          {feeOnly ? <p className="text-xs text-muted-foreground">As accountant you can send fee reminders to parents who owe.</p> : null}
        </section>

        <section className="surface space-y-4 p-4">
          <h2 className="text-base font-medium">What should it say?</h2>
          <Field label="Start from a template (optional)" htmlFor="msg-template">
            <NativeSelect id="msg-template" value={templateKey} onChange={(e) => pickTemplate(e.target.value)}>
              <option value="">Write my own</option>
              {templates.data?.filter((t) => t.isActive).map((t) => <option key={t.id} value={t.key}>{t.name}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Message" htmlFor="msg-body">
            <textarea id="msg-body" ref={box} rows={5} value={body} onChange={(e) => { setBody(e.target.value); touch(); }} placeholder="Dear {parent}, …" maxLength={640} className={cn(controlClass, "h-auto min-h-28 py-2")} />
          </Field>
          <div className="flex flex-wrap items-center gap-2" aria-label="Insert a placeholder">
            <span className="text-xs text-muted-foreground">Fill in automatically:</span>
            {PLACEHOLDERS.map((ph) => (
              <button
                key={ph} type="button" onClick={() => insert(ph)}
                className="rounded-full border border-border bg-foreground/5 px-2.5 py-1 text-xs transition-colors hover:bg-foreground/10 focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
              >
                {`{${ph}}`}
              </button>
            ))}
          </div>
          <p className="text-xs tabular-nums text-muted-foreground">
            {seg.length} characters · {seg.segments} SMS {seg.segments === 1 ? "part" : "parts"} each ({seg.encoding}). Names and amounts change the length, so check the preview.
          </p>
        </section>

        <FormMessage error={preview.isError ? errorText(preview.error) : send.isError ? errorText(send.error) : null} />

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" disabled={!ready || preview.isPending} onClick={() => preview.mutate()}>
            {preview.isPending ? "Checking" : "Preview"}
          </Button>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={sandbox || !!status.data?.sandboxForced} disabled={!!status.data?.sandboxForced} onChange={(e) => setSandbox(e.target.checked)} className="size-4 accent-[var(--primary)]" />
            Dry run (nothing is delivered or charged)
          </label>
        </div>
      </div>

      <aside className="space-y-4">
        {result ? (
          <section className="surface space-y-2 p-4" role="status">
            <h2 className="flex items-center gap-2 text-base font-medium"><CheckCircle2 className="size-4 text-emerald-500" aria-hidden /> Sent</h2>
            <p className="text-sm">{result.sent} sent{result.failed ? `, ${result.failed} failed` : ""} out of {result.total}.</p>
            <p className="text-xs text-muted-foreground">Open History to check delivery.</p>
          </section>
        ) : null}

        {p ? (
          <section className="surface space-y-3 p-4">
            <h2 className="text-base font-medium">Preview</h2>
            <p className="text-sm tabular-nums">
              <strong>{p.count}</strong> {p.count === 1 ? "person" : "people"} · <strong>{p.parts}</strong> SMS {p.parts === 1 ? "part" : "parts"} in total
            </p>
            {p.skipped.badPhone + p.skipped.duplicate > 0 ? (
              <p className="text-xs text-muted-foreground">
                Skipped: {p.skipped.badPhone ? `${p.skipped.badPhone} with a number that does not look right` : ""}
                {p.skipped.badPhone && p.skipped.duplicate ? ", " : ""}
                {p.skipped.duplicate ? `${p.skipped.duplicate} duplicate${p.skipped.duplicate === 1 ? "" : "s"}` : ""}.
              </p>
            ) : null}
            {p.count === 0 ? <p className="text-sm text-muted-foreground">Nobody matches this choice right now.</p> : null}
            <ul className="space-y-2">
              {p.sample.map((s, i) => (
                <li key={i} className="rounded-xl border border-border p-3 text-sm">
                  <div className="mb-1 text-xs text-muted-foreground">To {s.name || "number"} · {s.phone}</div>
                  <p className="whitespace-pre-wrap break-words">{s.text}</p>
                  <div className="mt-1 text-xs tabular-nums text-muted-foreground">{s.segments} {s.segments === 1 ? "part" : "parts"}</div>
                </li>
              ))}
            </ul>
            {needsCredit ? <p className="text-sm text-destructive" role="alert">This needs {p.parts} SMS credits and you have {status.data?.balance}.</p> : null}

            {p.count > 0 && !confirming ? (
              <Button disabled={send.isPending || status.data?.configured === false} onClick={() => setConfirming(true)}>
                Send to {p.count} {p.count === 1 ? "person" : "people"}
              </Button>
            ) : null}
            {confirming ? (
              <div className="space-y-2 rounded-xl border border-primary/40 bg-primary/5 p-3">
                <p className="text-sm font-medium">
                  {sandbox || status.data?.sandboxForced ? "Dry run: " : ""}Send to {p.count} {p.count === 1 ? "person" : "people"} ({p.parts} SMS {p.parts === 1 ? "part" : "parts"})?
                </p>
                {!(sandbox || status.data?.sandboxForced) ? <p className="text-xs text-muted-foreground">Real messages cannot be recalled once sent.</p> : null}
                <div className="flex gap-2">
                  <Button size="sm" disabled={send.isPending} onClick={() => send.mutate()}>{send.isPending ? "Sending" : "Yes, send"}</Button>
                  <Button size="sm" variant="ghost" disabled={send.isPending} onClick={() => setConfirming(false)}>Cancel</Button>
                </div>
                {progress ? <p role="status" className="text-xs text-muted-foreground">{progress}</p> : null}
              </div>
            ) : null}
          </section>
        ) : (
          <section className="surface p-4 text-sm text-muted-foreground">
            Choose who it is for and write the message, then press Preview to see exactly what each person will read.
          </section>
        )}
      </aside>
    </div>
  );
}
