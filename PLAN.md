# ConvoWork — Production Master Plan
### Absence & Leave Management Reimagined Through Conversation
**Stack: Next.js · Firebase/Firestore · OpenAI API · MCP · Multi-Agent**

> This document is the single source of truth. It defines what to build, why, and in what order.
> It does not contain code. It gives the builder AI enough context to make good decisions independently.
> Every technical decision must trace back to a real problem this product solves.

---

## 0. The Core Idea

Companies like ADP, Workday, and Workforce Now have powerful leave management systems.
They are also miserable to use. Employees navigate 3–5 pages and fill 12 fields to submit one sick leave.
Admins spend their mornings clicking through filter dropdowns, chasing missing documents,
and approving the same type of case 40 times.

ConvoWork replaces all of that with one intelligent conversation interface.

**For employees:** Talk to it like a human. Upload a document. Done.
**For admins:** Type what you need. The right data, action, and UI appears instantly.

This is not a chatbot bolted onto a leave system.
This is conversation as the operating system for workforce absence management.

**Tagline: Don't navigate. Just ask.**

---

## 1. What We Are Solving — Research-Backed, Priority Order

### Employee Problems

**E1. Filling forms when a document already has all the answers (CRITICAL)**
Employees with a doctor's certificate still manually type the dates, leave type, and duration.
The document is ignored. The form is filled. This is pure waste.
AI fix: GPT-4o Vision reads the certificate. Extracts all fields. Confirms with the employee.
Submits with zero typing. The document IS the form.

**E2. Not knowing leave balance before applying (HIGH)**
Employees apply, get rejected for insufficient balance, reapply. Three round trips for one request.
AI fix: Balance check is automatic before any leave submission. Employee is warned proactively.
A chart renders inside the chat showing exact balances by type.

**E3. Not knowing which leave type to use (MEDIUM)**
Most employees don't know the difference between FMLA, Intermittent FMLA, and Personal leave.
They pick wrong. Admin rejects. Reapply.
AI fix: The Leave Policy Agent explains the right type based on the situation before submitting.

**E4. No visibility on case status (MEDIUM)**
"Was my leave approved?" requires logging into a portal, navigating to history, filtering.
AI fix: Employee asks in chat. Status card appears instantly.

**E5. Re-uploading documents already submitted (LOW)**
Employees get a "missing document" flag even after uploading because the system didn't link it.
AI fix: Document Agent confirms receipt and links to case immediately. No ghost flags.

---

### Admin Problems

**A1. Manually triaging 40–80 cases in the morning queue (CRITICAL)**
Every morning admins open a flat list of all cases and decide what to action first.
No intelligent sorting. No risk flags. No smart grouping.
AI fix: Admin asks "what needs my attention today?" — Orchestrator Agent runs a triage scan
across all open cases, flags SLA breaches, missing documents, FMLA expiries, and high-risk
cases. Returns a prioritized action list with a rendered case table. No more manual scanning.

**A2. Complex filtering requires 5+ dropdown clicks every time (CRITICAL)**
"Show me all FMLA cases from employees with 2+ years tenure where documents are missing"
requires navigating multiple filter menus, waiting for results, adjusting filters.
AI fix: One sentence typed in chat. Cases MCP tool runs the query with all parameters in one call.
Result renders as a filtered CaseTable component inside the chat.

**A3. Bulk approving low-risk cases takes 20+ clicks (CRITICAL)**
Admins know that all standard PTO cases under 3 days with clean documents are always approved.
But they still click into each case, review, click approve, confirm. Repeat 20 times.
AI fix: "Approve all low-risk PTO cases this week." AI lists them. Admin says "yes." Done.
bulk_approve MCP tool fires once. All cases updated in Firestore. Real-time sync.

**A4. FMLA compliance breach from missed expiry dates (HIGH)**
FMLA certifications expire every 12 months. Missing a renewal exposes the company to legal risk.
No legacy system proactively warns about this.
AI fix: Proactive FMLA Agent scans all open FMLA cases on every admin session start.
If any certification expires within 7 days, it flags it without being asked. Admin sees the warning
before they even type their first query.

**A5. Missing document follow-up is manual (HIGH)**
Admins manually identify which pending_docs cases are overdue, copy employee names,
send reminder emails one by one.
AI fix: "Send reminders to everyone with missing documents older than 3 days."
Document Agent identifies them. Notification Agent queues the reminders. Admin confirms.

