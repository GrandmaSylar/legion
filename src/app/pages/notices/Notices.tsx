import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  Check,
  Clock,
  Edit3,
  Globe,
  GraduationCap,
  Megaphone,
  Pin,
  Plus,
  Search,
  Send,
  Trash2,
  UserCog,
  Users,
} from "lucide-react";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { hasAnyRole } from "../../../lib/permissions";
import { listAcademicYears, listClasses } from "../../../lib/data/setup";
import { getMyTeachableClassIds } from "../../../lib/data/attendance";
import {
  AUDIENCE_OPTIONS,
  createNotice,
  deleteNotice,
  listNotices,
  updateNotice,
  type AnnouncementAudience,
  type NoticeItem,
} from "../../../lib/data/notices";
import { friendlyError } from "../../../lib/data/errors";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";
import { cn } from "../../components/ui/utils";
import { Field, FormMessage, NativeSelect } from "../../components/fields";

const AUDIENCE_BADGE: Record<
  AnnouncementAudience,
  { label: string; className: string; Icon: typeof Globe }
> = {
  all: {
    label: "Whole school",
    className: "bg-primary/15 text-primary border-primary/30",
    Icon: Globe,
  },
  parents: {
    label: "Parents & Guardians",
    className:
      "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    Icon: Users,
  },
  staff: {
    label: "Staff only",
    className:
      "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
    Icon: UserCog,
  },
  class: {
    label: "Class notice",
    className:
      "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
    Icon: GraduationCap,
  },
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

type AudienceFilter = "all_notices" | AnnouncementAudience | "drafts";

export default function NoticesPage() {
  const { profile, roles } = useAuth();
  const qc = useQueryClient();

  const isLeader = hasAnyRole(roles, ["school_admin", "principal"]);
  const isTeacher = hasAnyRole(roles, ["teacher"]);
  const canCompose = isLeader || isTeacher;

  const [filter, setFilter] = useState<AudienceFilter>("all_notices");
  const [search, setSearch] = useState("");
  const [composing, setComposing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<AnnouncementAudience>(
    isLeader ? "all" : "class",
  );
  const [classId, setClassId] = useState("");
  const [pinned, setPinned] = useState(false);

  const yearsQuery = useQuery({
    queryKey: ["academic-years"],
    queryFn: listAcademicYears,
    enabled: canCompose,
  });
  const currentYear = useMemo(
    () =>
      yearsQuery.data?.find((y) => y.isCurrent) ?? yearsQuery.data?.[0] ?? null,
    [yearsQuery.data],
  );

  const classesQuery = useQuery({
    queryKey: ["classes", currentYear?.id],
    queryFn: () => listClasses(currentYear!.id),
    enabled: canCompose && !!currentYear?.id,
  });

  const teachableQuery = useQuery({
    queryKey: ["teachable-classes", profile?.id, currentYear?.id],
    queryFn: () => getMyTeachableClassIds(profile!.id, currentYear!.id),
    enabled: canCompose && !isLeader && isTeacher && !!profile?.id && !!currentYear?.id,
  });

  const postableClasses = useMemo(() => {
    const all = classesQuery.data ?? [];
    if (isLeader) return all;
    if (isTeacher && teachableQuery.data) {
      return all.filter((c) => teachableQuery.data.has(c.id));
    }
    return [];
  }, [classesQuery.data, isLeader, isTeacher, teachableQuery.data]);

  const effectiveClassId = useMemo(() => {
    if (classId && postableClasses.some((c) => c.id === classId)) {
      return classId;
    }
    return postableClasses[0]?.id ?? "";
  }, [classId, postableClasses]);

  const noticesQuery = useQuery({
    queryKey: ["notices"],
    queryFn: () => listNotices(60),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["notices"] });
    void qc.invalidateQueries({ queryKey: ["activity"] });
  };

  const resetForm = () => {
    setTitle("");
    setBody("");
    setAudience(isLeader ? "all" : "class");
    setPinned(false);
    setComposing(false);
    setEditingId(null);
  };

  const startEdit = (n: NoticeItem) => {
    setEditingId(n.id);
    setTitle(n.title);
    setBody(n.body);
    setAudience(n.audience);
    if (n.classId) setClassId(n.classId);
    setPinned(n.pinned);
    setComposing(true);
  };

  const saveMutation = useMutation({
    mutationFn: async (publishNow: boolean) => {
      const targetAudience = isLeader ? audience : "class";
      const targetClassId =
        targetAudience === "class" ? effectiveClassId : null;
      if (editingId) {
        await updateNotice(editingId, {
          title,
          body,
          audience: targetAudience,
          classId: targetClassId,
          publishedAt: publishNow ? new Date().toISOString() : null,
          pinned: isLeader ? pinned : false,
        });
      } else {
        await createNotice({
          title,
          body,
          audience: targetAudience,
          classId: targetClassId,
          publishNow,
          pinned: isLeader ? pinned : false,
        });
      }
    },
    onSuccess: () => {
      resetForm();
      invalidate();
    },
  });

  const togglePublishMutation = useMutation({
    mutationFn: ({ id, publish }: { id: string; publish: boolean }) =>
      updateNotice(id, {
        publishedAt: publish ? new Date().toISOString() : null,
      }),
    onSuccess: invalidate,
  });

  const togglePinMutation = useMutation({
    mutationFn: ({ id, nextPinned }: { id: string; nextPinned: boolean }) =>
      updateNotice(id, { pinned: nextPinned }),
    onSuccess: invalidate,
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => deleteNotice(id),
    onSuccess: invalidate,
  });

  const notices = noticesQuery.data ?? [];

  const filteredNotices = useMemo(() => {
    const q = search.trim().toLowerCase();
    return notices.filter((n) => {
      const isDraft = !n.publishedAt;
      if (filter === "drafts" && !isDraft) return false;
      if (
        filter !== "all_notices" &&
        filter !== "drafts" &&
        n.audience !== filter
      ) {
        return false;
      }
      if (!q) return true;
      return (
        n.title.toLowerCase().includes(q) ||
        n.body.toLowerCase().includes(q) ||
        (n.className && n.className.toLowerCase().includes(q)) ||
        (n.authorName && n.authorName.toLowerCase().includes(q))
      );
    });
  }, [notices, filter, search]);

  const canManageNotice = (n: NoticeItem): boolean => {
    if (isLeader) return true;
    if (
      isTeacher &&
      n.audience === "class" &&
      n.classId &&
      teachableQuery.data?.has(n.classId)
    ) {
      return true;
    }
    return false;
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(true);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Notice board
          </h1>
          <p className="text-sm text-muted-foreground">
            School announcements, term dates, and class updates for{" "}
            {profile?.schoolName ?? "the school"}.
          </p>
        </div>

        {canCompose && !composing ? (
          <Button
            type="button"
            size="sm"
            onClick={() => {
              resetForm();
              setComposing(true);
            }}
          >
            <Plus className="size-4" aria-hidden />
            Post announcement
          </Button>
        ) : null}
      </div>

      {/* Compose / Edit Form */}
      {composing && canCompose ? (
        <form onSubmit={onSubmit} className="surface space-y-4 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Megaphone className="size-4 text-primary" aria-hidden />
              {editingId ? "Edit announcement" : "New announcement"}
            </h2>
          </div>

          {!isLeader && postableClasses.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              You must be assigned to a class to post a class announcement.
            </p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Headline / Title" htmlFor="notice-title">
                  <Input
                    id="notice-title"
                    placeholder="e.g. Mid-term break & PTA meeting"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={140}
                  />
                </Field>

                {isLeader ? (
                  <Field label="Audience" htmlFor="notice-audience">
                    <NativeSelect
                      id="notice-audience"
                      value={audience}
                      onChange={(e) =>
                        setAudience(e.target.value as AnnouncementAudience)
                      }
                    >
                      {AUDIENCE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label} — {opt.description}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                ) : (
                  <Field label="Class" htmlFor="notice-teacher-class">
                    <NativeSelect
                      id="notice-teacher-class"
                      value={effectiveClassId}
                      onChange={(e) => setClassId(e.target.value)}
                    >
                      {postableClasses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.levelName} {c.section}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                )}
              </div>

              {isLeader && audience === "class" ? (
                <Field label="Target class" htmlFor="notice-class">
                  <NativeSelect
                    id="notice-class"
                    value={effectiveClassId}
                    onChange={(e) => setClassId(e.target.value)}
                  >
                    {postableClasses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.levelName} {c.section}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              ) : null}

              <Field label="Message" htmlFor="notice-body">
                <textarea
                  id="notice-body"
                  rows={4}
                  placeholder="Write the full announcement details here..."
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background/60 p-3 text-sm outline-offset-2 placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
                />
              </Field>

              {isLeader ? (
                <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium">
                  <input
                    type="checkbox"
                    checked={pinned}
                    onChange={(e) => setPinned(e.target.checked)}
                    className="size-4 accent-[var(--primary)]"
                  />
                  Pin this announcement to the top of the notice board
                </label>
              ) : null}

              <FormMessage
                error={
                  saveMutation.isError
                    ? friendlyError(saveMutation.error)
                    : null
                }
              />

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="submit"
                  size="sm"
                  disabled={
                    saveMutation.isPending ||
                    !title.trim() ||
                    !body.trim() ||
                    ((!isLeader || audience === "class") && !effectiveClassId)
                  }
                >
                  <Send className="size-3.5" aria-hidden />
                  {saveMutation.isPending ? "Publishing..." : "Publish now"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={
                    saveMutation.isPending ||
                    !title.trim() ||
                    !body.trim() ||
                    ((!isLeader || audience === "class") && !effectiveClassId)
                  }
                  onClick={() => saveMutation.mutate(false)}
                >
                  Save as draft
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={resetForm}
                >
                  Cancel
                </Button>
              </div>
            </>
          )}
        </form>
      ) : null}

      {/* Filter pills & search bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { id: "all_notices", label: "All notices" },
              { id: "all", label: "Whole school" },
              { id: "parents", label: "Parents" },
              { id: "staff", label: "Staff" },
              { id: "class", label: "Class" },
              ...(canCompose ? [{ id: "drafts", label: "Drafts" }] : []),
            ] as { id: AudienceFilter; label: string }[]
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-all",
                filter === item.id
                  ? "border-primary bg-primary text-primary-foreground shadow-sm"
                  : "border-border bg-background/60 text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="relative sm:w-64">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            placeholder="Search notices..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Notices Feed */}
      {noticesQuery.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : filteredNotices.length === 0 ? (
        <section className="surface py-12 text-center">
          <Bell
            className="mx-auto size-8 text-muted-foreground/60"
            aria-hidden
          />
          <p className="mt-2 text-sm font-medium">No announcements found</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {search || filter !== "all_notices"
              ? "Try clearing your search or switching the audience filter."
              : "School announcements and class updates will appear here."}
          </p>
        </section>
      ) : (
        <div className="space-y-3">
          {filteredNotices.map((n) => {
            const badge = AUDIENCE_BADGE[n.audience];
            const BadgeIcon = badge.Icon;
            const isDraft = !n.publishedAt;
            const editable = canManageNotice(n);

            return (
              <article
                key={n.id}
                className={cn(
                  "surface lift space-y-3 p-4 sm:p-5",
                  n.pinned && "border-primary/40 ring-1 ring-primary/25",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {n.pinned ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">
                          <Pin className="size-3" aria-hidden />
                          Pinned
                        </span>
                      ) : null}

                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
                          badge.className,
                        )}
                      >
                        <BadgeIcon className="size-3" aria-hidden />
                        {n.audience === "class" && n.className
                          ? n.className
                          : badge.label}
                      </span>

                      {isDraft ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                          <Clock className="size-3" aria-hidden />
                          Draft (unpublished)
                        </span>
                      ) : null}
                    </div>

                    <h2 className="text-lg font-semibold leading-snug">
                      {n.title}
                    </h2>
                  </div>

                  {editable ? (
                    <div className="flex flex-wrap items-center gap-1">
                      {isDraft ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={togglePublishMutation.isPending}
                          onClick={() =>
                            togglePublishMutation.mutate({
                              id: n.id,
                              publish: true,
                            })
                          }
                        >
                          <Check className="size-3.5" aria-hidden />
                          Publish
                        </Button>
                      ) : null}
                      {isLeader ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          title={n.pinned ? "Unpin" : "Pin to top"}
                          aria-label={n.pinned ? "Unpin notice" : "Pin notice"}
                          onClick={() =>
                            togglePinMutation.mutate({
                              id: n.id,
                              nextPinned: !n.pinned,
                            })
                          }
                          className={cn("size-8", n.pinned && "text-primary")}
                        >
                          <Pin className="size-4" aria-hidden />
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Edit ${n.title}`}
                        onClick={() => startEdit(n)}
                        className="size-8"
                      >
                        <Edit3 className="size-4" aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${n.title}`}
                        disabled={removeMutation.isPending}
                        onClick={() => removeMutation.mutate(n.id)}
                        className="size-8 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    </div>
                  ) : null}
                </div>

                <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/90">
                  {n.body}
                </p>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2.5 text-xs text-muted-foreground">
                  <span>
                    {n.authorName ? `Posted by ${n.authorName}` : "School office"}
                  </span>
                  <span className="tabular-nums">
                    {formatDateTime(n.publishedAt ?? n.createdAt)}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
