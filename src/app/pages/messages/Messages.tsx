import { TabsContent } from "../../components/ui/tabs";
import { SectionTabs } from "../../components/SectionTabs";
import ComposeTab from "./ComposeTab";
import HistoryTab from "./HistoryTab";
import SetupTab from "./SetupTab";
import TemplatesTab from "./TemplatesTab";
import { useMessagingRights } from "./useMessagingRights";

export default function Messages() {
  const { canSendAll, feeOnly, canManageSetup, canViewLog } = useMessagingRights();
  const canCompose = canSendAll || feeOnly;
  return (
    <div className="w-full space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Messages</h1>
        <p className="text-sm text-muted-foreground">
          Send SMS to parents and staff, see what was delivered, and keep your standard wording ready.
        </p>
      </div>

      <SectionTabs
        defaultValue={canCompose ? "compose" : canViewLog ? "history" : "templates"}
        label="Messages section"
        className="space-y-4"
        items={[
          ...(canCompose ? [{ value: "compose", label: "Compose" }] : []),
          ...(canViewLog ? [{ value: "history", label: "History" }] : []),
          { value: "templates", label: "Templates" },
          ...(canCompose ? [{ value: "setup", label: canManageSetup ? "Setup and test" : "Status" }] : []),
        ]}
      >
        {canCompose ? <TabsContent value="compose"><ComposeTab /></TabsContent> : null}
        {canViewLog ? <TabsContent value="history"><HistoryTab /></TabsContent> : null}
        <TabsContent value="templates"><TemplatesTab /></TabsContent>
        {canCompose ? <TabsContent value="setup"><SetupTab /></TabsContent> : null}
      </SectionTabs>
    </div>
  );
}