**A6. No visibility on department-level absence trends (MEDIUM)**
HR directors and benefits admins need to know which departments have abnormal absence rates.
Legacy systems require running a report, exporting to Excel, building charts manually.
AI fix: "Show me absence trends by department this quarter." Analytics Agent queries Firestore.
Renders a BarChart component inside the chat. No export needed.

**A7. Approving/rejecting requires opening each case individually (MEDIUM)**
Even for single-case actions, admins click through 3 pages to reach the approve button.
AI fix: "Reject case #2341, reason: missing specialist certificate." One sentence. Done.

**A8. No audit trail clarity when a case is questioned (LOW)**
When an employee disputes a rejection, admins can't quickly explain the decision history.
AI fix: "Show me the full history of case #2341." Case Agent returns full audit log with
timestamps, note history, document status changes — all rendered in a CaseCard.

---

## 2. The 5 WOW Moments — Build Priority Order

These are the moments that win a demo. Every hour must protect at least the top 3.

**WOW #1 — The Document Is The Form (Employee)**
Employee uploads a medical certificate. GPT-4o Vision reads it.
Extracts: doctor name, hospital, diagnosis type, recommended rest dates, signature status.
If the document is INVALID (blurry, wrong format, personal letter not medical cert):
→ AI explains specifically what is wrong and what a valid certificate looks like.
→ Asks employee to re-upload. Does NOT submit.
If the document is VALID:
→ AI confirms all extracted fields one by one in a friendly conversational way.
→ Checks balance eligibility automatically.
→ Submits leave. Case appears in admin's Firestore-synced queue instantly.
Zero fields typed by employee. The document was the form.

**WOW #2 — One Sentence, Any Filter (Admin)**
Admin types a complex natural language query.
Cases MCP tool parses all filter parameters from the sentence.
Firestore query executes. CaseTable renders inside chat with exact results.
No dropdowns. No menus. No page reloads.

**WOW #3 — Proactive FMLA Flag Nobody Asked For (Admin)**
Admin opens their session. Before they type anything, the Proactive Agent already ran a scan.
If FMLA certifications expire within 7 days, a warning card renders automatically.
AI surfaces the risk before the admin knows to look for it.
Demo line: "Nobody asked it to check that. It just knew."

**WOW #4 — Bulk Approve In Two Words (Admin)**
"Approve all low-risk PTO cases this week."
AI identifies candidates, shows a ConfirmCard with employee names and case IDs.
Admin types "yes." All cases flip to approved in Firestore. Live sync.
Demo line: "Twenty clicks in the old system. Two words here."

**WOW #5 — Balance Chart In Chat (Employee)**
"What's my leave balance?" — a Recharts bar chart renders inside the chat bubble.
PTO, Sick, Personal. Color coded. Live from Firestore.
Demo line: "That chart downloaded only when she asked for it."

---

## 3. Tech Stack — Every Decision Justified

**Framework: Next.js (App Router)**
Reason: API routes for agent orchestration, server components for initial load performance,
built-in streaming support via Response streams. App Router enables route-based auth layouts.

**Database: Firebase Firestore**
Reason: Real-time sync is a core product requirement. When an employee submits leave,
the admin must see it appear without refreshing. Firestore onSnapshot listeners handle this.
All cases, users, documents, notifications, and audit logs are persisted here.
No server restart ever loses data. Production-grade from day one.

**AI: OpenAI API (GPT-4o)**
Reason: GPT-4o handles both text orchestration and vision (document reading) in one model.
Function calling maps cleanly to MCP tool definitions.
Use GPT-4o for all orchestration and reasoning.
Use GPT-4o with vision input for document reading specifically.

**AI SDK: Vercel AI SDK v4**
Reason: useChat hook, streamText, and tool-calling loop are pre-built.
Handles streaming, retries, and the multi-step agent tool loop automatically.
Works with OpenAI provider out of the box.

**Auth: Firebase Auth**
Reason: Simple email/password signup. Role stored in Firestore user document.
Admin signup flow includes an employee selection step — admin can link themselves
to specific employees whose cases they manage. This replaces all static user hardcoding.

**MCP: @modelcontextprotocol/sdk**
Reason: Each tool group is a proper MCP server. This gives us the multi-agent narrative
and makes each domain independently pluggable. New tool groups (Payroll, Scheduling)
can be added without touching the chat layer.

**Charting: Recharts**
Reason: React-native, no config hell. Bar chart renders inside a chat bubble as a live component.
Required for the Balance Chart and Trends WOW moments.

**UI Components: shadcn/ui + Tailwind**
Reason: Production-quality Card, Table, Badge, Button in minutes. No custom CSS fighting.
Tailwind for layout. shadcn for compound components.

