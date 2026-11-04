# Roadmap v2: schools that run it their own way

Written 2026-11-04. Replaces the access design in `ACCESS_AND_FEATURE_PLAN.md` section 3 and extends the build order in section 4. Decisions below were made by the founder; estimates are rough, for one developer.

The product will be sold as a subscription to many schools, so every school decides **which parts it uses, who can do what, and how it works**. Phones come first: most staff and parents will use it on a mid-range Android.

## Decisions already made

| Topic | Decision |
|---|---|
| Access | Replace fixed roles with access by **module and action**. A developer holds everything by default. Everyone else holds only what the school switches on, per person. Familiar job names (Teacher, Bursar) become **presets** that pre-tick the boxes. |
| Payroll rules | Statutory rates, approval steps and who validates are **decided per school** and stored as editable, dated settings. Nothing is hard-coded. |
| Anonymous complaints | Handlers never see who submitted an anonymous complaint. Only the **developer** can reveal it, as a last resort (for example a dangerous complaint, or abuse of anonymity). Every reveal needs a typed reason and is logged. |
| Staff clock-in | **Optional per school**, or a named person can be assigned, at any period, to take staff attendance. |
| Email | Sent from a PhiNova address for now, with replies going to the school's official email. Reviewed later. |
| Payment provider | Per-school choice. On hold until Paystack and the alternatives have answered. |
| Scope | Build all of it, in the order below. |

## Rules that apply to everything built from now on

1. **Every module can be switched off** per school. Off means the menu item goes, the database refuses it, and nothing else shows an empty box or a broken link.
2. **Every outgoing message channel is optional**: SMS, email, in-app, and each automatic message (absence alert, receipt, reminder) is its own switch. Anything that sends a message hides when its channel is off.
3. **Downloads are an action like any other.** Each module has a `download` action. Where a person lacks it, the download button is not shown. Formats: **Excel, CSV, PDF, PNG, JPEG** where they make sense (tables as spreadsheet or PDF, charts and calendars as images). *Limit, stated plainly:* a download permission hides the button. It cannot stop someone copying what is already on their screen. For very sensitive data (payroll) the file is built on the server and each download is logged.
4. **Mobile first.** Every new screen is designed at phone width first. Tables become cards on phones, forms become step-by-step sheets, and nothing scrolls sideways or is cut off.
5. **Navigation inside a module** (see "Replacing sub-tabs" below).

## Replacing sub-tabs on phones

Today modules use a strip of tabs that wraps onto several rows on a phone. Proposal:

- **Phone: a section picker.** One button shows the current section's name (with a count badge if something needs attention) and opens a bottom sheet listing the sections. One line, always, whatever the number of sections. For two or three sections, a **segmented control** with short labels.
- **Tablet and desktop:** tabs on one line that scroll sideways inside their own strip with a faded edge, never wrapping to a second row. Where a module has many sections (Fees has seven), a **left list beside the content**.
- **Labels:** short (Receipts, Invoices, Discounts, Plans, Online, Fees setup, Expenses), with a count only when useful.
- **Text and bars that wrap awkwardly:** headings and chips are balanced and shortened rather than left to break mid-phrase. Row actions collapse into one **More** menu on phones. Filter chips become a single **Filter** button with a sheet. Page header actions become a bottom action bar.

## The 15 items

