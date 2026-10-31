import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router";
import { Loader2 } from "lucide-react";
import { useAuth } from "../../lib/auth/AuthProvider";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

export default function ChangePassword() {
  const { mustChangePassword, changePassword, signOut } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Nothing to do here once a permanent password is set.
  if (!mustChangePassword && !busy) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setError("Use at least 8 characters.");
    if (password !== confirm) return setError("The two passwords do not match.");
    setBusy(true);
    setError(null);
    const message = await changePassword(password);
    setBusy(false);
    if (message) setError(message);
    else navigate("/", { replace: true });
  }

  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <form onSubmit={onSubmit} className="surface w-full max-w-sm space-y-5 p-6" noValidate>
        <div>
          <h1 className="text-xl font-semibold">Choose your password</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            You signed in with a temporary password. Choose one only you know before continuing.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="new">New password</Label>
          <Input id="new" type="password" autoComplete="new-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Repeat the password</Label>
          <Input id="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        <p role="alert" aria-live="polite" className="min-h-5 text-sm text-destructive">{error}</p>
        <div className="flex items-center gap-3">
          <Button type="submit" className="flex-1" disabled={busy || !password || !confirm}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {busy ? "Saving" : "Save password"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => void signOut()}>Sign out</Button>
        </div>
      </form>
    </main>
  );
}
