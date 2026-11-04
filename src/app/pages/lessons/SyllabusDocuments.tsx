import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, FileText, Trash2, Upload } from "lucide-react";
import { documentLink, listSyllabusDocuments, removeSyllabusDocument, sizeText, uploadSyllabusDocument, type SyllabusDoc } from "../../../lib/data/syllabusFiles";
import { friendlyError } from "../../../lib/data/errors";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { useCapabilities } from "../../../lib/access/useCapabilities";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";
import { FormMessage } from "../../components/fields";

/** PDF documents for a subject and level: read by staff, uploaded and removed by those who manage the syllabus. */
export function SyllabusDocuments({ subjectId, levelId, label }: { subjectId: string; levelId: string; label: string }) {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const { can } = useCapabilities();
  const canManage = can("lessons.manage_syllabus");
  const docs = useQuery({ queryKey: ["syllabus-documents"], queryFn: listSyllabusDocuments, staleTime: 15_000 });
  const mine = (docs.data ?? []).filter((d) => d.subjectId === subjectId && d.levelId === levelId);
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: ["syllabus-documents"] });
  const upload = useMutation({
    mutationFn: () => uploadSyllabusDocument(profile!.schoolId, subjectId, levelId, title || file!.name.replace(/\.pdf$/i, ""), file!),
    onSuccess: () => { setTitle(""); setFile(null); if (fileRef.current) fileRef.current.value = ""; refresh(); },
  });
  const open = useMutation({ mutationFn: async (d: SyllabusDoc) => { const url = await documentLink(d.filePath); window.open(url, "_blank", "noopener,noreferrer"); } });
  const remove = useMutation({ mutationFn: (d: SyllabusDoc) => removeSyllabusDocument(d), onSuccess: refresh });

  return (
    <section className="surface space-y-3 p-4" aria-label="Syllabus documents">
      <div>
        <h3 className="text-sm font-semibold">Documents for {label}</h3>
        <p className="text-xs text-muted-foreground">PDF files, up to 10 MB each, such as the official syllabus. Only staff can open them.</p>
      </div>
      {docs.isLoading ? <Skeleton className="h-10 w-full" /> : null}
      {docs.data && mine.length === 0 ? <p className="text-sm text-muted-foreground">No documents yet.</p> : null}
      <ul className="grid gap-2">
        {mine.map((d) => (
          <li key={d.id} className="flex items-center justify-between gap-2 rounded-xl border border-border p-3">
            <span className="flex min-w-0 items-start gap-2 text-sm"><FileText className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /><span className="min-w-0"><span className="block break-words font-medium">{d.title}</span><span className="block text-xs text-muted-foreground">{sizeText(d.sizeBytes)} · added {new Date(d.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span></span></span>
            <span className="flex shrink-0">
              <Button type="button" size="sm" variant="outline" disabled={open.isPending} onClick={() => open.mutate(d)}><ExternalLink className="size-4" aria-hidden /> Open</Button>
              {canManage ? <Button type="button" size="icon" variant="ghost" className="text-destructive" aria-label={`Remove ${d.title}`} disabled={remove.isPending} onClick={() => remove.mutate(d)}><Trash2 className="size-4" aria-hidden /></Button> : null}
            </span>
          </li>
        ))}
      </ul>
      {canManage ? (
        <div className="space-y-2 rounded-xl border border-border p-3">
          <input ref={fileRef} type="file" accept="application/pdf,.pdf" aria-label="PDF file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-background file:px-3 file:py-1.5" />
          <Input aria-label="Title" placeholder="Title (optional, the file name is used if empty)" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
          <Button type="button" size="sm" disabled={!file || upload.isPending} onClick={() => upload.mutate()}><Upload className="size-4" aria-hidden /> {upload.isPending ? "Uploading" : "Upload"}</Button>
        </div>
      ) : null}
      <FormMessage error={upload.isError ? friendlyError(upload.error) : open.isError ? friendlyError(open.error) : remove.isError ? friendlyError(remove.error) : null} />
    </section>
  );
}
