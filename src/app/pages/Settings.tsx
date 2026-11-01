import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import CalendarTab from "./settings/CalendarTab";
import ClassesTab from "./settings/ClassesTab";
import SubjectsTab from "./settings/SubjectsTab";
import GradingTab from "./settings/GradingTab";

export default function Settings() {
  return (
    <div className="w-full space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">School setup</h1>
        <p className="text-sm text-muted-foreground">Years, classes, subjects and grading scales.</p>
      </div>

      <Tabs defaultValue="calendar" className="space-y-4">
        <div>
          <TabsList className="h-auto w-full flex-wrap justify-start">
            <TabsTrigger value="calendar">Academic year</TabsTrigger>
            <TabsTrigger value="classes">Classes</TabsTrigger>
            <TabsTrigger value="subjects">Subjects</TabsTrigger>
            <TabsTrigger value="grading">Grading</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="calendar"><CalendarTab /></TabsContent>
        <TabsContent value="classes"><ClassesTab /></TabsContent>
        <TabsContent value="subjects"><SubjectsTab /></TabsContent>
        <TabsContent value="grading"><GradingTab /></TabsContent>
      </Tabs>
    </div>
  );
}
