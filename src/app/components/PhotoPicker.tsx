import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, Trash2 } from "lucide-react";
import { resizeToSquareJpeg } from "../../lib/image";
import { Button } from "./ui/button";
import { StudentAvatar } from "./StudentAvatar";

/**
 * Pick or take a photo. The image is cropped square and shrunk here, so the
 * parent only ever receives a small JPEG blob (or null when cleared).
 */
export function PhotoPicker({
  name, existingUrl, value, onChange, disabled,
}: {
  name: string;
  existingUrl?: string | null;
  value: Blob | null;
  onChange: (photo: Blob | null) => void;
  disabled?: boolean;
}) {
  const pick = useRef<HTMLInputElement>(null);
  const snap = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!value) { setPreview(null); return; }
    const url = URL.createObjectURL(value);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      onChange(await resizeToSquareJpeg(file));
    } catch {
      setError("That file could not be used as a photo. Try a JPEG or PNG.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <StudentAvatar name={name || "Student"} url={preview ?? existingUrl} className="size-20 text-xl" />
      <div className="min-w-[9rem] flex-1 space-y-2">
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" disabled={disabled || busy} onClick={() => snap.current?.click()}>
            <Camera className="size-4" aria-hidden /> Take photo
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={disabled || busy} onClick={() => pick.current?.click()}>
            <ImagePlus className="size-4" aria-hidden /> Choose file
          </Button>
          {value ? (
            <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => onChange(null)}>
              <Trash2 className="size-4" aria-hidden /> Remove
            </Button>
          ) : null}
        </div>
        <p role={error ? "alert" : undefined} className={error ? "text-sm text-destructive" : "text-xs text-muted-foreground"}>
          {error ?? "A clear, front-facing photo. It is cropped square and kept small."}
        </p>
      </div>
      <input ref={pick} type="file" accept="image/*" hidden onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} />
      <input ref={snap} type="file" accept="image/*" capture="user" hidden onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} />
    </div>
  );
}
