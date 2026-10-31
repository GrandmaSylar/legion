import { useState, type FormEvent } from "react";
import { Navigate, useLocation } from "react-router";
import { Loader2 } from "lucide-react";
import { useAuth } from "../../lib/auth/AuthProvider";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

export default function Login() {
  const { status, signIn } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (status === "signedIn") {
    const from = (location.state as { from?: string } | null)?.from ?? "/";
    return <Navigate to={from} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const message = await signIn(email.trim(), password);
    if (message) setError(message);
    setBusy(false);
  }

  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <form onSubmit={onSubmit} className="surface w-full max-w-sm space-y-5 p-6" noValidate>
        <div>
          <h1 className="text-xl font-semibold">Sign in</h1>
          <p className="mt-1 text-sm text-muted-foreground">Use the account your school gave you.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            autoFocus
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <p role="alert" aria-live="polite" className="min-h-5 text-sm text-destructive">
          {error}
        </p>

        <Button type="submit" className="w-full" disabled={busy || !email || !password}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {busy ? "Signing in" : "Sign in"}
        </Button>
      </form>
    </main>
  );
}
