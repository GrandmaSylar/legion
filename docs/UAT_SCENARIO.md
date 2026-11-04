# End-to-end test scenario: "Term 1 at Test Academy"

One story that walks the whole system in the order a real school lives it. **Every step involves exactly two people**: one *Actor* who does something, one *Checker* who confirms what they should (and should not) see. Online payments (Paystack) are skipped; fees are paid at the desk.

## Ground rules

- Use a **separate Supabase project or a copy of the data**, not Pinks Academy's live data. If you must use the live school, prefix every name with `zz-` and delete it all at the end (section 14).
- Set `ARKESEL_SANDBOX=true` on the `messaging` function so no real SMS is sent.
- Use a private window per person, or two browsers, so two people are signed in at once.
- Mark each step **Pass / Fail** and write the actual result for anything that fails.
- "Expect" is what must happen. A line beginning **Must NOT** is an access check and matters as much as the happy path.

## Cast (6 accounts, used in pairs)

| Code | Job | Example login |
|---|---|---|
| DEV | Developer | zz-dev@example.com |
| ADM | School admin | zz-admin@example.com |
| ACC | Accountant | zz-accountant@example.com |
| TCH | Teacher (Class 4A class teacher, teaches Maths) | zz-teacher@example.com |
| PAR | Parent of one student | zz-parent@example.com |
| STU | Student (the same child) | zz-student@example.com |

Extra short-lived accounts: a second teacher (TCH2) and an HR officer (HR) in sections 7 and 9.

Pairs used below: DEV+ADM, ADM+ACC, ADM+TCH, TCH+PAR, ACC+PAR, ADM+HR, TCH+STU, TCH+TCH2.

---

## 1. Set up the school (DEV + ADM)

| # | Actor does | Checker confirms |
|---|---|---|
| 1.1 | DEV signs in. Creates user **ADM** with job *School admin*. | ADM signs in with the temporary password and is forced to choose a new one. Expect: lands on Overview. |
| 1.2 | DEV tries to remove their own developer job. | Expect: blocked (cannot lock yourself out). |
| 1.3 | ADM opens Settings > Institution & receipts: name, address, phone, receipt footer, logo. | DEV opens Settings: values are the same. |
| 1.4 | ADM creates the academic year, three terms, and classes (Creche, KG 1, Class 4A, Class 4B, JHS 1A). | DEV sees them in Settings > Classes. |
| 1.5 | ADM adds subjects (Maths, English, Science). Adds one with a duplicate name. | Expect: duplicate refused with a clear message. |
| 1.6 | ADM sets Grading scales and "How marks add up" (class score 50 / exam 50). | DEV opens it: same. |
| 1.7 | ADM turns on Features (Messaging, Clock-in, Payroll, Complaints, Lesson plans, Tasks, Calendar). | Expect: matching sections appear in ADM's rail. DEV sees the same. |
| 1.8 | ADM creates the fee schedule: Tuition GHS 800, Feeding GHS 200 for Class 4A. | ACC (once created in 2.1) sees it on Fees. |

## 2. Create the people (ADM + the new person)

| # | Actor does | Checker confirms |
|---|---|---|
| 2.1 | ADM creates ACC (*Accountant*), TCH (*Teacher*), HR (*HR officer*). Watches the "What this job gives" preview change as each job is ticked. | Each new person signs in, changes password, and sees only their sections. |
| 2.2 | ADM opens TCH's page, fine-tunes access (adds a single extra action), then removes it. | TCH sees the action appear, then disappear, after refreshing. |
| 2.3 | ADM deactivates HR, then reactivates. | HR: while deactivated, sign-in is refused; after reactivation it works. |
| 2.4 | ADM assigns TCH as class teacher of Class 4A and to teach Maths. | TCH sees Class 4A in Attendance and Grades. |
| 2.5 | **Must NOT**: TCH opens /users and /settings. | Expect: not shown or access denied. Same for ACC. |

## 3. Admit students and families (ADM + TCH)

| # | Actor does | Checker confirms |
|---|---|---|
| 3.1 | ADM admits **Ama Mensah** to Class 4A through all five steps (photo, health, guardian with phone, history, review). | Expect: an admission number `V/{year}/{number}`; the summary card matched what was typed. |
| 3.2 | ADM admits a sibling **Kofi Mensah** to Class 4B and links the *same* guardian (not a duplicate). | Expect: one guardian, two children. |
| 3.3 | ADM admits 3 more students quickly (including one with a missing phone). | Expect: the missing-phone case blocks Continue with a plain message. |
| 3.4 | ADM tries to admit a student with a date of birth in the future. | Expect: refused. |
| 3.5 | ADM moves Ama from 4A to 4B, then back. | Class history shows both entries. |
| 3.6 | TCH opens Students. | Expect: sees only Class 4A students. **Must NOT** see 4B students. |

