import { useAuth } from "../../../lib/auth/AuthProvider";

/** An accountant may send fee reminders only; admins, principals and developers may send anything. */
export function useMessagingRights() {
  const { roles } = useAuth();
  const canSendAll = roles.some((r) => ["developer", "school_admin", "principal"].includes(r));
  return { canSendAll, feeOnly: !canSendAll && roles.includes("accountant") };
}
