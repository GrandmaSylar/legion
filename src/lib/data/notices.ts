// Data layer for the Notice Board (public.announcements).
// RLS scopes visibility by role and audience ('all', 'staff', 'parents', 'class').
import { supabase } from "../supabase";

function check<T>(res: { data: T; error: unknown }): NonNullable<T> {
  if (res.error) throw res.error;
  return res.data as NonNullable<T>;
}

export type AnnouncementAudience = "all" | "staff" | "parents" | "class";

export const AUDIENCE_OPTIONS: {
  value: AnnouncementAudience;
  label: string;
  description: string;
}[] = [
  {
    value: "all",
    label: "Whole school",
    description: "Staff, parents, and students",
  },
  {
    value: "parents",
    label: "Parents & Guardians",
    description: "Parents and school leadership",
  },
  {
    value: "staff",
    label: "Staff only",
    description: "All teaching and non-teaching staff",
  },
  {
    value: "class",
    label: "Specific class",
    description: "Teacher, parents, and pupils of one class",
  },
];

export interface NoticeItem {
  id: string;
  title: string;
  body: string;
  audience: AnnouncementAudience;
  classId: string | null;
  className: string | null;
  postedBy: string | null;
  authorName: string | null;
  publishedAt: string | null;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function listNotices(limit = 50): Promise<NoticeItem[]> {
  const rows = check(
    await supabase
      .from("announcements")
      .select(
        "id, title, body, audience, class_id, posted_by, author_name, published_at, pinned, created_at, updated_at, classes(section, levels(name))",
      )
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit),
  );

  return rows.map((r) => {
    const cls = Array.isArray(r.classes) ? r.classes[0] : r.classes;
    const lvl = cls
      ? Array.isArray(cls.levels)
        ? cls.levels[0]
        : cls.levels
      : null;
    const className = cls
      ? [lvl?.name, cls.section].filter(Boolean).join(" ")
      : null;

    return {
      id: r.id,
      title: r.title,
      body: r.body,
      audience: r.audience as AnnouncementAudience,
      classId: r.class_id,
      className,
      postedBy: r.posted_by,
      authorName: r.author_name,
      publishedAt: r.published_at,
      pinned: Boolean(r.pinned),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  });
}

export async function createNotice(input: {
  title: string;
  body: string;
  audience: AnnouncementAudience;
  classId?: string | null;
  publishNow: boolean;
  pinned?: boolean;
}): Promise<void> {
  check(
    await supabase.from("announcements").insert({
      title: input.title.trim(),
      body: input.body.trim(),
      audience: input.audience,
      class_id: input.audience === "class" ? (input.classId ?? null) : null,
      published_at: input.publishNow ? new Date().toISOString() : null,
      pinned: Boolean(input.pinned),
    }),
  );
}

export async function updateNotice(
  id: string,
  patch: {
    title?: string;
    body?: string;
    audience?: AnnouncementAudience;
    classId?: string | null;
    publishedAt?: string | null;
    pinned?: boolean;
  },
): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (patch.title !== undefined) payload.title = patch.title.trim();
  if (patch.body !== undefined) payload.body = patch.body.trim();
  if (patch.audience !== undefined) {
    payload.audience = patch.audience;
    payload.class_id =
      patch.audience === "class" ? (patch.classId ?? null) : null;
  } else if (patch.classId !== undefined) {
    payload.class_id = patch.classId;
  }
  if (patch.publishedAt !== undefined) payload.published_at = patch.publishedAt;
  if (patch.pinned !== undefined) payload.pinned = patch.pinned;

  check(await supabase.from("announcements").update(payload).eq("id", id));
}

export async function deleteNotice(id: string): Promise<void> {
  check(await supabase.from("announcements").delete().eq("id", id));
}
