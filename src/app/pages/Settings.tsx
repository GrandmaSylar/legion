import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import CalendarTab from "./settings/CalendarTab";
import ClassesTab from "./settings/ClassesTab";
import ListTab from "./settings/ListTab";

export default function Settings() {
  return (
    <div className="mx-auto max-w-5xl space-y-5">
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
            <TabsTrigger value="areas">Learning areas</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="calendar"><CalendarTab /></TabsContent>
        <TabsContent value="classes"><ClassesTab /></TabsContent>
        <TabsContent value="subjects">
          <ListTab
            kind="subjects"
            singular="subject"
            help="Subjects taught in Basic 1 to 9. Turn one off to stop using it without losing past grades."
          />
        </TabsContent>
        <TabsContent value="areas">
          <ListTab
            kind="learning_areas"
            singular="learning area"
            help="Areas used for written remarks from creche to KG 2. Edit these to match your report card."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
