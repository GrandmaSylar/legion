// Turn database errors into messages a school administrator can act on.
export function friendlyError(e: unknown): string {
  const err = e as { code?: string; message?: string } | null;
  switch (err?.code) {
    case "23505":
      return "That already exists. Choose a different name.";
    case "23503":
      return "This still has records attached to it (such as grades), so it cannot be removed.";
    case "23514":
      return "Some of the values are not valid. Check the dates and try again.";
    case "TTB01":
    case "ASM01":
    case "EXW01":
      // Written for people to read ("Mark entry for Mock exam closed on 12 Nov 2026.").
      return err?.message || "That is not allowed right now.";
    case "42501":
      return "You do not have permission to do that.";
    default:
      return err?.message?.includes("not permitted")
        ? "You do not have permission to do that."
        : "Something went wrong. Please try again.";
  }
}
