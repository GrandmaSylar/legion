# Access and Feature Plan

Written 2026-11-03. It answers two questions: **what is still to be built for each kind of user**, and **how a specific person gets access to a screen or feature** without being handed a whole role.

Plain facts first, then the plan. Estimates are rough, for one developer working full-time.

## 1. Where things stand

### Who can see what today

A screen is visible when the person holds a role that allows it. The database enforces the real limits (a hidden link is never the only protection), and some screens are narrower than they look (an accountant can send fee reminders only, a teacher sees only their own classes, a parent sees only their own children).

| Role | Overview | Students | Attendance | Grades | Fees | Analytics | Staff | Messages | Notices | Users | Settings |
|---|---|---|---|---|---|---|---|---|---|---|---|
| School admin (and Developer) | yes | yes | yes | yes | yes | yes | yes | yes | yes | yes | yes |
| Principal | yes | yes | yes | yes | yes | yes | yes | yes | yes | | |
| Teacher | yes | yes | yes | yes | | | | | yes | | |
| Accountant | yes | yes | | | yes | yes | | yes | yes | | |
| HR officer | yes | | | | | yes | yes | | yes | | |
| Receptionist | yes | yes | | yes | | | | | yes | | |
| Librarian | yes | | | | | | | | yes | | |
| Parent | yes | | | yes | yes | | | | yes | | |
| Student | yes | | | yes | | | | | yes | | |

Notes:
- `super_admin` exists in the database but no screen uses it yet. It is reserved for the multi-school platform.
- The Librarian role has nothing to work in yet, because the library module is not built.

### How a specific person can get extra access today

1. **Give them a second role.** A person can hold several roles and gets the combined access. Example: a teacher who also helps in the bursar's office gets both Teacher and Accountant. This is done on the Users screen. The catch: they receive the *whole* role, not one feature.
2. **Switch things off for them.** On the Users screen an admin can hide sections from a person. This can only *remove* access the roles already give. It can never add any.
3. **Scoped by the data itself.** Teachers see only the classes they teach, and parents see only their own children. This needs no setting; it follows the class and guardian records.

### The gap

There is no way to give **one screen or one feature to one person** without a whole role. Real examples from a school:

- The school secretary should send notices, but should not see fees or grades.
- A deputy head needs the Principal's views while the Principal is away, for two weeks.
- A teacher covering another class this week should take that class's attendance, and nothing else.
- The bursar should approve small expenses but not large ones.
- A class teacher should see which of their own pupils owe fees.

Section 3 closes this gap.

## 2. What is still to build, by kind of user

Order inside each group is the order to build.

### Parents (the people who pay, so they come first)

- [x] Own login, children switcher, attendance, grades, notices, fees and receipts, pay online.
- [x] Fees summary and a **Pay now** button on the Overview.
- [ ] **Alerts to the parent's phone:** an SMS receipt after a payment, an alert when a child is absent, a notice when a report card is ready. Reuses the messaging system.
- [ ] **Keep their own details up to date:** phone number, email, address, SMS on or off. The school's SMS reminders depend on correct numbers.
- [ ] **Download** the report card and fee statement as a PDF.
- [ ] **Message a teacher** (a simple, logged, one-to-one thread). Needs a decision on rules (see section 6).
- [ ] **Self-service sign-up** through the admission form, so the office stops creating logins by hand.

### The school office: accountant, receptionist, admin

Money safety comes before everything else here, because real money will start to flow.

- [ ] **Online payments review screen:** every attempt, its status, anything held for review, searchable by reference.
- [ ] **Cancel a receipt and record a refund,** so a refund done in Paystack is mirrored in Legion with a reason and the person who did it.
- [ ] **Stop double payment:** if two family members pay the same invoice at the same moment, the second is held or flagged.
- [ ] **Paystack reconciliation report:** receipts in Legion against Paystack's list and payouts, with differences listed. It replaces the weekly manual check.
- [ ] **Debtors report:** who owes what, by class, with a one-click reminder.
- [ ] **Daily cash-up** for money taken at the office.
- [ ] **Admissions queue** (receptionist): review applications from the public form, one-click create the student.

### Teachers

- [x] Attendance, grades, class lists.
- [ ] Remarks and comments on report cards, with the head's approval step.
- [ ] Timetable view for the teacher's own week.
- [ ] Parent messaging (see above).
- [ ] See which of *their own pupils* owe fees (read-only, no amounts if the school prefers). Needs section 3.

### Principal and management

- [ ] **At-risk pupils:** attendance and grades that are slipping, early.
- [ ] **Approvals queue:** expenses, grade publication, access requests, in one place.
- [ ] **Discipline log.**
- [ ] **Report builder:** choose what to count and export it.

### HR officer

- [x] Staff directory.
- [ ] Contracts, leave requests and balances, payroll with SSNIT and PAYE, recruitment, performance reviews. Each is its own slice, built in that order.

### Librarian

- [ ] Library module: catalogue, lending, returns, fines. Until it exists, the Librarian role has nothing to open.

### Administrators and the developer

- [ ] **Access screen** (section 3).
- [ ] **Audit log viewer:** who changed what and when. The data is already recorded; there is no screen.
- [ ] Data import and export, backups that can be restored and checked, two-step sign-in for admin roles, uptime and error monitoring.

## 3. Giving specific people specific access

### The idea

Replace "this screen needs one of these roles" with **named capabilities**, such as `fees.view` or `notices.post`.

- Each **role** carries a default set of capabilities. The defaults are set up to reproduce exactly what exists today, so nobody gains or loses anything the day this ships.
- An admin can then **grant** one capability to one person, or **take one away**, optionally limited to one class, optionally with an end date, always with a reason.
- The database decides, not the screen. Every rule that today says "has role X or Y" becomes "has capability Z". The screen hides what the database would refuse.

