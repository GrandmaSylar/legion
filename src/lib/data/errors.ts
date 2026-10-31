// Turn database errors into messages a school administrator can act on.
export function friendlyError(e: unknown): string {
  const err = e as { code?: string; message?: string } | null;
  switch (err?.code) {
    case "23505":
      return "That already exists. Choose a different name.";
    case "23503":
      return "This is still in use, so it cannot be removed.";
    case "23514":
      return "Some of the values are not valid. Check the dates and try again.";
    case "42501":
      return "You do not have permission to do that.";
    default:
      return err?.message?.includes("not permitted")
        ? "You do not have permission to do that."
        : "Something went wrong. Please try again.";
  }
}
