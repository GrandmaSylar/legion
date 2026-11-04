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
- [ ] Notification layer and email.
- [ ] Shared navigation (section picker) and download menu components.

## Open decisions still to make

1. Which Paystack alternative each school may use (on hold).
2. The exact set of safeguarding rules for complaints that involve a child.
3. Whether withholding results until fees are paid is offered at all (default off).
