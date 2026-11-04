import { useQuery } from "@tanstack/react-query";
import { Clock } from "lucide-react";
import { getClockConfig } from "../../../lib/data/clockin";
import { useCapabilities } from "../../../lib/access/useCapabilities";
import { Skeleton } from "../../components/ui/skeleton";
import { TabsContent } from "../../components/ui/tabs";
import { SectionTabs } from "../../components/SectionTabs";
import { ClockInTab } from "./ClockInTab";
import { ScreenTab } from "./ScreenTab";
import { RegisterTab } from "./RegisterTab";
import { SetupTab } from "./SetupTab";

/** Staff clock-in: clock in or out, show the code, see the register, set it up. */
export default function ClockIn() {
  const { can } = useCapabilities();
  const config = useQuery({ queryKey: ["clockin-config"], queryFn: getClockConfig, staleTime: 30_000, retry: false });
  const uses = can("clockin.use");
  const shows = can("clockin.display") && config.data?.mode !== "taker";
  const sees = can("clockin.view_all") || can("clockin.manage") || (config.data?.isTaker === true && config.data.mode !== "self");
  const manages = can("clockin.manage");

  const items = [
    ...(uses ? [{ value: "mine", label: "Clock in" }] : []),
    ...(shows ? [{ value: "screen", label: "Screen" }] : []),
    ...(sees ? [{ value: "register", label: "Register" }] : []),
    ...(manages ? [{ value: "setup", label: "Set up" }] : []),
  ];

  return (
    <div className="w-full space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><Clock className="size-6 text-primary" aria-hidden /> Staff clock-in</h1>
        <p className="text-sm text-muted-foreground">Who is in, who is late, and who is absent.</p>
      </div>
      {config.isLoading ? <Skeleton className="h-24 w-full" /> : null}
      {config.isError ? <p role="alert" className="surface p-4 text-sm">Clock-in could not be loaded.</p> : null}
      {config.data && items.length > 0 ? (
        <SectionTabs items={items} defaultValue={items[0].value} label="Clock-in section" className="space-y-4">
          {uses ? <TabsContent value="mine"><ClockInTab /></TabsContent> : null}
          {shows ? <TabsContent value="screen"><ScreenTab /></TabsContent> : null}
          {sees ? <TabsContent value="register"><RegisterTab /></TabsContent> : null}
          {manages ? <TabsContent value="setup"><SetupTab /></TabsContent> : null}
        </SectionTabs>
      ) : null}
    </div>
  );
}
