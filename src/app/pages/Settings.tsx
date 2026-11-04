import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { useCapabilities } from "../../lib/access/useCapabilities";
import InstitutionTab from "./settings/InstitutionTab";
import CalendarTab from "./settings/CalendarTab";
import ClassesTab from "./settings/ClassesTab";
import SubjectsTab from "./settings/SubjectsTab";
import GradingTab from "./settings/GradingTab";
import TimetableTab from "./settings/TimetableTab";
import AuditLogTab from "./settings/AuditLogTab";
import { DialogShowcase } from "../components/modals/DialogShowcase";
import { LegionLogo } from "../components/brand/LegionLogo";
import { DevelopedByPhinova } from "../components/brand/DevelopedByPhinova";

export default function Settings() {
  // The audit trail and the timetable have their own actions; the rest is the school's set-up.
  const { can, canAny } = useCapabilities();
  const showTimetable = canAny(["timetable.view", "timetable.edit", "timetable.edit_own_classes"]);
  const showAudit = can("audit.view");
  return (
    <div className="w-full space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">School setup &amp; security</h1>
          <p className="text-sm text-muted-foreground">
            Institution details, receipt branding, academic years, classes, subjects, grading scales, timetables and security audit logs.
          </p>
        </div>
        <LegionLogo variant="compact" size="sm" />
      </div>

      <Tabs defaultValue="institution" className="space-y-4">
        <div>
          <TabsList className="h-auto w-full flex-wrap justify-start">
            <TabsTrigger value="institution">Institution &amp; receipts</TabsTrigger>
            <TabsTrigger value="calendar">Academic year</TabsTrigger>
            <TabsTrigger value="classes">Classes</TabsTrigger>
            <TabsTrigger value="subjects">Subjects</TabsTrigger>
            <TabsTrigger value="grading">Grading</TabsTrigger>
            {showTimetable ? <TabsTrigger value="timetable">Timetable</TabsTrigger> : null}
            {showAudit ? <TabsTrigger value="audit">Security &amp; Audit Log</TabsTrigger> : null}
          </TabsList>
        </div>
        <TabsContent value="institution"><InstitutionTab /></TabsContent>
        <TabsContent value="calendar"><CalendarTab /></TabsContent>
        <TabsContent value="classes"><ClassesTab /></TabsContent>
        <TabsContent value="subjects"><SubjectsTab /></TabsContent>
        <TabsContent value="grading"><GradingTab /></TabsContent>
        {showTimetable ? <TabsContent value="timetable"><TimetableTab /></TabsContent> : null}
        {showAudit ? <TabsContent value="audit"><AuditLogTab /></TabsContent> : null}
      </Tabs>

      {/* Interactive System Dialogs Showcase & System Credit */}
      <div className="space-y-3 pt-4">
        <DialogShowcase />
        <div className="flex flex-wrap items-center justify-between gap-2 px-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>Legion OS Engine v2.4</span>
            <span>·</span>
            <span>Supabase RLS Enforced</span>
          </div>
          <DevelopedByPhinova variant="vintage" />
        </div>
      </div>
    </div>
  );
}
