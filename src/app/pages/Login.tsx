import { useState, useEffect, type FormEvent, type KeyboardEvent } from "react";
import { Navigate, useLocation } from "react-router";
import {
  AlertCircle,
  Eye,
  EyeOff,
  GraduationCap,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  Moon,
  ShieldCheck,
  Sparkles,
  Sun,
  Wifi,
} from "lucide-react";
import { useAuth } from "../../lib/auth/AuthProvider";
import { useTheme } from "../../theme/ThemeProvider";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { LegionLogo } from "../components/brand/LegionLogo";
import { LegionCrest } from "../components/brand/LegionCrest";
import { DevelopedByPhinova } from "../components/brand/DevelopedByPhinova";
import { cn } from "../components/ui/utils";

const REMEMBERED_EMAIL_KEY = "legion_remembered_email";

export default function Login() {
  const { status, signIn } = useAuth();
  const { mode, setMode } = useTheme();
  const location = useLocation();

  const [email, setEmail] = useState(() => {
    try {
      return localStorage.getItem(REMEMBERED_EMAIL_KEY) || "";
    } catch {
      return "";
    }
  });
  const [password, setPassword] = useState("");
  const [rememberEmail, setRememberEmail] = useState(() => {
    try {
      return Boolean(localStorage.getItem(REMEMBERED_EMAIL_KEY));
    } catch {
      return false;
    }
  });
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockActive, setCapsLockActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      if (rememberEmail && email.trim()) {
        localStorage.setItem(REMEMBERED_EMAIL_KEY, email.trim());
      } else if (!rememberEmail) {
        localStorage.removeItem(REMEMBERED_EMAIL_KEY);
      }
    } catch {
      // Ignore storage errors
    }
  }, [rememberEmail, email]);

  if (status === "signedIn") {
    const from = (location.state as { from?: string } | null)?.from ?? "/";
    return <Navigate to={from} replace />;
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.getModifierState && typeof e.getModifierState === "function") {
      setCapsLockActive(e.getModifierState("CapsLock"));
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const cleanEmail = email.trim();
    if (!cleanEmail || !password) return;

    setBusy(true);
    setError(null);
    const message = await signIn(cleanEmail, password);
    if (message) {
      setError(message);
    }
    setBusy(false);
  }

  return (
    <div className="relative min-h-dvh flex flex-col justify-between overflow-x-hidden bg-background text-foreground transition-colors duration-300">
      {/* Background ambient lighting */}
      <div className="pointer-events-none absolute -top-40 left-1/4 -z-10 size-96 rounded-full bg-primary/10 blur-[130px]" />
      <div className="pointer-events-none absolute bottom-0 right-10 -z-10 size-80 rounded-full bg-primary/15 blur-[140px]" />

      {/* Top utility bar */}
      <header className="flex items-center justify-between px-6 py-4 sm:px-10">
        <LegionLogo variant="compact" size="sm" animated />
        <button
          type="button"
          onClick={() => setMode(mode === "dark" ? "light" : "dark")}
          aria-label={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          className="inline-flex size-9 items-center justify-center rounded-full border border-border bg-foreground/5 text-muted-foreground transition-all hover:scale-105 hover:bg-foreground/10 hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
        >
          {mode === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </button>
      </header>

      {/* Main split showcase & login layout */}
      <main className="mx-auto flex w-full max-w-6xl flex-1 items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid w-full items-center gap-12 lg:grid-cols-12 lg:gap-8">
          {/* Left Column: Brand Showcase (Large displays) */}
          <section className="hidden space-y-8 lg:col-span-7 lg:block lg:pr-8">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3.5 py-1 text-xs font-semibold text-primary backdrop-blur-xs">
                <Sparkles className="size-3.5" aria-hidden />
                <span>Basic 1–9 &amp; BECE Operating System</span>
              </div>

              <h1 className="text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl lg:text-5xl">
                Unified intelligence for modern schools.
              </h1>

              <p className="max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                <strong className="font-semibold text-foreground">Legion</strong> streamlines Ghanaian &amp; international basic school administration with continuous assessments, automated BECE Stanine analytics, multi-tranche billing, and resilient offline attendance.
              </p>
            </div>

            {/* Feature Highlights Grid */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="surface p-4 transition-transform hover:-translate-y-0.5">
                <div className="flex items-center gap-3">
                  <div className="grid size-10 place-items-center rounded-xl bg-primary/15 text-primary">
                    <GraduationCap className="size-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Continuous Assessment</h3>
                    <p className="text-xs text-muted-foreground">Class tasks, mid-terms, terminal exams &amp; report cards.</p>
                  </div>
                </div>
              </div>

              <div className="surface p-4 transition-transform hover:-translate-y-0.5">
                <div className="flex items-center gap-3">
                  <div className="grid size-10 place-items-center rounded-xl bg-primary/15 text-primary">
                    <ShieldCheck className="size-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Multi-Tier Finance</h3>
                    <p className="text-xs text-muted-foreground">Batch term bills, installment plans &amp; audited vouchers.</p>
                  </div>
                </div>
              </div>

              <div className="surface p-4 transition-transform hover:-translate-y-0.5">
                <div className="flex items-center gap-3">
                  <div className="grid size-10 place-items-center rounded-xl bg-primary/15 text-primary">
                    <Sparkles className="size-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">WAEC 10-Digit Indices</h3>
                    <p className="text-xs text-muted-foreground">Automatic Best-6 calculations &amp; Stanine 1–9 rankings.</p>
                  </div>
                </div>
              </div>

              <div className="surface p-4 transition-transform hover:-translate-y-0.5">
                <div className="flex items-center gap-3">
                  <div className="grid size-10 place-items-center rounded-xl bg-primary/15 text-primary">
                    <Wifi className="size-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Offline-First PWA</h3>
                    <p className="text-xs text-muted-foreground">Take attendance without internet; syncs on reconnection.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Vintage point hallmark */}
            <div className="pt-2">
              <DevelopedByPhinova variant="vintage" />
            </div>
          </section>

          {/* Right Column: Authentication Card */}
          <section className="flex justify-center lg:col-span-5">
            <div className="surface relative w-full max-w-md p-6 sm:p-8 shadow-2xl backdrop-blur-xl border border-border/80">
              <div className="mb-6 flex flex-col items-center text-center">
                <div className="mb-3 grid size-16 place-items-center rounded-2xl bg-foreground/[0.03] border border-border/60 shadow-inner">
                  <LegionCrest size={46} animated />
                </div>
                <h2 className="text-2xl font-bold tracking-tight text-foreground">Sign in to Legion</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Use the institutional account provided by your school administration.
                </p>
              </div>

              <form onSubmit={onSubmit} className="space-y-4" noValidate>
                {/* Email field */}
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs font-medium text-foreground">
                    Email address
                  </Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                    <Input
                      id="email"
                      type="email"
                      autoComplete="username"
                      autoFocus={!email}
                      required
                      placeholder="name@school.edu.gh"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10 h-11 text-sm rounded-xl"
                    />
                  </div>
                </div>

                {/* Password field */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-xs font-medium text-foreground">
                      Password
                    </Label>
                    {capsLockActive ? (
                      <span className="text-[10px] font-semibold text-amber-500 uppercase tracking-wider">
                        Caps Lock ON
                      </span>
                    ) : null}
                  </div>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      required
                      placeholder="••••••••"
                      value={password}
                      onKeyDown={handleKeyDown}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10 pr-10 h-11 text-sm rounded-xl font-mono tracking-tight"
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md"
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>

                {/* Remember & security note */}
                <div className="flex items-center justify-between pt-1">
                  <label htmlFor="remember-email" className="flex items-center gap-2 text-xs text-muted-foreground select-none cursor-pointer">
                    <input
                      id="remember-email"
                      type="checkbox"
                      checked={rememberEmail}
                      onChange={(e) => setRememberEmail(e.target.checked)}
                      className="size-3.5 rounded border-border accent-primary cursor-pointer"
                    />
                    <span>Remember email</span>
                  </label>
                  <span className="text-[11px] text-muted-foreground/60 flex items-center gap-1">
                    <KeyRound className="size-3" /> End-to-end encrypted
                  </span>
                </div>

                {/* Error message */}
                {error ? (
                  <div
                    role="alert"
                    aria-live="polite"
                    className="flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
                  >
                    <AlertCircle className="size-4 shrink-0 mt-0.5" aria-hidden />
                    <span className="leading-snug">{error}</span>
                  </div>
                ) : null}

                {/* Submit button */}
                <Button
                  type="submit"
                  size="lg"
                  className="w-full h-11 rounded-xl text-sm font-semibold shadow-lg shadow-primary/20 transition-all duration-200 hover:shadow-primary/30"
                  disabled={busy || !email || !password}
                >
                  {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                  {busy ? "Authenticating…" : "Sign in to Dashboard"}
                </Button>
              </form>

              {/* Assistance & mobile hallmark */}
              <div className="mt-6 border-t border-border/60 pt-4 text-center">
                <p className="text-xs text-muted-foreground">
                  Forgot credentials or need assistance?{" "}
                  <span className="font-medium text-foreground underline-offset-4 hover:underline">
                    Contact your Headteacher
                  </span>
                </p>
                <div className="mt-4 lg:hidden flex justify-center">
                  <DevelopedByPhinova variant="minimal" />
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* Global vintage footer */}
      <footer className="border-t border-border/40 py-3 text-center text-xs text-muted-foreground">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 sm:px-10">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground">Legion</span>
            <span className="text-muted-foreground/40">·</span>
            <span className="text-[11px]">School Management System v2.4</span>
          </div>
          <DevelopedByPhinova variant="minimal" />
        </div>
      </footer>
    </div>
  );
}
