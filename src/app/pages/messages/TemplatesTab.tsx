import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { countSegments, PLACEHOLDERS } from "../../../lib/sms";
import { deleteTemplate, listTemplates, saveTemplate, type Template } from "../../../lib/data/messaging";
import { friendlyError } from "../../../lib/data/errors";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";
import { DeleteButton } from "../../components/DeleteButton";
import { Field, FormMessage, controlClass } from "../../components/fields";
import { cn } from "../../components/ui/utils";
import { useMessagingRights } from "./useMessagingRights";

function TemplateForm({
  initial, onDone, onCancel,
}: { initial?: Template; onDone: () => void; onCancel: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(initial?.name ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const save = useMutation({
    mutationFn: () => saveTemplate({ id: initial?.id, name: name.trim(), body: body.trim() }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["message-templates"] }); onDone(); },
  });
  const seg = countSegments(body);
  const submit = (e: FormEvent) => { e.preventDefault(); save.mutate(); };
  const id = initial?.id ?? "new";

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-border p-3">
      <Field label="Name" htmlFor={`tpl-name-${id}`}>
        <Input id={`tpl-name-${id}`} value={name} onChange={(e) => setName(e.target.value)} required autoComplete="off" />
      </Field>
      <Field label="Message" htmlFor={`tpl-body-${id}`}>
        <textarea id={`tpl-body-${id}`} rows={4} value={body} maxLength={640} onChange={(e) => setBody(e.target.value)} required className={cn(controlClass, "h-auto min-h-24 py-2")} />
      </Field>
      <p className="text-xs text-muted-foreground">
        You can use {PLACEHOLDERS.map((p) => `{${p}}`).join(", ")}. {seg.length} characters · {seg.segments} SMS {seg.segments === 1 ? "part" : "parts"}.
      </p>
      <FormMessage error={save.isError ? friendlyError(save.error) : null} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={save.isPending || !name.trim() || !body.trim()}>{save.isPending ? "Saving" : "Save"}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

function Row({ t, canEdit }: { t: Template; canEdit: boolean }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const del = useMutation({
    mutationFn: () => deleteTemplate(t.id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["message-templates"] }),
  });
  return (
    <li className="surface space-y-2 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="break-words text-sm font-medium">{t.name}{t.isSystem ? <span className="ml-2 rounded-full bg-foreground/10 px-2 py-0.5 text-xs font-normal text-muted-foreground">Starter</span> : null}</h3>
        {canEdit ? (
          <span className="flex flex-wrap items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => setEditing((e) => !e)}>Edit</Button>
            {!t.isSystem ? <DeleteButton what={t.name} pending={del.isPending} error={del.isError ? friendlyError(del.error) : null} onConfirm={() => del.mutate()} /> : null}
          </span>
        ) : null}
      </div>
      <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{t.body}</p>
      {editing ? <TemplateForm initial={t} onDone={() => setEditing(false)} onCancel={() => setEditing(false)} /> : null}
    </li>
  );
}

export default function TemplatesTab() {
  const { canSendAll } = useMessagingRights();
  const templates = useQuery({ queryKey: ["message-templates"], queryFn: listTemplates });
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Standard wording you can start a message from. Words in curly brackets are filled in for each person.</p>
        {canSendAll && !adding ? <Button size="sm" variant="outline" onClick={() => setAdding(true)}><Plus className="size-4" aria-hidden /> New template</Button> : null}
      </div>
      {adding ? <div className="surface p-4"><TemplateForm onDone={() => setAdding(false)} onCancel={() => setAdding(false)} /></div> : null}
      {templates.isError ? <p role="alert" className="text-sm text-destructive">The templates could not be loaded.</p> : null}
      {templates.isLoading ? <Skeleton className="h-24 w-full" /> : null}
      <ul className="space-y-3">
        {templates.data?.map((t) => <Row key={t.id} t={t} canEdit={canSendAll} />)}
      </ul>
    </div>
  );
}
