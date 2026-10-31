import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import CalendarTab from "./settings/CalendarTab";
import ClassesTab from "./settings/ClassesTab";
import SubjectsTab from "./settings/SubjectsTab";

export default function Settings() {
  return (
    <div className="w-full space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">School setup</h1>
        <p className="text-sm text-muted-foreground">Years, classes and the lists everything else builds on.</p>
      </div>

      <Tabs defaultValue="calendar" className="space-y-4">
        <div className="overflow-x-auto">
          <TabsList>
            <TabsTrigger value="calendar">Academic year</TabsTrigger>
            <TabsTrigger value="classes">Classes</TabsTrigger>
            <TabsTrigger value="subjects">Subjects</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="calendar"><CalendarTab /></TabsContent>
        <TabsContent value="classes"><ClassesTab /></TabsContent>
        <TabsContent value="subjects"><SubjectsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
