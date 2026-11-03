import { useCapabilities } from "../../../lib/access/useCapabilities";

/**
 * What this person may do in Messages, from the actions switched on for them (a developer holds
 * every action). An accountant may send fee reminders only.
 */
export function useMessagingRights() {
  const { can } = useCapabilities();
  const canSendAll = can("messages.send_all");
  return {
    canSendAll,
    feeOnly: !canSendAll && can("messages.send_fee_reminders"),
    canManageSetup: can("messages.manage_setup"),
    canManageTemplates: can("messages.manage_templates"),
    canViewLog: can("messages.view_log"),
  };
}
