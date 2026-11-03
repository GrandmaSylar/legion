import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import ComposeTab from "./ComposeTab";
import HistoryTab from "./HistoryTab";
import SetupTab from "./SetupTab";
import TemplatesTab from "./TemplatesTab";
import { useMessagingRights } from "./useMessagingRights";

export default function Messages() {
  const { canSendAll } = useMessagingRights();
  return (
    <div className="w-full space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Messages</h1>
        <p className="text-sm text-muted-foreground">
          Send SMS to parents and staff, see what was delivered, and keep your standard wording ready.
        </p>
      </div>

      <Tabs defaultValue="compose" className="space-y-4">
        <TabsList className="h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="compose">Compose</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="setup">{canSendAll ? "Setup and test" : "Status"}</TabsTrigger>
        </TabsList>
        <TabsContent value="compose"><ComposeTab /></TabsContent>
        <TabsContent value="history"><HistoryTab /></TabsContent>
        <TabsContent value="templates"><TemplatesTab /></TabsContent>
        <TabsContent value="setup"><SetupTab /></TabsContent>
      </Tabs>
    </div>
  );
}
