import { TabsContent } from "../components/ui/tabs";
import { SectionTabs } from "../components/SectionTabs";
import { useCapabilities } from "../../lib/access/useCapabilities";
import InstitutionTab from "./settings/InstitutionTab";
import FeaturesTab from "./settings/FeaturesTab";
import NotificationsTab from "./settings/NotificationsTab";
import ExamPeriodsTab from "./settings/ExamPeriodsTab";
import SchemesTab from "./settings/SchemesTab";
import CalendarTab from "./settings/CalendarTab";
import ClassesTab from "./settings/ClassesTab";
import SubjectsTab from "./settings/SubjectsTab";
import GradingTab from "./settings/GradingTab";
import TimetableTab from "./settings/TimetableTab";
import AuditLogTab from "./settings/AuditLogTab";
import { LegionLogo } from "../components/brand/LegionLogo";
import { DevelopedByPhinova } from "../components/brand/DevelopedByPhinova";

export default function Settings() {
  // The audit trail and the timetable have their own actions; the rest is the school's set-up.
  const { can, canAny } = useCapabilities();
  const showTimetable = canAny(["timetable.view", "timetable.edit", "timetable.edit_own_classes"]);
  const showAudit = can("audit.view");
  const showExams = can("grades.manage_exam_periods");
  const showSchemes = can("grades.manage_assessment_schemes");
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

      <SectionTabs
        defaultValue="institution"
        label="Setting"
        className="space-y-4"
        items={[
          { value: "institution", label: "Institution & receipts" },
          { value: "features", label: "Features" },
          { value: "notifications", label: "Notifications" },
          { value: "calendar", label: "Academic year" },
          { value: "classes", label: "Classes" },
          { value: "subjects", label: "Subjects" },
          { value: "grading", label: "Grading" },
          ...(showSchemes ? [{ value: "schemes", label: "How marks add up" }] : []),
          ...(showExams ? [{ value: "exams", label: "Exam periods" }] : []),
          ...(showTimetable ? [{ value: "timetable", label: "Timetable" }] : []),
          ...(showAudit ? [{ value: "audit", label: "Security & Audit Log" }] : []),
        ]}
      >
        <TabsContent value="institution"><InstitutionTab /></TabsContent>
        <TabsContent value="features"><FeaturesTab /></TabsContent>
        <TabsContent value="notifications"><NotificationsTab /></TabsContent>
        {showSchemes ? <TabsContent value="schemes"><SchemesTab /></TabsContent> : null}
        {showExams ? <TabsContent value="exams"><ExamPeriodsTab /></TabsContent> : null}
        <TabsContent value="calendar"><CalendarTab /></TabsContent>
        <TabsContent value="classes"><ClassesTab /></TabsContent>
        <TabsContent value="subjects"><SubjectsTab /></TabsContent>
        <TabsContent value="grading"><GradingTab /></TabsContent>
        {showTimetable ? <TabsContent value="timetable"><TimetableTab /></TabsContent> : null}
        {showAudit ? <TabsContent value="audit"><AuditLogTab /></TabsContent> : null}
      </SectionTabs>

      {/* Interactive System Dialogs Showcase & System Credit */}
      <div className="space-y-3 pt-4">
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
