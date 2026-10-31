// Create a user, or edit one: details, roles, and which sections are switched on.
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Copy, RefreshCw } from "lucide-react";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { ROLE_LABELS, assignableModules, type AppRole } from "../../../lib/permissions";
import {
  createUser, deleteUser, generateTempPassword, getUser, listUnlinkedGuardians, listUnlinkedStudents,
  resetUserPassword, setUserActive, updateUser, type UserRow,
} from "../../../lib/data/users";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";
import { Field, FormMessage, NativeSelect } from "../../components/fields";

const STAFF: AppRole[] = ["school_admin", "principal", "teacher", "hr_officer", "accountant", "librarian", "receptionist"];
const BASE_ROLES: AppRole[] = [...STAFF, "parent", "student"];

function message(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong. Please try again.";
}

function CheckRow({
  id, checked, onChange, disabled, children,
}: { id: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-sm">
      <input
        id={id} type="checkbox" checked={checked} disabled={disabled}
        onChange={(e) => onChange(e.target.checked)} className="size-4 accent-[var(--primary)]"
      />
      {children}
    </label>
  );
}

function PasswordField({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">Temporary password</label>
      <div className="flex gap-2">
        <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} autoComplete="off" className="font-mono" />
        <Button type="button" variant="outline" size="icon" aria-label="Generate a password" onClick={() => onChange(generateTempPassword())}>
          <RefreshCw className="size-4" />
        </Button>
        <Button
          type="button" variant="outline" size="icon" aria-label="Copy the password" disabled={!value}
          onClick={() => { void navigator.clipboard?.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}
        >
          <Copy className="size-4" />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground" role="status">
        {copied ? "Copied." : "At least 8 characters. They will be asked to choose their own the first time they sign in."}
      </p>
    </div>
  );
}

function RolesAndModules({
  roles, setRoles, modules, setModules, canGrantDeveloper, disabled, lockedDeveloper,
}: {
  roles: AppRole[]; setRoles: (r: AppRole[]) => void;
  modules: string[] | null; setModules: (m: string[] | null) => void;
  canGrantDeveloper: boolean; disabled: boolean; lockedDeveloper: boolean;
}) {
  const options = canGrantDeveloper ? (["developer", ...BASE_ROLES] as AppRole[]) : BASE_ROLES;
  const sections = assignableModules(roles);
  const toggleRole = (r: AppRole, on: boolean) => {
    const next = on ? [...roles, r] : roles.filter((x) => x !== r);
    setRoles(next);
    // Keep the section list inside what the remaining roles allow.
    if (modules) setModules(modules.filter((m) => assignableModules(next).some((s) => s.id === m)));
  };
  return (
    <>
      <section className="surface space-y-3 p-4">
        <h2 className="text-base font-medium">Roles</h2>
        <p className="text-sm text-muted-foreground">A role decides what data the person can reach.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {options.map((r) => (
            <CheckRow
              key={r} id={`role-${r}`} checked={roles.includes(r)}
              disabled={disabled || (r === "developer" && lockedDeveloper)}
              onChange={(on) => toggleRole(r, on)}
            >
              {ROLE_LABELS[r]}
            </CheckRow>
          ))}
        </div>
      </section>

      <section className="surface space-y-3 p-4">
        <h2 className="text-base font-medium">Sections</h2>
        <p className="text-sm text-muted-foreground">
          Switch sections off to hide them from this person. A section can only be on if their role allows it.
        </p>
        <CheckRow id="all-modules" checked={modules === null} disabled={disabled} onChange={(all) => setModules(all ? null : sections.map((s) => s.id))}>
          Everything their role allows
        </CheckRow>
        {modules !== null ? (
          <div className="grid gap-2 border-t border-border pt-3 sm:grid-cols-2">
            {sections.length === 0 ? <p className="text-sm text-muted-foreground">Choose a role first.</p> : null}
            {sections.map((s) => (
              <CheckRow
                key={s.id} id={`mod-${s.id}`} checked={modules.includes(s.id)} disabled={disabled}
                onChange={(on) => setModules(on ? [...modules, s.id] : modules.filter((m) => m !== s.id))}
              >
                {s.label}
              </CheckRow>
            ))}
          </div>
        ) : null}
      </section>
    </>
  );
}

// ─── Create ──────────────────────────────────────────────────────────────────