## 4. Parent and student logins (ADM + PAR, then ADM + STU)

| # | Actor does | Checker confirms |
|---|---|---|
| 4.1 | ADM creates PAR, linked to the Mensah guardian record. | PAR signs in: sees the portal, and exactly two children (Ama, Kofi). |
| 4.2 | ADM creates STU, linked to Ama. | STU signs in: sees only Ama's own records. |
| 4.3 | **Must NOT**: PAR opens another family's child by pasting a URL. | Expect: "not found or no access". |
| 4.4 | **Must NOT**: STU opens Students, Fees of other children, Staff, Users. | Expect: not available. |

## 5. A normal school day (TCH + ADM)

| # | Actor does | Checker confirms |
|---|---|---|
| 5.1 | TCH marks attendance for Class 4A: most present, one late, one absent with a reason. | ADM sees the same on Attendance and "Present today" on Overview. |
| 5.2 | TCH edits the register after saving. | Expect: change saved and shown. |
| 5.3 | TCH tries to mark attendance for Class 4B. | Expect: refused. |
| 5.4 | ADM posts a notice to "all parents". TCH posts a notice to Class 4A only. | PAR sees both. A parent of a 4B child sees only the school-wide one. |
| 5.5 | ADM adds a school event to the Calendar (with a holiday). | TCH sees it; copies the live calendar link and adds it to a phone calendar; the event appears. |

## 6. Clock-in and staff time (TCH + HR)

| # | Actor does | Checker confirms |
|---|---|---|
| 6.1 | HR sets up clock-in (working hours, grace period, holidays). | ADM sees it. |
| 6.2 | TCH clocks in (and again at the desk with the shared code, if used). | HR sees the register entry with the time and any flag (late). |
| 6.3 | TCH tries to clock in on a holiday. | Expect: refused or marked as holiday, per the setup. |
| 6.4 | TCH clocks out. | HR sees the hours. |
| 6.5 | **Must NOT**: TCH sees other staff's clock-in register. | Expect: only their own. |

## 7. Teaching work: tasks and lesson plans (TCH + ADM, then TCH + TCH2)

| # | Actor does | Checker confirms |
|---|---|---|
| 7.1 | ADM assigns TCH a task with a due date. | TCH sees it under My tasks and on Overview. |
| 7.2 | TCH marks it done. | ADM sees it completed in Everyone's tasks. |
| 7.3 | ADM creates a rota (e.g. weekly duty) covering TCH and TCH2. | Both see their duty days. |
| 7.4 | ADM uploads a syllabus PDF for Maths. | TCH opens it. **Must NOT**: PAR or STU can open it. |
| 7.5 | TCH writes a lesson plan and submits it. | ADM sees it in Review, comments, and approves. TCH sees the decision. |
| 7.6 | **Must NOT**: TCH2 reads TCH's plan. | Expect: not visible. |

## 8. Marks, report cards and parent visibility (TCH + ADM, then ADM + PAR)

| # | Actor does | Checker confirms |
|---|---|---|
| 8.1 | TCH enters class and exam scores for Maths for Class 4A. Enters one score above the maximum. | Expect: the over-maximum score is refused. |
| 8.2 | TCH enters behavioural assessment and a remark per student. | ADM sees the totals, grades and positions computed correctly (check one by hand). |
| 8.3 | ADM changes the weighting (e.g. 30/70) and re-checks. | Totals recalculate. |
| 8.4 | ADM sets an exam timetable for the term. | TCH and PAR can see it once published. |
| 8.5 | **Before publishing**: PAR opens Ama's results. | Expect: no marks shown yet. |
| 8.6 | ADM publishes the term. | PAR sees Ama's marks and can open and print the report card. STU sees the same. |
| 8.7 | ADM unpublishes. | PAR no longer sees marks. |
| 8.8 | ADM enters BECE candidates for JHS 3 (if any). | Expect: entry stamps shown; non-candidates refused. |

## 9. Fees, receipts and expenses (ADM + ACC, then ACC + PAR)

| # | Actor does | Checker confirms |
|---|---|---|
| 9.1 | ADM generates invoices for Class 4A. | ACC sees each student with GHS 1,000 owed. |
| 9.2 | ACC records a **part payment** of GHS 400 (cash) for Ama. | Invoice status becomes *part paid*, balance GHS 600; a receipt number is issued; the receipt prints correctly. |
| 9.3 | ACC records the remaining GHS 600. | Status *paid*; a second receipt. |
| 9.4 | ACC tries to pay more than the balance. | Expect: refused. |
| 9.5 | ACC reverses/voids a payment (if allowed). | Expect: audit entry; balance restored. |
| 9.6 | PAR opens Fees. | Sees Ama's paid invoice and receipts, and Kofi's unpaid balance. **Must NOT** see anyone else's. |
| 9.7 | ACC sends a fee reminder to Kofi's guardian. | Message History shows it queued and sent (sandbox). |
| 9.8 | ACC records an expense (e.g. chalk GHS 50) and a larger one. | ADM sees both in Expenses; Analytics totals match. |
| 9.9 | **Must NOT**: TCH opens Fees. | Expect: not available. |

