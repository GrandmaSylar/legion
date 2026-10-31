// One screen for any customisable name list (subjects, learning areas): add,
// rename, and retire. Retired items stay in old records but disappear from new
// choices, so history is never broken.
import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Pencil, X } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Switch } from "../../components/ui/switch";
import { FormMessage } from "../../components/fields";
import { createItem, listItems, updateItem, type ListItem, type ListKind } from "../../../lib/data/setup";
import { friendlyError } from "../../../lib/data/errors";

function Row({ kind, item }: { kind: ListKind; item: ListItem }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const save = useMutation({
    mutationFn: (patch: { name?: string; isActive?: boolean }) => updateItem(kind, item.id, patch),
    onSuccess: () => { setEditing(false); void qc.invalidateQueries({ queryKey: [kind] }); },
  });

  return (
    <li className="flex items-center gap-3 px-3 py-2">
      {editing ? (
        <form
          className="flex flex-1 items-center gap-2"
          onSubmit={(e) => { e.preventDefault(); save.mutate({ name: name.trim() }); }}
        >
          <Input aria-label={`Rename ${item.name}`} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <Button type="submit" size="icon" variant="ghost" aria-label="Save name" disabled={!name.trim() || save.isPending}>
            <Check className="size-4" />
          </Button>
          <Button type="button" size="icon" variant="ghost" aria-label="Cancel" onClick={() => { setEditing(false); setName(item.name); }}>
            <X className="size-4" />
          </Button>
        </form>
      ) : (
        <>
          <span className={item.isActive ? "flex-1 text-sm" : "flex-1 text-sm text-muted-foreground line-through"}>
            {item.name}
          </span>
          <Button size="icon" variant="ghost" aria-label={`Rename ${item.name}`} onClick={() => setEditing(true)}>
            <Pencil className="size-4" />
          </Button>
          <Switch
            checked={item.isActive}
            aria-label={`${item.name} in use`}
            disabled={save.isPending}
            onCheckedChange={(v) => save.mutate({ isActive: v })}
          />
        </>
      )}
      {save.isError ? <span role="alert" className="text-xs text-destructive">{friendlyError(save.error)}</span> : null}
    </li>
  );
}

export default function ListTab({
  kind, singular, help,
}: { kind: ListKind; singular: string; help: string }) {
  const qc = useQueryClient();
  const items = useQuery({ queryKey: [kind], queryFn: () => listItems(kind) });
  const [name, setName] = useState("");
  const add = useMutation({
    mutationFn: (n: string) => createItem(kind, n),
    onSuccess: () => { setName(""); void qc.invalidateQueries({ queryKey: [kind] }); },
  });
  const submit = (e: FormEvent) => { e.preventDefault(); add.mutate(name.trim()); };

  return (
    <div className="max-w-xl space-y-4">
      <p className="text-sm text-muted-foreground">{help}</p>

      <form onSubmit={submit} className="flex items-start gap-2">
        <div className="flex-1 space-y-1">
          <Input aria-label={`New ${singular}`} value={name} onChange={(e) => setName(e.target.value)} placeholder={`New ${singular}`} />
          <FormMessage error={add.isError ? friendlyError(add.error) : null} />
        </div>
        <Button type="submit" disabled={add.isPending || !name.trim()}>Add</Button>
      </form>

      {items.isError ? <p role="alert" className="text-sm text-destructive">Could not load the list.</p> : null}
      {items.data?.length === 0 ? <p className="text-sm text-muted-foreground">Nothing here yet.</p> : null}
      {items.data && items.data.length > 0 ? (
        <ul className="surface divide-y divide-border">
          {items.data.map((item) => <Row key={item.id} kind={kind} item={item} />)}
        </ul>
      ) : null}
    </div>
  );
}
