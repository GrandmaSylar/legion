import { Banknote } from "lucide-react";
import { useCapabilities } from "../../../lib/access/useCapabilities";
import { TabsContent } from "../../components/ui/tabs";
import { SectionTabs } from "../../components/SectionTabs";
import { MyPayslips } from "./MyPayslips";
import { RunsTab } from "./RunsTab";
import { StaffPayTab } from "./StaffPayTab";
import { SetupTab } from "./SetupTab";

/** Payroll: your payslips, and for those who look after pay, pay runs, staff pay and set-up. */
export default function Payroll() {
  const { can } = useCapabilities();
  const mine = can("payroll.view_own");
  const runs = can("payroll.view_all") || can("payroll.prepare") || can("payroll.approve") || can("payroll.pay");
  const pay = can("payroll.view_all") || can("payroll.manage_pay");
  const setup = can("payroll.configure");

  const items = [
    ...(mine ? [{ value: "mine", label: "My payslips" }] : []),
    ...(runs ? [{ value: "runs", label: "Pay runs" }] : []),
    ...(pay ? [{ value: "staff", label: "Staff pay" }] : []),
    ...(setup ? [{ value: "setup", label: "Set up" }] : []),
  ];

  return (
    <div className="w-full space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><Banknote className="size-6 text-primary" aria-hidden /> Payroll</h1>
        <p className="text-sm text-muted-foreground">Pay is private. You see only what your job needs.</p>
      </div>
      {items.length > 0 ? (
        <SectionTabs items={items} defaultValue={items[0].value} label="Payroll section" className="space-y-4">
          {mine ? <TabsContent value="mine"><MyPayslips /></TabsContent> : null}
          {runs ? <TabsContent value="runs"><RunsTab /></TabsContent> : null}
          {pay ? <TabsContent value="staff"><StaffPayTab /></TabsContent> : null}
          {setup ? <TabsContent value="setup"><SetupTab /></TabsContent> : null}
        </SectionTabs>
      ) : null}
    </div>
  );
}
