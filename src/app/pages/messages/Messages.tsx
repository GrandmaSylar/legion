import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
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

      <Tabs defaultValue={canCompose ? "compose" : canViewLog ? "history" : "templates"} className="space-y-4">
        <TabsList className="h-auto w-full flex-wrap justify-start">
          {canCompose ? <TabsTrigger value="compose">Compose</TabsTrigger> : null}
          {canViewLog ? <TabsTrigger value="history">History</TabsTrigger> : null}
          <TabsTrigger value="templates">Templates</TabsTrigger>
          {canCompose ? <TabsTrigger value="setup">{canManageSetup ? "Setup and test" : "Status"}</TabsTrigger> : null}
        </TabsList>
        {canCompose ? <TabsContent value="compose"><ComposeTab /></TabsContent> : null}
        {canViewLog ? <TabsContent value="history"><HistoryTab /></TabsContent> : null}
        <TabsContent value="templates"><TemplatesTab /></TabsContent>
        {canCompose ? <TabsContent value="setup"><SetupTab /></TabsContent> : null}
      </Tabs>
    </div>
  );
}