### The capability list (first version)

| Area | Capabilities |
|---|---|
| Students | `students.view_all`, `students.view_own_classes`, `students.edit`, `students.delete` |
| Attendance | `attendance.take_own_classes`, `attendance.take_any_class`, `attendance.view_all` |
| Grades | `grades.enter_own_classes`, `grades.enter_any_class`, `grades.publish_reports`, `grades.view_all` |
| Fees | `fees.view_all`, `fees.view_own_classes`, `fees.record_payment`, `fees.cancel_receipt`, `fees.refund_online`, `fees.bill_students`, `expenses.submit`, `expenses.approve_small`, `expenses.approve_any` |
| Messages | `messages.send_all`, `messages.send_fee_reminders`, `messages.send_absence_alerts`, `messages.view_log` |
| Notices | `notices.post`, `notices.post_class` |
| Analytics | `analytics.view_finance`, `analytics.view_academic`, `analytics.view_staff` |
| Staff | `staff.view`, `staff.edit` |
| Administration | `users.manage`, `access.grant`, `settings.edit`, `audit.view` |

### How a grant works

A grant records: **who**, **which capability**, **allow or deny**, **optional class**, **optional end date**, **who granted it**, **why**.

- A person can do something if their roles *or* an allow grant give it, **and** no deny grant removes it, **and** any end date has not passed.
- A class-limited grant applies to that class only ("take attendance for Basic 4").
- Expired grants stop working by themselves. Nothing has to be remembered or cleaned up.

### Safeguards (these matter more than the feature)

1. **Only an admin or the developer can grant.** The right to grant (`access.grant`) is itself a capability, and cannot be handed out through a grant.
2. **Nobody can grant what they do not hold,** and nobody can grant themselves anything.
3. **Sensitive capabilities need a reason and an end date:** refunds, cancelling receipts, user management, settings, audit.
4. **Every grant and removal is written to the audit log,** and shown in a plain "who has extra access right now" list that can be printed.
5. **Default end date of 90 days** for grants made to cover someone, so access does not outlive the need.
6. **The tests are the proof.** One automatic test replays every role against every screen and rule and must show *no change* from today's behaviour before any grant exists.

### Build order

| Step | What | Rough time |
|---|---|---|
| A | Capability list, role defaults, and the one database check. A test proving every role behaves exactly as today. Nothing visible changes. | 3 days |
| B | The grants table, its permissions, audit trail, and a function to grant and revoke with the safeguards above. | 3 days |
| C | Move the database rules over from roles to capabilities, one area at a time (Messages, then Fees, Students, Attendance, Grades, the rest), re-running the test after each. | 5 days |
| D | The screens use capabilities too. New **Access** tab on the Users screen: a person's role defaults, their extra grants, add and remove with reason and end date. The printable list of extra access. | 4 days |
| E | Class-limited and expiring grants end to end (cover for a colleague). | 2 days |
| F | Alerts: an admin is notified when a sensitive capability is granted. | 1 day |

About three weeks in all. A and B can ship alone and change nothing a user sees.

### What to do in the meantime

Use the second-role approach (section 1) for any real need, and write the reason down. When the Access screen ships, those people are re-created as precise grants and the extra role is removed.

## 4. Order of work

| Order | Work | Why now | Rough time |
|---|---|---|---|
| 1 | Merge the open pull requests; set up automatic checks (typecheck, build, tests) on every change | Cheap, and catches breakage early | 1 day |
| 2 | **Money safety:** review screen, cancel receipt and refund, double-payment guard, reconciliation report | Real money is about to start flowing | 1 week |
| 3 | **Access, steps A to D** | Needed before more staff use the system | 2 weeks |
| 4 | **Parent alerts** (SMS receipt, absence alert, report card ready) and **self-service details** | Parents are the largest group and the ones who pay | 1.5 weeks |
| 5 | **Admission form** (public) with the admissions queue and parent sign-up | Removes manual login creation | 1.5 weeks |
| 6 | **Teacher tools:** remarks, timetable, parent messaging | Daily use, builds trust | 2 weeks |
| 7 | **Management:** at-risk pupils, approvals queue, report builder | Value for the principal | 2 weeks |
| 8 | **HR:** contracts, leave, payroll, recruitment, reviews | Own users, own slice each | 5 weeks |
| 9 | **Library** | Gives the Librarian role something to do | 2 weeks |
| 10 | **Platform:** two-step sign-in for admins, restorable backups, audit viewer, monitoring | Before a second school | 2 weeks |
| 11 | **More than one school** (separate settings, branding, billing) | Only after the pilot proves itself | later |

Re-plan after the first real parents have used the payment feature and the pilot school has had a full term.

## 5. How each step is proven

- Every database change comes with permission tests for each role, run in a transaction that always rolls back.
- Every function that touches money or messages has an end-to-end test against the live project, using throwaway accounts and test money.
- Every screen is checked in a browser at phone width, with no sideways scroll and no cut-off text.
- Money features are never switched to live without a test day and one small real payment, refunded.

## 6. Decisions needed from the school

1. **Parent and teacher messaging:** allowed at all? If yes, who can start a thread, and can the head read them?
2. **Fee visibility for teachers:** may a class teacher see who owes in their class? Amounts or just a yes/no?
3. **Expense approval limits:** what amount can the bursar approve alone, and what needs the principal?
4. **Who covers whom:** is "deputy head covers the principal" a real situation? It decides whether temporary grants matter.
5. **Who pays Paystack's charge:** the school (default) or the parent.
6. **Refund policy:** who may authorise a refund, and is a reason always required?
7. **What a parent may change themselves:** phone and email only, or address as well?
8. **How long to keep records** of former pupils and staff.