## 10. Messaging (ADM + ACC)

| # | Actor does | Checker confirms |
|---|---|---|
| 10.1 | ADM composes an SMS to "Class 4A parents" using placeholders ({student}, {class}). | Preview shows the SMS part count; recipients are the 4A guardians only. |
| 10.2 | ADM sends it. | History shows each message with the provider's raw reply (sandbox); nobody is sent twice. |
| 10.3 | ADM saves a template and reuses it. | Template appears under Templates. |
| 10.4 | **Must NOT**: ACC sends a general announcement. | Expect: ACC may only send fee reminders. |
| 10.5 | ADM switches on an automatic event (e.g. absence alert), then TCH marks a student absent. | A message is queued for that guardian within a few minutes. Switch it off afterwards. |

## 11. Staff, payroll and payslips (HR + ADM, then ADM + TCH)

| # | Actor does | Checker confirms |
|---|---|---|
| 11.1 | HR creates staff records and contracts. | ADM sees them on Staff. |
| 11.2 | ADM sets up payroll rules (SSNIT, PAYE bands, allowances). | HR cannot edit them if the role lacks the action. |
| 11.3 | ADM sets TCH's pay and creates a pay run for the month, including one **part-month** (started mid-month). | Totals: gross, deductions, net. **Have a Ghanaian accountant check these numbers by hand.** |
| 11.4 | ADM approves and pays the run. | TCH sees the payslip under My payslips. |
| 11.5 | **Must NOT**: TCH sees anyone else's payslip. | Expect: only their own. |

## 12. Complaints (PAR + ADM, then ADM + a second admin/principal)

| # | Actor does | Checker confirms |
|---|---|---|
| 12.1 | PAR raises a complaint (once anonymous, once named). | ADM sees it in the Inbox; the anonymous one hides the sender. |
| 12.2 | ADM replies and closes it. | PAR sees the reply under My complaints. |
| 12.3 | ADM "reveals" the sender of the anonymous complaint. | The Reveal log records who revealed it and when. |
| 12.4 | **Must NOT**: TCH reads the Inbox. | Expect: not available. |

## 13. Reports, analytics and audit (ADM + DEV)

| # | Actor does | Checker confirms |
|---|---|---|
| 13.1 | ADM opens Analytics: enrolment, attendance rate, fees collected, outstanding. | DEV cross-checks against the records from sections 3, 5, 9. |
| 13.2 | ADM opens the Audit Log. | Entries exist for the key actions above (logins created, payments, publishing). |
| 13.3 | DEV tries to delete a user who has activity. | Expect: refused; "deactivate instead". |
| 13.4 | DEV deletes a brand-new user with no activity. | Expect: removed. |

## 14. Look and feel, devices, and offline (any pair)

Repeat these on **1500px desktop, a 1366x700 laptop, a tablet and a phone (320-400px)**:

- Desktop rail: every section reachable (More menu appears when the window is short); active section highlighted.
- No sideways scroll and no cut-off text on any screen; forms use the full width on desktop and stack on phone.
- Light and dark mode; glass and flat; accent change persists after reload.
- Sign out clears the screen; a different user signing in on the same browser never sees the previous user's data.
- Switch the network off: the app shell still loads; saving shows a clear message and does not lose typed work.
- Install the app (PWA) and open it from the home screen.

## 15. Clean-up and sign-off

1. Switch automatic messages off again; restore any real settings changed.
2. Delete every `zz-` user, student, invoice, payment and message (or drop the test project).
3. Run the automated suites as a final safety net:
   - `supabase db query --linked -f supabase/tests/rls.sql`
   - `node supabase/tests/sms_unit.mjs`
   - `python supabase/tests/messaging_e2e.py`, `access_e2e.py`, `functions_e2e.py`
4. Record: date, tester names, build/commit, failures, and a go / no-go decision.

### Exit criteria

- Every **Must NOT** passed (these are the data-protection checks).
- Money adds up: invoices, receipts, expenses, payroll and Analytics agree to the pesewa.
- No parent or student ever saw another family's data, unpublished marks, or staff-only screens.
- Payroll figures were reviewed by a qualified Ghanaian accountant before real use.
