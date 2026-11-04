import { useQuery } from "@tanstack/react-query";
import { BookOpenCheck } from "lucide-react";
import { getPlanSchedule } from "../../../lib/data/lessons";
import { useCapabilities } from "../../../lib/access/useCapabilities";
import { Skeleton } from "../../components/ui/skeleton";
import { TabsContent } from "../../components/ui/tabs";
import { SectionTabs } from "../../components/SectionTabs";
import { MyPlans } from "./MyPlans";
import { ReviewTab } from "./ReviewTab";
import { SyllabusTab } from "./SyllabusTab";
import { RulesTab } from "./RulesTab";

/** Syllabus and lesson plans: write and submit plans, review them, keep the syllabus, set the rules. */
export default function LessonPlans() {
  const { can } = useCapabilities();
  const schedule = useQuery({ queryKey: ["plan-schedule"], queryFn: getPlanSchedule, staleTime: 60_000 });
  const writes = can("lessons.write_own");
  const oversees = can("lessons.view_all") || can("lessons.review");
  const sees = can("lessons.view_syllabus") || can("lessons.manage_syllabus") || writes || oversees;
  const manages = can("lessons.manage_syllabus");

  const items = [
    ...(writes ? [{ value: "mine", label: "My plans" }] : []),
    ...(oversees ? [{ value: "review", label: "Review and tracker" }] : []),
    ...(sees ? [{ value: "syllabus", label: "Syllabus" }] : []),
    ...(manages ? [{ value: "rules", label: "Rules" }] : []),
  ];

  return (
    <div className="w-full space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><BookOpenCheck className="size-6 text-primary" aria-hidden /> Lesson plans</h1>
        <p className="text-sm text-muted-foreground">The syllabus for each subject, and the plans teachers write against it.</p>
      </div>
      {schedule.isLoading ? <Skeleton className="h-24 w-full" /> : null}
      {schedule.isError ? <p role="alert" className="surface p-4 text-sm">Lesson plans could not be loaded.</p> : null}
      {schedule.data && items.length > 0 ? (
        <SectionTabs items={items} defaultValue={items[0].value} label="Lesson plans section" className="space-y-4">
          {writes ? <TabsContent value="mine"><MyPlans schedule={schedule.data} /></TabsContent> : null}
          {oversees ? <TabsContent value="review"><ReviewTab schedule={schedule.data} /></TabsContent> : null}
          {sees ? <TabsContent value="syllabus"><SyllabusTab /></TabsContent> : null}
          {manages ? <TabsContent value="rules"><RulesTab schedule={schedule.data} /></TabsContent> : null}
        </SectionTabs>
      ) : null}
    </div>
  );
}
