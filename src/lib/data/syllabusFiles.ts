// Syllabus documents (PDFs). The files sit in a private storage bucket, one folder per school; the database decides who
// may upload, list and read them. A file is opened through a short-lived link, never a public address.
import { supabase } from "../supabase";

const BUCKET = "syllabus-files";
export const MAX_SYLLABUS_BYTES = 10 * 1024 * 1024;

/** An error whose words are meant to be read, so the screen shows them as written. */
const saying = (message: string) => Object.assign(new Error(message), { code: "LPN01" });

export interface SyllabusDoc { id: string; subjectId: string; levelId: string; title: string; filePath: string; sizeBytes: number; createdAt: string }

export async function listSyllabusDocuments(): Promise<SyllabusDoc[]> {
  const { data, error } = await supabase.from("syllabus_documents").select("id, subject_id, level_id, title, file_path, size_bytes, created_at").order("created_at", { ascending: false }).limit(2000);
  if (error) throw error;
  return ((data ?? []) as { id: string; subject_id: string; level_id: string; title: string; file_path: string; size_bytes: number; created_at: string }[])
    .map((r) => ({ id: r.id, subjectId: r.subject_id, levelId: r.level_id, title: r.title, filePath: r.file_path, sizeBytes: Number(r.size_bytes), createdAt: r.created_at }));
}

/** Why a file cannot be used, or null if it can. Checks the real contents, not just the name. */
export async function problemWithFile(file: File): Promise<string | null> {
  if (file.size === 0) return "That file is empty.";
  if (file.size > MAX_SYLLABUS_BYTES) return "A syllabus file can be up to 10 MB.";
  const head = new TextDecoder().decode(await file.slice(0, 5).arrayBuffer());
  return head === "%PDF-" ? null : "That is not a PDF file.";
}

export async function uploadSyllabusDocument(schoolId: string, subjectId: string, levelId: string, title: string, file: File): Promise<void> {
  const problem = await problemWithFile(file);
  if (problem) throw saying(problem);
  const path = `${schoolId}/${subjectId}/${levelId}/${crypto.randomUUID()}.pdf`;
  const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: "application/pdf", upsert: false });
  if (up.error) throw saying("The file could not be uploaded. Check that it is a PDF under 10 MB and try again.");
  const { error } = await supabase.rpc("add_syllabus_document", { p_subject: subjectId, p_level: levelId, p_title: title, p_path: path });
  if (error) {
    // Do not leave an unlisted file behind.
    await supabase.storage.from(BUCKET).remove([path]);
    throw error;
  }
}

/** A link that works for one minute, for opening a document. */
export async function documentLink(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60);
  if (error || !data) throw saying("The document could not be opened.");
  return data.signedUrl;
}

export async function removeSyllabusDocument(doc: SyllabusDoc): Promise<void> {
  const rm = await supabase.storage.from(BUCKET).remove([doc.filePath]);
  if (rm.error) throw saying("The file could not be removed.");
  const { error } = await supabase.rpc("delete_syllabus_document", { p_id: doc.id });
  if (error) throw error;
}

export const sizeText = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