function CreateUser() {
  const qc = useQueryClient();
  const { roles: myRoles } = useAuth();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [modules, setModules] = useState<string[] | null>(null);
  const [password, setPassword] = useState(() => generateTempPassword());
  const [guardianId, setGuardianId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [done, setDone] = useState<{ email: string; password: string } | null>(null);

  const wantsParent = roles.includes("parent");
  const wantsStudent = roles.includes("student");
  const guardians = useQuery({ queryKey: ["unlinked-guardians"], queryFn: listUnlinkedGuardians, enabled: wantsParent });
  const students = useQuery({ queryKey: ["unlinked-students"], queryFn: listUnlinkedStudents, enabled: wantsStudent });

  const create = useMutation({
    mutationFn: () =>
      createUser({
        email: email.trim(), fullName: fullName.trim(), phone: phone.trim(), tempPassword: password,
        roles, modules, guardianId: wantsParent ? guardianId || undefined : undefined,
        studentId: wantsStudent ? studentId || undefined : undefined,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["users"] });
      void qc.invalidateQueries({ queryKey: ["unlinked-guardians"] });
      void qc.invalidateQueries({ queryKey: ["unlinked-students"] });
      setDone({ email: email.trim(), password });
    },
  });

  if (done) {
    return (
      <section className="surface space-y-3 p-5" role="status">
        <h2 className="text-lg font-semibold">User created</h2>
        <p className="text-sm">Give {done.email} this temporary password. They will choose their own when they first sign in.</p>
        <p className="rounded-md bg-foreground/5 px-3 py-2 font-mono text-sm">{done.password}</p>
        <p className="text-xs text-muted-foreground">It is not shown again.</p>
        <div className="flex gap-2">
          <Button asChild><Link to="/users">Done</Link></Button>
          <Button
            variant="outline"
            onClick={() => { setDone(null); setEmail(""); setFullName(""); setPhone(""); setRoles([]); setModules(null); setPassword(generateTempPassword()); setGuardianId(""); setStudentId(""); create.reset(); }}
          >
            Add another
          </Button>
        </div>
      </section>
    );
  }

  const ready = email.trim() && fullName.trim() && roles.length > 0 && password.length >= 8;
  return (
    <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="space-y-4">
      <section className="surface space-y-4 p-4">
        <h2 className="text-base font-medium">Details</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name" htmlFor="name"><Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} required autoComplete="off" /></Field>
          <Field label="Email" htmlFor="email"><Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="off" /></Field>
          <Field label="Phone (optional)" htmlFor="phone"><Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="off" /></Field>
        </div>
        <PasswordField id="temp" value={password} onChange={setPassword} />
      </section>

      <RolesAndModules
        roles={roles} setRoles={setRoles} modules={modules} setModules={setModules}
        canGrantDeveloper={myRoles.includes("developer")} disabled={false} lockedDeveloper={false}
      />

      {wantsParent ? (
        <section className="surface space-y-2 p-4">
          <h2 className="text-base font-medium">Parent record</h2>
          <Field label="Link to a registered parent or guardian" htmlFor="guardian">
            <NativeSelect id="guardian" value={guardianId} onChange={(e) => setGuardianId(e.target.value)}>
              <option value="">Do not link yet</option>
              {guardians.data?.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
            </NativeSelect>
          </Field>
          <p className="text-xs text-muted-foreground">Linking lets them see their own children's records.</p>
        </section>
      ) : null}
      {wantsStudent ? (
        <section className="surface space-y-2 p-4">
          <h2 className="text-base font-medium">Student record</h2>
          <Field label="Link to a student" htmlFor="student">
            <NativeSelect id="student" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
              <option value="">Do not link yet</option>
              {students.data?.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </NativeSelect>
          </Field>
        </section>
      ) : null}
      {roles.some((r) => STAFF.includes(r)) ? (
        <p className="text-xs text-muted-foreground">A staff record is created automatically so classes and subjects can be assigned to this person.</p>
      ) : null}

      <FormMessage error={create.isError ? message(create.error) : null} />
      <div className="flex gap-2">
        <Button type="submit" disabled={create.isPending || !ready}>{create.isPending ? "Creating" : "Create user"}</Button>
        <Button type="button" variant="ghost" asChild><Link to="/users">Cancel</Link></Button>
      </div>
    </form>
  );
}

// ─── Edit ────────────────────────────────────────────────────────────────────

function EditUser({ user }: { user: UserRow }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { roles: myRoles, profile } = useAuth();
  const iAmDev = myRoles.includes("developer");
  const isSelf = profile?.id === user.id;
  const targetPrivileged = user.roles.includes("developer") || user.roles.includes("super_admin");
  const readOnly = targetPrivileged && !iAmDev;

  const [fullName, setFullName] = useState(user.fullName);
  const [phone, setPhone] = useState(user.phone ?? "");
  const [roles, setRoles] = useState<AppRole[]>(user.roles);
  const [modules, setModules] = useState<string[] | null>(user.modules);
  const [resetPw, setResetPw] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["users"] });
    void qc.invalidateQueries({ queryKey: ["staff"] });
  };
  const save = useMutation({ mutationFn: () => updateUser(user.id, { fullName: fullName.trim(), phone: phone.trim(), roles, modules }), onSuccess: refresh });
  const active = useMutation({ mutationFn: (a: boolean) => setUserActive(user.id, a), onSuccess: refresh });
  const reset = useMutation({ mutationFn: () => resetUserPassword(user.id, resetPw), onSuccess: () => setResetPw("") });
  const remove = useMutation({ mutationFn: () => deleteUser(user.id), onSuccess: () => { refresh(); navigate("/users"); } });

  return (
    <div className="space-y-4">
      {readOnly ? (
        <p role="status" className="surface p-3 text-sm">Only a developer can change this account.</p>
      ) : null}

      <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-4">
        <section className="surface space-y-4 p-4">
          <h2 className="text-base font-medium">Details</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Full name" htmlFor="name"><Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} disabled={readOnly} required /></Field>
            <Field label="Email" htmlFor="email"><Input id="email" value={user.email ?? ""} readOnly tabIndex={-1} /></Field>
            <Field label="Phone" htmlFor="phone"><Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={readOnly} /></Field>
          </div>
        </section>
        <RolesAndModules
          roles={roles} setRoles={setRoles} modules={modules} setModules={setModules}
          canGrantDeveloper={iAmDev} disabled={readOnly} lockedDeveloper={isSelf}
        />
        <FormMessage error={save.isError ? message(save.error) : null} ok={save.isSuccess ? "Saved" : null} />
        {!readOnly ? <Button type="submit" disabled={save.isPending || !fullName.trim() || roles.length === 0}>{save.isPending ? "Saving" : "Save changes"}</Button> : null}
      </form>

      {!readOnly && !isSelf ? (
        <section className="surface space-y-4 p-4">
          <h2 className="text-base font-medium">Account</h2>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm">
              {user.isActive
                ? "Deactivating signs them out and stops all access. Their history is kept."
                : "This account is deactivated and cannot sign in."}
            </p>
            <Button variant="outline" size="sm" disabled={active.isPending} onClick={() => active.mutate(!user.isActive)}>
              {user.isActive ? "Deactivate" : "Reactivate"}
            </Button>
          </div>
          <FormMessage error={active.isError ? message(active.error) : null} />

          <div className="space-y-2 border-t border-border pt-4">
            <PasswordField id="reset" value={resetPw} onChange={setResetPw} />
            <FormMessage error={reset.isError ? message(reset.error) : null} ok={reset.isSuccess ? "Password reset. Give them the new temporary password." : null} />
            <Button variant="outline" size="sm" disabled={reset.isPending || resetPw.length < 8} onClick={() => reset.mutate()}>Reset password</Button>
          </div>

          {iAmDev ? (
            <div className="space-y-2 border-t border-border pt-4">
              <h3 className="text-sm font-medium text-destructive">Delete user</h3>
              <p className="text-sm text-muted-foreground">
                Only possible if the person has no recorded activity. Otherwise deactivate them.
              </p>
              {!confirmDelete ? (
                <Button variant="outline" size="sm" onClick={() => setConfirmDelete(true)}>Delete…</Button>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm">Delete {user.fullName} permanently?</span>
                  <Button variant="destructive" size="sm" disabled={remove.isPending} onClick={() => remove.mutate()}>{remove.isPending ? "Deleting" : "Yes, delete"}</Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                </div>
              )}
              <FormMessage error={remove.isError ? message(remove.error) : null} />
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

export function NewUserPage() {
  return (
    <div className="max-w-2xl space-y-4">
      <Link to="/users" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Users
      </Link>
      <h1 className="text-2xl font-semibold">Add a user</h1>
      <CreateUser />
    </div>
  );
}

export default function UserPage() {
  const { id = "" } = useParams();
  const q = useQuery({ queryKey: ["users", id], queryFn: () => getUser(id), enabled: !!id });
  return (
    <div className="max-w-2xl space-y-4">
      <Link to="/users" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Users
      </Link>
      {q.isLoading ? <Skeleton className="h-40 w-full" /> : null}
      {q.isError ? <p role="alert" className="text-sm text-destructive">This user could not be loaded.</p> : null}
      {q.isSuccess && !q.data ? <p className="text-sm text-muted-foreground">User not found.</p> : null}
      {q.data ? (
        <>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">{q.data.fullName}</h1>
            {!q.data.isActive ? <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-medium text-destructive">Deactivated</span> : null}
          </div>
          <EditUser key={q.data.id + String(q.dataUpdatedAt)} user={q.data} />
        </>
      ) : null}
    </div>
  );
}