**File Upload: react-dropzone**
Reason: Drag-and-drop inside the chat input. Required for Document WOW moment.
Converts file to base64 for GPT-4o Vision API call.

**Date Parsing: date-fns**
Reason: Parses natural language date ranges from document extraction into JS Date objects.
Required for reliable leave submission logic under demo and production pressure.

**Real-time: Firestore onSnapshot**
Reason: Admin case queue updates live when employee submits leave. No polling.
Notifications persist and reappear after page reload because they live in Firestore.

---

## 4. Authentication & User System

### Signup Flow — Employee
1. User enters name, email, password.
2. Selects role: Employee.
3. Selects their department from a dropdown.
4. Account created. Firestore user document created with role: "employee".
5. Redirected to employee chat page.

### Signup Flow — Admin
1. User enters name, email, password.
2. Selects role: Admin.
3. After account creation, shown a list of all registered employees.
4. Admin selects which employees are under their management scope.
5. This selection is stored in the admin's Firestore document as managedEmployeeIds[].
6. Admin only sees cases from employees in their managedEmployeeIds scope.
7. Redirected to admin command center page.

### Login Flow
1. Email + password.
2. Firestore user document fetched.
3. Role determines which page loads: /employee/chat or /admin/dashboard.
4. Middleware protects routes — unauthenticated users redirect to /login.

### Role Rules
- Employees can only see and act on their own cases and balance.
- Admins can see all cases from managed employees.
- Admins cannot modify another admin's settings.
- Super admin role (optional, future): sees all employees across all admins.

---

## 5. Firestore Database Schema

### Collection: users
```
userId (doc ID)
  name: string
  email: string
  role: "employee" | "admin"
  department: string
  tenureYears: number
  managedEmployeeIds: string[] (admin only)
  balances: { pto: number, sick: number, personal: number } (employee only)
  createdAt: timestamp
```

### Collection: cases
```
caseId (doc ID — auto-generated)
  employeeId: string
  employeeName: string
  adminId: string (which admin manages this case)
  leaveType: "PTO" | "Sick" | "FMLA" | "Maternity" | "Paternity" | "Bereavement" | "Personal" | "Intermittent"
  startDate: string (ISO)
  endDate: string (ISO)
  days: number
  status: "open" | "pending_docs" | "approved" | "rejected" | "cancelled"
  priority: "high" | "medium" | "low"
  docStatus: "uploaded" | "missing" | "not_required"
  certificateRequired: boolean
  fmlaExpiry: string | null (ISO)
  rejectionReason: string | null
  notes: string[] (audit trail entries with timestamps)
  createdAt: timestamp
  updatedAt: timestamp
```

### Collection: documents
```
documentId (doc ID)
  caseId: string
  employeeId: string
  uploadedAt: timestamp
  extractedFields: {
    doctorName: string | null
    hospital: string | null
    recommendedRestStart: string | null (ISO)
    recommendedRestEnd: string | null (ISO)
    diagnosisType: string | null
    signatureDetected: boolean
    isValid: boolean
    invalidReason: string | null
  }
  status: "valid" | "invalid" | "pending_review"
```

### Collection: notifications
```
notificationId (doc ID)
  targetUserId: string
  type: "fmla_expiry" | "document_missing" | "case_approved" | "case_rejected" | "sla_breach" | "new_case"
  caseId: string
  message: string
  read: boolean
  createdAt: timestamp
```

### Collection: audit_logs
```
logId (doc ID)
  caseId: string
  actorId: string
  actorRole: "employee" | "admin"
  action: string
  detail: string
  timestamp: timestamp
```

---

## 6. Agent Architecture — The Brain of the System

There are 5 agents. One Orchestrator routes to the right specialist agent.
All agents communicate via MCP tool calls.
All agents share access to the same Firestore-backed MCP tool groups.

### Agent 1: Orchestrator Agent
**Role:** The entry point for every message. Reads intent. Routes to the right agent.
**Knows:** Current user (role, id, department). Session context.
**Does:** Never performs actions itself. Only routes and synthesizes responses.
**Key intelligence:** If the user's message involves multiple intents (e.g. "check my balance
and also submit leave for next week"), it coordinates multiple sub-agents sequentially.

### Agent 2: Leave Application Agent (Employee-facing)
**Role:** Handles all employee leave requests end to end.
**Knows:** Leave policy rules. Certificate requirements by leave type and duration.
Balance thresholds. Date parsing logic.
**Does:**
- Determines leave type from employee's natural description
- Checks if certificate is required (see Section 8 for smart rules)
- If certificate uploaded: hands off to Document Agent
- If no certificate needed: checks eligibility, confirms details, submits
- Never submits without explicit employee confirmation
**Smart behavior:** If employee says "I'm not feeling well" without specifying duration,
asks clarifying question before deciding if cert is required. Does not assume.