| # | Item | Approach | Phase |
|---|---|---|---|
| 1 | Access by module and action | Catalogue of actions, per-person grants, presets, `has_capability` in the database, Access screen (person, then module, then action chips). Old role checks are replaced table by table, each proven equal first. | 1 |
| 2 | Tasks and duty assignments | Title, type (duty, invigilation, meeting), people, dates, status. Recurring rotas. **My tasks** on the Overview with a one-tap Done. | 3 |
| 3 | Exam periods | A named period with dates, classes, and switches for what it turns on (score entry window, exam timetable, invigilation tasks, report weighting). Presets for mock, mid-term, term exam. | 2 |
| 4 | Syllabus and lesson plans | Syllabus by subject and class, typed or imported from an Excel template (a PDF is stored for reading only). Teachers write a short plan against a topic; the head approves or comments. Submission frequency is a school setting. | 3 |
| 5 | Payroll | Pay details, pay runs, approval steps, payslips on the phone; then the statutory engine with editable, dated rates. Needs a Ghanaian accountant to validate each school's set-up before real use. | 4 |
| 6 | Features can be switched off | A Features page with plain-language switches and a first-run "which parts will you use" choice. | 1 |
| 7 | Optional SMS, email, payments, finance | Finance modes: off, record-keeping only (key in payments, get receipts), or record-keeping plus online payment. Each message type is a switch. | 1 |
| 8 | Staff clock-in | Rotating code on a fixed screen (QR and 6 digits, changing every 30 seconds), scanned or typed on the staff member's registered phone, works offline, odd cases flagged not blocked. Optional, or taken by an assigned person. | 3 |
| 9 | Email beside SMS | One notification layer: in-app, SMS, email. Shared templates, per-parent channel choice. | 1 |
| 10 | Timetable | School defines days, periods, durations, breaks, per level. Manual grid with clash warnings, Excel import, auto-generate last. | 2 |
| 11 | Term calendar | Tap-to-add events on a month grid (agenda list on phones), copy from last term, publish to staff and parents, phone calendar link. **Download as a bulleted or numbered list of events with their dates, or as the graphical view (PNG, JPEG, PDF), the user's choice.** | 2 |
| 12 | Flexible assessment | Per school (and per level or subject): components, weights, grading style (bands, letters, descriptive, pass/fail, checklist), presets such as 30/70. | 2 |
| 13 | Complaints | Anyone can submit, openly or anonymously. Identity is stored in a locked table handlers cannot read; the developer can reveal it with a logged reason. Anonymous complainers still get replies. Status workflow and a stricter safeguarding category. | 3 |
| 14 | Student view | Students see only a notice that fees are owed, never amounts (a database function returning yes or no). They see their own past reports, assessments and attendance, and current marks only where the teacher marks them visible. | 2 |
| 15 | Mobile restructure | Applied as each module is built, plus the navigation and wrapping rules above and a pass over existing screens. | all |

## Build order

| Phase | Work | About |
|---|---|---|
| 1 | Access (1), Features and settings (6, 7), notification layer with email (9), navigation and download components (15, rule 3) | 4 weeks |
| 2 | Flexible assessment (12), exam periods (3), calendar (11), timetable (10), student rules (14) | 6 weeks |
| 3 | Tasks (2), complaints (13), syllabus and lesson plans (4), clock-in (8) | 5 weeks |
| 4 | Payroll (5), timetable auto-generate | 6 weeks |

### Phase 1 progress

- [x] Access foundation in the database: catalogue of 57 actions, per-person grants, presets from today's roles, `has_capability`, safe `set_user_capabilities` with audit. Nothing user-visible changes yet.
- [x] Access screen on each staff person's edit page, and the app reading access from the new model (`useCapabilities`).
- [ ] Move each database rule from roles to actions, one module at a time, with an equivalence test after each.
  - [x] Messages, Students, Attendance, Grades, Fees and Expenses, Notices, Staff, Analytics (screens by section)
  - [x] Timetable, Users, Settings, the audit trail
  - [x] Every staff-facing rule is now decided by actions. Roles remain only as job labels that carry a preset, and as the parent and student portal accounts. Handing out a role is limited to roles whose preset you hold in full.
- [x] Features page: ten switches per school (attendance, grades, fees, online payments, expenses, analytics, staff, SMS, notices, timetable). A feature that is off disappears for everyone and the database stops allowing it; online payments need fees. Parents' fee views and the paystack and messaging functions follow it too. Not yet enforced in the database for portal views of grades, attendance and notices (the screens hide them).
- [ ] Per-school settings for how a school operates (lesson-plan frequency, exam periods and so on) as each module arrives.
- [x] Email beside SMS: the same audiences, templates, log and retries, sent from a PhiNova address with replies going to the school's own email. Messages is now the module, with SMS and Email as separate switches in Features. Parents can stop SMS and email separately. Needs `RESEND_API_KEY` and `EMAIL_FROM` on the server.
- [x] In-app notifications: a bell in the top bar for staff and parents, filled by the database when a notice is published, a payment is received, a pupil is marked absent or report cards are published. Each event is a switch per school (Settings, Notifications) and follows the feature switches. Only people with a login are reached.
- [ ] Sending those same events automatically by SMS or email (absence alert, fee receipt), with a choice per event. Needs a scheduler or a call from the database to the messaging function, which is a decision for later. Fee reminders stay a manual send for now.
- [x] Shared section navigation (`SectionTabs`): one line with a list on phones, one scrolling row of tabs on larger screens. Used on Fees, Messages and Settings. Other screens with filter chips are still to review.
- [x] Shared download menu (`DownloadMenu`): Excel, CSV, PDF, PNG and JPEG, shown only to someone who holds the module's download action. On Students (all pages of the current filters), Attendance history, Fees (payments, invoices, instalments), Expenses, Staff and Message history. Analytics keeps its own export. Still to cover: Grades results and report lists, Timetable and the calendar (graphic or list) when those arrive. The audit log CSV and the gradebook template are unchanged because no download action covers them.

