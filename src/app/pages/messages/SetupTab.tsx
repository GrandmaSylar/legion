import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CircleAlert, RefreshCw } from "lucide-react";
import { countSegments, normalizePhone } from "../../../lib/sms";
import { getSenderSetting, getSmsStatus, saveSenderSetting, sendTest } from "../../../lib/data/messaging";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Field, FormMessage, controlClass } from "../../components/fields";
import { cn } from "../../components/ui/utils";
import { useMessagingRights } from "./useMessagingRights";

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong. Please try again.";
}

function SenderForm({ serverSender }: { serverSender: string | null | undefined }) {
  const qc = useQueryClient();
  const saved = useQuery({ queryKey: ["sender-setting"], queryFn: getSenderSetting });
  const [value, setValue] = useState<string | null>(null);
  const shown = value ?? saved.data ?? "";
  const save = useMutation({
    mutationFn: () => saveSenderSetting(shown),
    onSuccess: () => {
      setValue(null);
      void qc.invalidateQueries({ queryKey: ["sender-setting"] });
      void qc.invalidateQueries({ queryKey: ["sms-status"] });
    },
  });
  const submit = (e: FormEvent) => { e.preventDefault(); save.mutate(); };
  return (
    <form onSubmit={submit} className="space-y-3 border-t border-border pt-3">
      <Field label="Sender ID" htmlFor="sender-id">
        <Input id="sender-id" value={shown} maxLength={11} autoComplete="off" placeholder={serverSender ?? "e.g. PinksAcad"} onChange={(e) => setValue(e.target.value.replace(/\s/g, ""))} />
      </Field>
      <p className="text-xs text-muted-foreground">
        What parents see as the sender: 3 to 11 letters or numbers. Arkesel must approve it in their dashboard before it delivers.
        {serverSender ? " Leave it empty to use the server default." : ""}
      </p>
      <FormMessage error={save.isError ? errorText(save.error) : null} ok={save.isSuccess && value === null ? "Saved." : null} />
      <Button type="submit" size="sm" disabled={save.isPending || saved.isLoading || value === null}>{save.isPending ? "Saving" : "Save sender ID"}</Button>
    </form>
  );
}

export default function SetupTab() {
  const { canSendAll } = useMessagingRights();
  const status = useQuery({ queryKey: ["sms-status"], queryFn: getSmsStatus, staleTime: 30_000, retry: false });
  const s = status.data;

  const [to, setTo] = useState("");
  const [text, setText] = useState("");
  const [dry, setDry] = useState(true);
  const test = useMutation({ mutationFn: () => sendTest(to, text.trim(), dry || !!s?.sandboxForced) });
  const submit = (e: FormEvent) => { e.preventDefault(); test.mutate(); };
  const phone = normalizePhone(to);
  const seg = countSegments(text);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="surface space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-medium">Connection</h2>
          <Button size="sm" variant="ghost" disabled={status.isFetching} onClick={() => void status.refetch()}>
            <RefreshCw className={cn("size-4", status.isFetching && "animate-spin")} aria-hidden /> Check again
          </Button>
        </div>

        {status.isLoading ? <p className="text-sm text-muted-foreground">Checking…</p> : null}
        {status.isError ? <p role="alert" className="text-sm text-destructive">{errorText(status.error)}</p> : null}

        {s && s.configured ? (
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" aria-hidden /> Arkesel is connected.</li>
            <li>Sender ID in use: <strong className="break-all">{s.sender}</strong>{s.senderSource === "server" ? <span className="text-muted-foreground"> (server default)</span> : null}</li>
            <li>
              Balance:{" "}
              {s.balance != null ? <strong className="tabular-nums">{s.balance} SMS credits</strong> : <span className="text-muted-foreground">{s.balanceError ?? "not available"}</span>}
            </li>
            {s.sandboxForced ? (
              <li className="rounded-xl bg-amber-500/10 p-3 text-amber-800 dark:text-amber-200">
                Dry-run mode is switched on for the whole system, so nothing is delivered or charged until it is turned off.
              </li>
            ) : null}
          </ul>
        ) : null}

        {s && !s.configured ? (
          <div className="space-y-2 text-sm">
            <p className="flex items-start gap-2"><CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden /> SMS is not connected yet.</p>
            <p className="text-muted-foreground">
              {!s.keyPresent ? <>A developer saves the Arkesel key once on the server as <code className="break-all">ARKESEL_API_KEY</code>; it never reaches this browser. </> : null}
              {!s.sender ? "Set the sender ID below." : null}
            </p>
          </div>
        ) : null}

        {s && canSendAll ? <SenderForm serverSender={s.serverSender} /> : null}
      </section>

      {canSendAll ? (
        <form onSubmit={submit} className="surface space-y-4 p-4">
          <h2 className="text-base font-medium">Send a test message</h2>
          <p className="text-sm text-muted-foreground">One message to one number, showing exactly what Arkesel replies. Use a dry run first.</p>
          <Field label="Phone number" htmlFor="test-to">
            <Input id="test-to" type="tel" inputMode="tel" value={to} onChange={(e) => setTo(e.target.value)} placeholder="024 412 3456" autoComplete="off" required />
          </Field>
          {to && !phone ? <p className="text-xs text-destructive">That number does not look right.</p> : null}
          <Field label="Message (optional)" htmlFor="test-text">
            <textarea id="test-text" rows={3} value={text} maxLength={640} onChange={(e) => setText(e.target.value)} placeholder="Leave empty for a standard test message" className={cn(controlClass, "h-auto min-h-20 py-2")} />
          </Field>
          {text ? <p className="text-xs tabular-nums text-muted-foreground">{seg.length} characters · {seg.segments} SMS {seg.segments === 1 ? "part" : "parts"}</p> : null}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={dry || !!s?.sandboxForced} disabled={!!s?.sandboxForced} onChange={(e) => setDry(e.target.checked)} className="size-4 accent-[var(--primary)]" />
            Dry run (Arkesel accepts it but nothing is delivered or charged)
          </label>
          <FormMessage error={test.isError ? errorText(test.error) : null} />
          <Button type="submit" disabled={test.isPending || !phone || s?.configured === false}>{test.isPending ? "Sending" : dry ? "Send dry run" : "Send for real"}</Button>

          {test.data ? (
            <div className="space-y-2 rounded-xl border border-border p-3 text-sm" role="status">
              <p>
                Result: <strong>{test.data.status}</strong>{test.data.sandbox ? " (dry run)" : ""}
              </p>
              {test.data.error ? <p className="text-destructive">{test.data.error}</p> : null}
              <details>
                <summary className="cursor-pointer text-xs text-muted-foreground">What Arkesel replied</summary>
                <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-foreground/5 p-2 text-xs">{JSON.stringify(test.data.provider_response, null, 2)}</pre>
              </details>
            </div>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