### Agent 3: Document Verification Agent
**Role:** Handles all document reading, validation, and linking.
**Knows:** What makes a valid medical certificate vs an invalid one.
Supported document types by leave category.
**Does:**
- Calls GPT-4o Vision on the uploaded base64 image
- If INVALID: explains specifically what is wrong (not signed, wrong format, personal letter,
  dates unreadable, etc.) and asks for re-upload. Does NOT proceed.
- If VALID: returns extracted fields to Leave Application Agent
- Marks case docStatus as "uploaded" in Firestore
- Creates document record in documents collection
**Smart behavior:** Knows a personal letter from a doctor saying "John should rest"
is NOT a valid medical certificate. Explains the difference to the employee.

### Agent 4: Admin Orchestration Agent (Admin-facing)
**Role:** Handles all admin queries, actions, and proactive intelligence.
**Knows:** Full case queue for managed employees. SLA rules. FMLA compliance thresholds.
Bulk action eligibility rules (what counts as "low-risk").
**Does:**
- Complex case filtering and rendering (CaseTable)
- Single case approve/reject/note
- Bulk approve with confirmation gate
- Case history and audit log retrieval
- Proactive morning triage scan (runs on session init)
- Department trend analysis
**Smart behavior:** Before executing any bulk action, always shows a ConfirmCard
listing all affected cases and asks for explicit confirmation. Never bulk-acts without "yes."

### Agent 5: Proactive Notification Agent
**Role:** Runs background intelligence. Surfaces insights nobody asked for.
**Knows:** FMLA expiry dates. SLA breach thresholds. Missing document aging.
**Does:**
- On admin session load: scans all managed cases for FMLA expiries within 7 days
- Scans for cases in pending_docs status older than 3 days (SLA breach risk)
- Writes notification records to Firestore (persists across reloads)
- Returns proactive alert cards to the admin chat on session start
**Smart behavior:** Only fires alerts that are genuinely actionable.
Does not spam. Each alert type fires once per session maximum.

---

## 7. MCP Tool Groups

Each tool group is a separate MCP server definition using @modelcontextprotocol/sdk.
Tool inputs and outputs are Zod-validated. Claude/GPT never guesses parameters.

### cases-mcp
Tools: list_cases, get_case, approve_case, bulk_approve, reject_case, add_note, get_case_history
Firestore ops: read/write to cases collection
Output hint: returns ui_component field telling frontend which card to render

### leave-mcp
Tools: get_balance, check_eligibility, submit_leave, get_my_cases, cancel_leave
Firestore ops: read/write to cases and users collections
Smart rule: submit_leave calls check_eligibility internally before writing to Firestore

### document-mcp
Tools: extract_document_fields (calls GPT-4o Vision), mark_document_uploaded,
get_document_status, validate_document_type
Firestore ops: read/write to documents collection
Note: extract_document_fields never writes to Firestore — it only returns extracted data.
The agent decides what to do with it.

### policy-mcp
Tools: get_leave_policy, check_certificate_required, get_fmla_rules, get_leave_types
Source: Firestore policies collection OR hardcoded policy rules (builder decides based on scope)
Purpose: Agents query this before making any leave decisions. Policy is not hardcoded in prompts.

### notification-mcp
Tools: create_notification, mark_read, get_unread_notifications, send_employee_reminder
Firestore ops: read/write to notifications collection
Note: send_employee_reminder writes a notification to employee's collection.
Does not send real email in v1 — stores in Firestore, renders in employee chat as a banner.

### analytics-mcp
Tools: get_department_trends, get_case_volume_by_period, get_approval_rate_by_type
Firestore ops: read-only aggregation queries on cases collection
Output hint: returns ui_component: "BarChart" or "TrendCard"

---

## 8. Smart Leave & Certificate Logic

This is one of the most important intelligence layers. The Leave Application Agent must know
exactly when to ask for a certificate and when NOT to. Getting this wrong destroys trust.

### Certificate Required — Yes
- Sick leave of 3 or more consecutive days
- FMLA (always — Form WH-380 or equivalent)
- Maternity / Paternity leave (birth certificate or hospital discharge papers)
- Intermittent FMLA (periodic recertification)
- Bereavement for extended duration (5+ days, death certificate)