### Phase 3 progress

- [x] Tasks and duty assignments: a task has a title, a kind (duty, invigilation, meeting, other), dates and an optional time and place, and one or more staff; each person ticks off their own part. Recurring rotas rotate a list of staff over chosen weekdays (a new person each day or each week, one or several at a time) and are laid out as ordinary tasks, with a live preview; laying a rota out again keeps the past and everything already ticked off. My tasks appears on the Overview with a one-tap Done. Staff see their own tasks; the head, principal and HR see everyone's; the head and principal assign; downloads follow the tasks download action. People are told when given a task, and told once for a run of rota duties. An invigilation task can point at an exam period. A switch in Features.
- [x] Syllabus and lesson plans: a syllabus per subject and level (topics with an optional term and week), typed in or imported from an Excel or CSV file with a downloadable template. Teachers write a short plan for each class and subject they teach for a plan period, against a syllabus topic or their own wording, and submit it; the head and principal approve it or send it back with a comment, and a plan sent back is edited and submitted again. How often plans are due is a school setting: one week by default, due on the Friday before the period begins, with review on, all changeable (a period can be 1 to 12 weeks, counted from the term's first Monday). A tracker shows who has planned for a period, and a teacher's Overview reminds them when plans are due. People are told when a plan is submitted or reviewed. A switch in Features.
- [ ] Storing a PDF of a syllabus for reading. Needs file storage, which is not set up yet.
- [x] Staff clock-in: a fixed screen (Clock-in, Screen) shows a six-digit code that changes every 30 seconds, with a square code a phone's own camera can scan to open the app with the code filled in. A member of staff types or scans it on their own phone to clock in or out. The code is made by the database from a secret per school that nobody can read, and checked over the 90 seconds around the scan. The first phone a person uses is registered as theirs; another phone, a late first arrival, a repeated direction, an out with no in, and a scan sent late from a phone with no signal are all recorded and flagged in words, never refused. Scans made with no signal are kept on the phone with the time they were made and sent when it is online. Eight wrong codes in ten minutes pauses that person for a while. A register (for the head, principal and HR) shows present, late and absent for a day or a run of days (weekends left out) with a download. A school chooses how it works (staff clock themselves in, one person marks by hand, or both) and the start, grace period and end of the day. A named person can be chosen to take attendance by hand, for all dates or for a stretch such as one term; they mark staff in or out for up to 14 days back and can remove their own mistakes. The head can start a new secret if a photo of the screen gets out, and approve staff phones. A line on each staff member's Overview shows where they stand today. A switch in Features.
- [ ] Clock-in: public holidays and school-closed days are not yet left out of the register (only weekends are); leave and approved absence are not recorded; late arrival is not messaged to anyone; the staff phone is recognised by a stored id, so clearing the browser's data makes the phone look new (flagged, then approved) until a native app exists.
- [x] Complaints: staff, parents and pupils can raise one under their own name or anonymously, in one of eight kinds (including bullying and a child's safety). The person who raised it follows it under My complaints, reads the school's replies and can answer, including when it is anonymous. Those who handle complaints (the head and principal by default, through the Handle complaints action) see them in an Inbox, reply, keep private notes the complainant never sees, give a complaint to someone and move it through new, in review, waiting, resolved and closed; people are told when something arrives or is answered. A complaint about a child's safety is seen only by those holding the separate safeguarding action. Anonymity is kept by the database: the complaint, its messages and the link to who made it are in tables nobody can read directly, the functions handlers use never return the link for an anonymous complaint, and nothing about complaints is written to the general audit log (which records who made each change). Only the developer can look behind an anonymous complaint, needs a written reason, and the reason and the fact it happened are logged where handlers can see them, never the name. A person may raise five complaints a day. A switch in Features.
- [ ] Complaints: a complaint about the head or the developer is still seen by the head, since there is no one above them to route it to; attachments (photos, documents) need file storage; complaints are not yet part of the Overview or Analytics.

- [x] Payroll, part one (pay details, pay runs, approval, payslips). Each member of staff has basic monthly pay with the date it starts (a raise is a new dated row, so past months keep what was true then), allowances and deductions the school defines itself (a fixed amount or a percent of basic, with dates), and bank and tax details. A pay run is made for a month, calculated into one payslip per paid member of staff (basic plus allowances, minus deductions, plus or minus one-off adjustments for that month), then goes through the approval steps the school defines (who signs and in what order; one signature per step; none defined means one signature from anyone who may approve). The person who calculated a run cannot sign it unless the school turns that off. An approved run cannot change. The accountant marks it paid, which releases payslips to staff on their phones and tells them. A register and a bank payment list can be downloaded. Pay is private: eight separate actions decide who sees pay, sets it, prepares, approves, pays and downloads; account numbers are kept out of the audit log. A switch in Features.
- [ ] Payroll, part two: statutory deductions (pension, income tax and the like) as rules with editable, dated rates, applied in the pay run and shown on the payslip, plus employer costs. Nothing statutory is built in or pre-filled. Must be checked by a Ghanaian accountant for each school before anyone relies on it. Until then a school can add its own deductions as plain amounts or percentages.
- [ ] Payroll: no pro-rating for people who start or leave mid-month, no leave or unpaid-leave deductions, no payslip PDF with the school's letterhead, no payment to the bank from inside the app (the bank list is a file to take to the bank).

### Phase 2 progress

- [x] Term calendar: events as dates or runs of days with optional times, six kinds, an audience, and draft or published. Add by tapping a day or the Add event button; month grid on larger screens, a list on phones. Copy a term's events to a new term as drafts, and publish a term in one action that tells staff and parents once. Download as a bulleted or numbered list (PDF, text or Excel), as a picture (PNG, JPEG or PDF), or as a file for a phone's calendar (.ics). Parents and students see the published events meant for them. A switch in Features.
- [ ] A live calendar link a phone can subscribe to, so changes appear without downloading again. Needs a secret link served by a function.
- [x] Exam periods (Settings, Exam periods): a named period for a mock, mid-term or term exam, with dates, all classes or chosen ones, an optional window for entering marks, and a switch to show it on the calendar. The window is enforced by the database for adding, changing and removing marks and for deleting a marked assessment; the head and anyone who may enter marks for any class are not held to it. A period's calendar entry is kept in step as a draft. Assessments can be linked to a period in the gradebook. Presets for mock, mid-term and term exam fill in sensible dates and windows.
- [ ] Exam timetable and report weighting for a period. Invigilation duties now exist as tasks that can point at an exam period; an exam timetable and report weighting are still to come.
- [x] Flexible assessment: a school builds its own assessment scheme (Settings, How marks add up). A scheme is a list of parts, each with a share of 100, whether it counts as continuous assessment or exam, how its marks combine (average of all, average of the best N, or all marks pooled), and what to do about a missing mark (leave it out or count it as zero). A level uses a scheme and a class can use a different one. A class with no scheme counts marks exactly as before, to the same decimal. Changing a scheme or giving one to a class recalculates the results it touches at once. In the gradebook an assessment is put in a part, and assessments not in a part still count by their own points so nothing is lost.
- [ ] Per-subject schemes, a total out of something other than 100, and carrying marks across terms (an annual average). Not yet.
- [x] Student fee notice: a student sees only a short notice that a fees balance is owed, never an amount and never any fee record. It comes from one database function that returns yes or no, and a student can read no invoices, payments or instalments. A school can switch it off in Features, and it needs fees to be on.
- [x] Marks a student may see: an assessment's marks are hidden from the pupil until the teacher ticks Shown to pupils (or uses Show all for the subject), and everything for a term (the computed result, remarks and conduct) stays hidden until the class's report is published. The database enforces it, so a screen cannot get around it. Pupils get a Marks from your teachers list. Parents and staff are unchanged.
- [x] Parents follow the same rule as their child: they see an assessment's marks only once the teacher has shown them, and the term result, remarks and conduct ratings only once the report is published. Their dashboard shows the shown marks. Staff are unaffected.
- [x] Timetable flexibility: a school defines its own school day (Settings, Timetable, The school day): any number of lessons per day, any length, with breaks where it wants them. A quick builder (start time, lesson length, number of lessons, breaks) lays a day out, and every time can then be adjusted by hand. Weekdays choose which school day they use (a shorter Friday), a level can run different days (nursery finishes early), and applying the school day lays out each class's slots. A subject already placed in a lesson is never removed. Empty lessons can be filled with the class's subjects in turn. Existing timetables do not change until a day is applied.
- [ ] Teacher clash checking (one teacher in two classes at once), Saturday classes, rotating weeks, and automatic timetable generation. Phase 4.

## Open decisions still to make

1. Which Paystack alternative each school may use (on hold).
2. The exact set of safeguarding rules for complaints that involve a child.
3. Whether withholding results until fees are paid is offered at all (default off).
