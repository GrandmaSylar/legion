import { useState } from "react";
import { MessageSquareWarning } from "lucide-react";
import { useCapabilities } from "../../../lib/access/useCapabilities";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { TabsContent } from "../../components/ui/tabs";
import { SectionTabs } from "../../components/SectionTabs";
import { SendTab } from "./SendTab";
import { MineTab } from "./MineTab";
import { InboxTab } from "./InboxTab";
import { RevealLog } from "./RevealLog";

/** Complaints: raise one (openly or anonymously), follow your own, and, for those who handle them, answer them. */
export default function Complaints() {
  const { can } = useCapabilities();
  const { roles } = useAuth();
  const [tab, setTab] = useState("send");
  const portal = roles.includes("parent") || roles.includes("student");
  const raises = portal || can("complaints.submit");
  const handles = can("complaints.handle") || can("complaints.safeguarding");
  const developer = roles.includes("developer");

  const items = [
    ...(raises ? [{ value: "send", label: "Raise a complaint" }, { value: "mine", label: "My complaints" }] : []),
    ...(handles ? [{ value: "inbox", label: "Inbox" }] : []),
    ...(developer ? [{ value: "reveals", label: "Reveal log" }] : []),
  ];
  const current = items.some((i) => i.value === tab) ? tab : items[0]?.value ?? "send";

  return (
    <div className="w-full space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><MessageSquareWarning className="size-6 text-primary" aria-hidden /> Complaints</h1>
        <p className="text-sm text-muted-foreground">Tell the school when something is wrong. You can do it anonymously.</p>
      </div>
      {items.length > 0 ? (
        <SectionTabs items={items} value={current} onValueChange={setTab} label="Complaints section" className="space-y-4">
          {raises ? <TabsContent value="send"><SendTab onSent={() => setTab("mine")} /></TabsContent> : null}
          {raises ? <TabsContent value="mine"><MineTab /></TabsContent> : null}
          {handles ? <TabsContent value="inbox"><InboxTab /></TabsContent> : null}
          {developer ? <TabsContent value="reveals"><RevealLog /></TabsContent> : null}
        </SectionTabs>
      ) : null}
    </div>
  );
}
