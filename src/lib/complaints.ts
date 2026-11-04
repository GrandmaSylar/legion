// Plain words for complaints: the kinds, the statuses, and what each means to the person reading.
// No imports, so it can be tested on its own.

export type Category = "general" | "academic" | "fees" | "staff_conduct" | "facilities" | "bullying" | "safeguarding" | "other";
export type ComplaintStatus = "new" | "in_review" | "waiting" | "resolved" | "closed";

export const CATEGORIES: { value: Category; label: string; help: string }[] = [
  { value: "general", label: "General", help: "Something that does not fit the others." },
  { value: "academic", label: "Teaching and learning", help: "Lessons, homework, marks, reports." },
  { value: "fees", label: "Fees and payments", help: "A charge, a receipt, a payment that went wrong." },
  { value: "staff_conduct", label: "How a member of staff behaves", help: "Something a teacher or other member of staff said or did." },
  { value: "facilities", label: "Buildings and facilities", help: "Toilets, water, classrooms, the compound, safety of the premises." },
  { value: "bullying", label: "Bullying", help: "A pupil being picked on, hurt or left out." },
  { value: "safeguarding", label: "A child's safety or wellbeing", help: "A child who may be harmed or at risk. Only the head and those chosen for this can see it." },
  { value: "other", label: "Something else", help: "" },
];

export const categoryLabel = (c: string) => CATEGORIES.find((x) => x.value === c)?.label ?? c;

export const STATUS_LABELS: Record<ComplaintStatus, string> = {
  new: "New", in_review: "Being looked at", waiting: "Waiting for you", resolved: "Resolved", closed: "Closed",
};

/** What a handler calls it (the same words, from their side). */
export const HANDLER_STATUS_LABELS: Record<ComplaintStatus, string> = {
  new: "New", in_review: "In review", waiting: "Waiting for the complainant", resolved: "Resolved", closed: "Closed",
};

export const isOpen = (s: string) => s === "new" || s === "in_review" || s === "waiting";

export const ANONYMOUS_PROMISE =
  "Nobody who looks after complaints will be shown who you are. You can still read the school's replies here and answer them. " +
  "In a serious case, such as a threat to someone's safety or the misuse of anonymity, the school's system administrator can look up who sent it. " +
  "That needs a written reason and is recorded.";

export const SAFEGUARDING_WARNING =
  "If a child is in danger right now, do not wait for a reply here. Tell the head in person or call the emergency services.";
