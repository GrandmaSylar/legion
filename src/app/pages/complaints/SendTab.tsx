import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, EyeOff } from "lucide-react";
import { submitComplaint } from "../../../lib/data/complaints";
import { ANONYMOUS_PROMISE, CATEGORIES, SAFEGUARDING_WARNING, type Category } from "../../../lib/complaints";
import { friendlyError } from "../../../lib/data/errors";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { Switch } from "../../components/ui/switch";
import { Field, FormMessage, NativeSelect } from "../../components/fields";

/** Raise a complaint, openly or anonymously. */
export function SendTab({ onSent }: { onSent: () => void }) {
  const qc = useQueryClient();
  const [category, setCategory] = useState<Category>("general");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const send = useMutation({
    mutationFn: () => submitComplaint(category, subject, body, anonymous),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["my-complaints"] }); setSubject(""); setBody(""); },
  });
  const help = CATEGORIES.find((c) => c.value === category)?.help;
  const tooShort = subject.trim().length < 3 || body.trim().length < 10;
  const submit = (e: FormEvent) => { e.preventDefault(); if (!tooShort) send.mutate(); };

  if (send.isSuccess) {
    return (
      <div role="status" className="surface space-y-3 p-5">
        <h2 className="text-lg font-semibold">Your complaint has been sent</h2>
        <p className="text-sm">Keep this reference: <strong className="tabular-nums">{send.data.ref}</strong></p>
        <p className="text-sm text-muted-foreground">
          {anonymous
            ? "Because you sent it anonymously, the school cannot see who you are. Come back to My complaints to read replies and answer them."
            : "The school will reply. You can read replies and answer them under My complaints."}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={onSent}>See my complaints</Button>
          <Button type="button" variant="ghost" onClick={() => send.reset()}>Send another</Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="surface space-y-4 p-4">
      <Field label="What is it about?" htmlFor="cm-cat">
        <NativeSelect id="cm-cat" value={category} onChange={(e) => setCategory(e.target.value as Category)}>
          {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </NativeSelect>
        {help ? <p className="mt-1 text-xs text-muted-foreground">{help}</p> : null}
      </Field>
      {category === "safeguarding" ? (
        <p role="note" className="flex gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />{SAFEGUARDING_WARNING}</p>
      ) : null}
      <Field label="A short title" htmlFor="cm-subject"><Input id="cm-subject" value={subject} maxLength={120} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. The side gate is left open" required /></Field>
      <Field label="What happened?" htmlFor="cm-body"><Textarea id="cm-body" rows={6} value={body} maxLength={4000} onChange={(e) => setBody(e.target.value)} placeholder="Say what happened, when, and who was involved if you know." required /></Field>

      <div className="space-y-2 rounded-xl border border-border p-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <label htmlFor="cm-anon" className="flex items-center gap-2 text-sm font-medium"><EyeOff className="size-4" aria-hidden /> Send it anonymously</label>
            <p className="text-xs text-muted-foreground">{anonymous ? ANONYMOUS_PROMISE : "The school will see your name with the complaint."}</p>
          </div>
          <Switch id="cm-anon" checked={anonymous} onCheckedChange={setAnonymous} aria-label={`Send it anonymously: ${anonymous ? "on" : "off"}`} />
        </div>
        {anonymous ? <p className="text-xs text-muted-foreground">Leave out your name and anything that would give you away in what you write, such as &quot;my son in Basic 4 whose mother works at the clinic&quot;.</p> : null}
      </div>

      <FormMessage error={send.isError ? friendlyError(send.error) : null} />
      <Button type="submit" disabled={send.isPending || tooShort}>{send.isPending ? "Sending" : "Send complaint"}</Button>
    </form>
  );
}
