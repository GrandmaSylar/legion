import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
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
            <TabsTrigger value="timetable">Timetable</TabsTrigger>
            <TabsTrigger value="audit">Security &amp; Audit Log</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="institution"><InstitutionTab /></TabsContent>
        <TabsContent value="calendar"><CalendarTab /></TabsContent>
        <TabsContent value="classes"><ClassesTab /></TabsContent>
        <TabsContent value="subjects"><SubjectsTab /></TabsContent>
        <TabsContent value="grading"><GradingTab /></TabsContent>
        <TabsContent value="timetable"><TimetableTab /></TabsContent>
        <TabsContent value="audit"><AuditLogTab /></TabsContent>
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