### Certificate Required — No
- PTO (any duration — it's pre-approved discretionary time)
- Personal leave (any duration — no medical component)
- Sick leave of 1–2 days (most company policies don't require cert for short illness)
- Bereavement under 5 days (standard funeral attendance)

### Certificate Required — Depends on Policy
- Sick leave on a Monday or Friday (some companies flag this as suspicious)
  → Policy Agent checks company policy. If unclear, agent asks admin asynchronously.

### What Makes a Certificate VALID
- Issued on official letterhead or hospital form
- Contains doctor's name and signature
- Contains recommended rest period (start date and end date)
- Date of issue is consistent with the claimed leave period
- Diagnosis description present (general is fine — "respiratory illness" not "flu")

### What Makes a Certificate INVALID
- Personal letter not on medical letterhead
- No signature detected
- Dates missing or unreadable
- Date of issue is after the leave end date (backdated suspiciously)
- Self-written note claiming to be from a doctor
- Image too blurry to extract any fields confidently

### Agent Behavior on Invalid Document
1. Agent clearly explains WHAT is invalid (not just "document rejected")
2. Shows what a valid document looks like
3. Asks employee to re-upload
4. Does NOT submit the case with pending_docs — waits for valid document or employee escalation
5. If employee says "I don't have a valid cert": agent informs them that the admin will be notified
   and the case will be created in pending_docs status for admin review

### When Agent Asks Questions Before Submitting
If employee provides no document and leave type requires one:
- Agent does NOT ask all questions at once like a form
- Asks one question at a time in natural conversation:
  1. "What dates do you need off?"
  2. "Do you have a medical certificate from your doctor?" (if sick)
  3. "Is it from an official clinic or hospital?" (if they say yes)
  4. "Can you upload it here?" (drag and drop prompt appears)
  5. [Document extracted] "I found these details — does this look right?"
  6. "Shall I submit this for you?"

This is a conversation. Not a form in disguise.

---

## 9. Employee Experience — 5 Core Actions

**E-Action 1: Submit leave by uploading a certificate (WOW #1)**
Flow: Type intent → upload cert → AI reads it → confirms details → submits.
If cert invalid: explain and re-request. If cert not required: ask minimal questions, confirm, submit.
Component rendered: CaseCard (on successful submission)

**E-Action 2: Check leave balance (WOW #5)**
Flow: "What's my balance?" → get_balance MCP → BalanceChart renders inside chat.
Shows PTO, Sick, Personal. Color-coded bars. Live from Firestore.
Component rendered: BalanceChart

**E-Action 3: Check status of my cases**
Flow: "What's the status of my leave requests?" → get_my_cases MCP →
CaseTable renders with all employee's cases, sorted by most recent.
Component rendered: CaseTable

**E-Action 4: Cancel a leave request**
Flow: "Can I cancel my PTO next week?" → AI finds the case → shows CaseCard →
asks confirmation → cancel_leave MCP → Firestore updated.
Component rendered: CaseCard with cancel confirmation

**E-Action 5: Understand which leave type to use**
Flow: "I need time off because my parent is in the hospital — what kind of leave should I apply for?"
→ Policy Agent explains options (FMLA, Bereavement, Personal) →
Employee selects → Leave Application Agent guides submission.
Component rendered: None (conversational explanation)

---

## 10. Admin Experience — 7 Core Actions + Morning Triage

**On session load (before admin types anything):**
Proactive Notification Agent runs automatically.
Scans for: FMLA expiries within 7 days, SLA breach cases, unread notifications.
Renders a ProactiveAlertCard in the chat before the first user message.
If nothing urgent: renders a quiet summary ("12 open cases, no critical alerts today.")
This is WOW #3 — the system already knew what mattered.

**A-Action 1: Morning triage (WOW #3 + A1)**
"What needs my attention today?"
Orchestrator runs triage scan. Returns prioritized case list.
Component rendered: CaseTable (sorted by priority) + ProactiveAlertCard

**A-Action 2: Complex filter query (WOW #2)**
Any natural language case filter.
list_cases MCP handles all parameters from the sentence.
Component rendered: CaseTable

**A-Action 3: Bulk approve (WOW #4)**
"Approve all low-risk PTO cases this week."
AI identifies candidates, shows ConfirmCard.
Admin says "yes." bulk_approve MCP fires. Firestore updated. Real-time sync.
Component rendered: ConfirmCard → CaseTable (post-approval)

**A-Action 4: Single case action**
"Reject case #2341, reason: missing specialist certificate."
reject_case MCP. Audit log entry written. Employee notification created in Firestore.
Component rendered: CaseCard (updated status)

**A-Action 5: View case detail + history**
"Show me everything about Marcus Reid's FMLA case."
get_case + get_case_history MCP calls.
Component rendered: CaseCard (with full notes and audit trail)

**A-Action 6: Department absence trends**
"Show me absence patterns by department this quarter."
Analytics Agent runs aggregation. BarChart renders in chat.
Component rendered: BarChart (TrendCard)

**A-Action 7: Send document reminders**
"Remind everyone who hasn't submitted documents in 3 days."
Document MCP identifies cases. Notification MCP queues reminders.
ConfirmCard shows list. Admin confirms. Notifications written to Firestore.
Component rendered: ConfirmCard

---

## 11. UI/UX Design System — Non-Negotiable Principles

This is a product that competes with ADP and Workday. The UI must feel like it belongs
in 2025, not 2010. These principles are binding. Builder AI has full creative latitude
within them.

### Employee Interface
- Clean, minimal, single-column chat layout
- Feels like a premium messaging app, not a helpdesk widget
- Quick action chips appear on load: "Check my balance", "Submit leave", "My cases"
- Drag-and-drop upload is embedded inside the input bar, not a separate page
- Every component that renders inside the chat should feel native to the conversation,
  not like a popup from another app
- Color palette: clean whites, one accent color, generous whitespace
- Mobile-first layout — employees will use this on their phones

### Admin Interface
This is where the most design effort goes. Admin is the buyer. Admin must be delighted.

The admin interface is NOT just a chatbot. It is a command center.

Layout concept (builder has full latitude to execute this vision):
- Left panel or persistent header: live case queue summary (open count, pending docs count,
  flagged count) — updates in real-time via Firestore onSnapshot
- Main area: chat interface as the control mechanism
- Components rendered inside chat are full-width, data-dense, but clean
- No clutter. Every pixel earns its place.
- Keyboard-first: admin power users should be able to do everything without touching the mouse
- Notification badge: unread alerts from Firestore, visible at all times
- Dark mode support preferred

### On-Demand Component System
This is the core technical WOW of the architecture.
No component loads on page init except the chat shell.
When an agent tool returns ui_component: "CaseTable", the frontend dynamically renders
that component with the tool result data.
Components: CaseTable, CaseCard, BalanceChart, ConfirmCard, ProactiveAlertCard, TrendCard
Each component receives data from the tool result, not from a separate API call.
This keeps initial page load under 200KB.

### Rendering Rule
Tool result contains ui_component → MessageBubble renders that component.
Tool result contains no ui_component → Text response only.
Never describe in text what a UI component already shows visually.
If a CaseTable is rendered, the agent does NOT also write "Here are the cases: ..."

### Real-time Sync Rule
Every write to Firestore (case status change, new case, notification) must be visible
to all relevant logged-in users without page reload.
Admin's case queue header counts update via onSnapshot.
Employee notification banner updates via onSnapshot.
This is non-negotiable for production credibility.

---

## 12. Prompting Strategy — Agent Behavior Rules

These are the system prompt rules that govern every agent. Builder AI should embed
these as system prompt instructions, not as code logic.

### Universal Rules (all agents)
- Never invent data. Only use what MCP tools return.
- Never present a form. Ask one question at a time if clarification is needed.
- When a tool returns ui_component, do not narrate the data in text.
  The component shows it. Say one short sentence at most.
- Maximum 2 sentences in any response unless presenting a structured summary.
- Always confirm before any write action (submit, approve, reject, bulk action).
- Never ask for information that can be inferred from context or extracted from a document.

### Leave Application Agent Rules
- Always check eligibility before submitting.
- Always determine certificate requirement from policy-mcp, not from hardcoded rules.
- If document is invalid, explain specifically what is wrong. Do not be vague.
- Never submit a case without explicit employee confirmation ("yes" or "submit it").
- If the employee's natural language is ambiguous about dates ("next week"),
  confirm the exact dates before submitting.

### Admin Orchestration Agent Rules
- Always show ConfirmCard before any bulk action. No exceptions.
- When running proactive triage, always mention count of total open cases
  and highlight only the genuinely urgent items. Do not cry wolf.
- When rejecting a case, always require a reason. Do not allow rejections without reason.
- When an FMLA expiry flag fires, always include the number of days remaining and
  the action required (contact employee, request renewal form).
- When returning case data, use the most recent case at the top.

### Document Verification Agent Rules
- Never pass extracted data to the Leave Agent if isValid is false.
- When document is invalid, always include invalidReason in the response to the employee.
- When document is valid, present extracted fields as a friendly summary:
  "I found a certificate from Dr. [Name] at [Hospital], recommending rest from [date] to [date].
  Does this look right?"
- If GPT-4o Vision returns confidence below threshold, ask employee to re-upload
  rather than guessing at fields.

---

## 13. Notifications — Persistent Across Reloads

All notifications live in Firestore. This means:
- Admin refreshes the page — notification badges reappear immediately.
- Employee opens app on phone — sees pending document request.
- No notification is lost due to server restart or session expiry.

### Notification Types
- fmla_expiry: Shown to admin. Case ID, employee name, days until expiry, action required.
- document_missing: Shown to admin. Case ID, employee name, days since case created.
- case_approved: Shown to employee. Case ID, dates, confirmation message.
- case_rejected: Shown to employee. Case ID, rejection reason, next steps.
- sla_breach: Shown to admin. Case ID, days open, priority flag.
- new_case: Shown to admin. New submission from employee, case summary.

### Notification Display
- In admin interface: persistent badge in header. Click opens notification panel.
  Each notification links to the relevant case via chat command.
- In employee interface: banner at top of chat. Dismissible. 
  Dismissed state stored in Firestore so it doesn't reappear.

---

## 14. File & Folder Structure

Builder AI has full latitude to organize internals. These top-level concerns are binding:

```
convowork/
├── app/
│   ├── (auth)/                    # login, signup pages
│   ├── employee/
│   │   └── chat/                  # Employee chat interface
│   ├── admin/
│   │   └── dashboard/             # Admin command center
│   └── api/
│       ├── chat/                  # Streaming agent endpoint — employee
│       ├── admin-chat/            # Streaming agent endpoint — admin
│       └── set-user/              # Session user context (if needed)
├── components/
│   ├── chat/                      # Chat shell, MessageBubble, ChatInput, UserToggle
│   └── cards/                     # CaseTable, CaseCard, BalanceChart,
│                                  # ConfirmCard, ProactiveAlertCard, TrendCard
├── lib/
│   ├── agents/                    # Agent definitions and routing logic
│   ├── mcp/                       # MCP tool group definitions (one file per group)
│   ├── firebase/                  # Firestore client, auth helpers, onSnapshot hooks
│   └── prompts/                   # System prompt builders for each agent
├── hooks/
│   ├── useCaseQueue.ts            # Firestore onSnapshot for admin live queue
│   └── useNotifications.ts       # Firestore onSnapshot for notification badges
└── middleware.ts                  # Route protection by role
```

---

## 15. Libraries — Possible Stack

| Library | Purpose | Priority |
|---|---|---|
| @vercel/ai (AI SDK v4) | useChat, streamText, tool loop | Critical |
| @ai-sdk/openai | OpenAI provider for Vercel AI SDK | Critical |
| openai | Raw OpenAI SDK for Vision API calls | Critical |
| @modelcontextprotocol/sdk | MCP server definitions per tool group | Critical |
| firebase | Firestore, Firebase Auth | Critical |
| zod | Schema validation for all MCP tool inputs/outputs | Critical |
| recharts | BalanceChart, TrendCard charts inside chat | Critical |
| react-dropzone | File upload inside chat input | Critical |
| date-fns | Date parsing from natural language and doc extraction | Critical |
| shadcn/ui | Card, Table, Badge, Button, Dialog components | Critical |
| tailwindcss | Layout and utility styling | Critical |
| next-auth OR firebase auth | Session management (builder decides) | Critical |
| react-hot-toast | Notification toasts for live sync events | Recommended |
| framer-motion | Subtle entrance animations for chat components | Optional |
| lucide-react | Icon set for admin UI chrome | Recommended |

---

## 16. Build Priority Order

If time is limited, cut from the bottom. Never cut from the top.

**Tier 1 — Without this, there is no demo**
1. Firebase auth + Firestore connection working
2. Employee chat route with basic useChat wiring
3. Admin chat route with basic useChat wiring
4. cases-mcp + leave-mcp tools defined and wired
5. CaseTable component renders from tool result
6. BalanceChart component renders from tool result
7. WOW #1: Document upload + GPT-4o Vision + Leave submission flow
8. WOW #5: Balance chart in chat

**Tier 2 — This is what wins the demo**
9. WOW #2: Complex filter query → CaseTable
10. WOW #4: Bulk approve with ConfirmCard
11. WOW #3: Proactive FMLA flag on session load
12. Firestore real-time sync (employee submission appears in admin queue)

**Tier 3 — This is what wins the product conversation**
13. Notification system (Firestore-backed, persists on reload)
14. Admin notification badge in header
15. Department trend chart (analytics-mcp)
16. Document reminder bulk action

**Tier 4 — Polish (only if Tier 1-3 are solid)**
17. Agent trace chips (show which tools fired per response)
18. Framer Motion entrance animations on cards
19. Mobile layout for employee chat
20. Full audit log view per case

---

## 17. Pre-Demo Verification Checklist

Binary pass/fail. Run this the night before. Fix anything that fails before presenting.

- [ ] npm run dev starts with zero console errors
- [ ] Signup as employee creates a Firestore user document
- [ ] Signup as admin creates a Firestore user document with managedEmployeeIds
- [ ] Login routes correctly to /employee/chat or /admin/dashboard based on role
- [ ] "What is my leave balance?" → BalanceChart renders inside chat bubble
- [ ] Uploading a valid medical cert → fields extracted → confirmed → case created in Firestore
- [ ] Uploading an invalid document → AI explains specifically what is wrong → does NOT submit
- [ ] Submitted employee case appears at top of admin's case queue without page reload
- [ ] "Show me all open FMLA cases where documents are missing" → CaseTable with correct results
- [ ] "Show me Marcus Reid's case" → CaseCard renders → FMLA expiry warning appears
- [ ] "Approve all low-risk PTO cases this week" → ConfirmCard → "yes" → cases flip to approved in Firestore
- [ ] Admin reloads page → notifications from previous session are still visible
- [ ] Proactive FMLA alert fires on admin session load if expiry < 7 days
- [ ] All 5 demo moments work in sequence without any restart

---

## 18. The 5-Minute Demo Script

Rehearse this until you can deliver it without reading. Every second is accounted for.

**0:00–0:30 — The problem**
Open a screenshot of ADP or Workday leave submission UI.
Count out loud: "8 clicks, 3 page loads, 12 form fields — to submit one sick leave request.
Here is what we built instead."

**0:30–1:30 — WOW #1: Document reads itself**
Switch to employee chat. Type: "I'm not feeling well, I need to take sick leave."
AI asks for certificate. Upload the cert image. Watch it extract fields and confirm them.
Type "yes." Case submitted. Say: "She did not fill a single field. The document was the form."

**1:30–2:00 — WOW #5: Balance chart in chat**
Type: "What's my leave balance?" Chart renders inside the chat bubble.
Say: "That chart downloaded only when she asked for it.
The entire page before this was under 200 kilobytes."

**2:00–3:00 — WOW #3 + WOW #2: Admin power**
Switch to admin. Point to the proactive FMLA alert that already appeared.
Say: "Nobody asked it to check that. It already knew."
Type: "Show me all open FMLA cases where documents are missing and tenure is over 2 years."
Table renders instantly. Say: "Five filter dropdowns in the old system. One sentence here."

**3:00–3:45 — WOW #4: Bulk approve**
Type: "Approve all low-risk PTO cases this week."
ConfirmCard appears with case list. Type "yes." Cases flip.
Say: "Twenty clicks. Two words."

**3:45–4:15 — Architecture moment**
Say: "Under the hood — five AI agents, each owning one domain, talking through MCP.
Any new capability plugs in without touching the chat layer.
Every action is persisted in Firestore. Reload the page — everything is still there."

**4:15–5:00 — Close**
Say: "ConvoWork is not a chatbot bolted onto a leave system. 
It is the leave system — with conversation as the interface.
For employees: the document is the form.
For admins: the queue manages itself.
Don't navigate. Just ask."

---

## 19. Do Not Build These

Every hour spent here steals from WOW moments.

- Authentication beyond simple email/password (no SSO, OAuth, MFA in v1)
- Real email delivery (notifications are in-app Firestore only)
- PDF parsing (images only for v1 — JPG/PNG medical certificates)
- Complex role hierarchies beyond employee/admin
- Mobile responsive admin UI (employee chat is mobile-first, admin is desktop-first)
- Loading skeletons or fancy animation unless Tier 1-3 are complete
- Unit tests
- Deployment pipeline or CI/CD
- Any feature not referenced in the 5-minute demo script

---

## 20. The Principle This Document Stands For

The original mistake was building a solution and reverse-engineering problems to justify it.
This document starts from the real pain: an admin's morning, an employee's sick day,
the compliance officer's FMLA anxiety.

Every technical decision — GPT-4o Vision, Firestore real-time sync, MCP tool groups,
on-demand component rendering — is justified by one of the 8 problems in Section 1.

If a feature does not appear in Section 1, it does not get built.
If a feature does not appear in the demo script, it waits for v2.

Build the pain. Not the possibility.
