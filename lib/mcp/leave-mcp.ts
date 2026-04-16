/**
 * leave-mcp — Employee leave operations
 * Tools: get_balance, check_eligibility, submit_leave, get_my_cases, cancel_leave, get_leave_calendar
 */
import { tool } from 'ai'
import { z } from 'zod'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminDb } from '@/lib/firebase/admin'
import type { CaseDoc, LeanCase, LeaveType } from '@/lib/firebase/types'
import { daysBetween, countBusinessDays, COMPANY_HOLIDAYS } from '@/lib/utils'

function toISO(ts: any): string {
  if (!ts) return new Date().toISOString()
  if (typeof ts === 'string') return ts
  if (ts?.toDate) return ts.toDate().toISOString()
  return new Date().toISOString()
}

function leanCase(c: CaseDoc): LeanCase {
  return {
    ...c,
    createdAt: toISO(c.createdAt),
    updatedAt: toISO(c.updatedAt),
  }
}

const TYPE_META_FOR_PICKER: Record<string, { desc: string; maxDays: number; cert: string | false; color: string }> = {
  PTO:           { desc: 'Vacation, travel, personal time',      maxDays: 15, cert: false,      color: '#4f46e5' },
  Sick:          { desc: 'Illness or medical appointment',       maxDays: 10, cert: '3+ days',  color: '#d97706' },
  FMLA:          { desc: 'Serious or chronic medical condition', maxDays: 60, cert: 'Always',   color: '#dc2626' },
  Personal:      { desc: 'Personal event or day off',            maxDays: 5,  cert: false,      color: '#059669' },
  EmergencyLeave:{ desc: 'Urgent unforeseen emergency',          maxDays: 3,  cert: false,      color: '#e11d48' },
  Maternity:     { desc: 'Childbirth — birthing parent',         maxDays: 84, cert: 'Always',   color: '#db2777' },
  Paternity:     { desc: 'Childbirth — non-birthing parent',     maxDays: 10, cert: 'Always',   color: '#2563eb' },
  Bereavement:   { desc: 'Loss of a family member',              maxDays: 10, cert: '5+ days',  color: '#7c3aed' },
  CompOff:       { desc: 'Time off in lieu of overtime',         maxDays: 10, cert: false,      color: '#0891b2' },
  Unpaid:        { desc: 'Unpaid extended leave',                maxDays: 30, cert: false,      color: '#64748b' },
  Intermittent:  { desc: 'Recurring medical condition',          maxDays: 60, cert: 'Always',   color: '#ea580c' },
}

// ── Overlap detection ─────────────────────────────────────────────────────────
async function findOverlappingLeaves(
  employeeId: string,
  startDate: string,
  endDate: string,
): Promise<{ hasOverlap: boolean; conflicts: Array<{ caseId: string; leaveType: string; startDate: string; endDate: string; days: number; status: string }> }> {
  const db = getAdminDb()
  const snap = await db.collection('cases')
    .where('employeeId', '==', employeeId)
    .get()

  const activeStatuses = ['open', 'approved', 'under_review', 'pending_docs']
  const conflicts = snap.docs
    .map((d) => ({ caseId: d.id, ...d.data() } as CaseDoc))
    .filter((c) => activeStatuses.includes(c.status))
    .filter((c) => c.startDate <= endDate && c.endDate >= startDate) // date ranges overlap
    .map((c) => ({
      caseId: c.caseId,
      leaveType: c.leaveType,
      startDate: c.startDate,
      endDate: c.endDate,
      days: c.days,
      status: c.status,
    }))

  return { hasOverlap: conflicts.length > 0, conflicts }
}

export const leaveMcpTools = {
  get_balance: tool({
    description: 'Get leave balance. Use "filter" to show only relevant types based on what the employee asked. Think about context — "paid days" means paid types only, "sick balance" means just sick.',
    inputSchema: z.object({
      employeeId: z.string().describe('The uid of the employee'),
      filter: z.enum(['all', 'paid', 'medical', 'family', 'specific']).optional().default('all')
        .describe('Category filter: paid=PTO/Sick/Personal/Bereavement/CompOff, medical=Sick/FMLA/Intermittent, family=Maternity/Paternity/Bereavement/FMLA'),
      specificTypes: z.array(z.string()).optional()
        .describe('When filter=specific, list exact balance keys like ["pto","sick"]'),
    }),
    execute: async ({ employeeId, filter, specificTypes }) => {
      const db = getAdminDb()
      const snap = await db.collection('users').doc(employeeId).get()
      if (!snap.exists) return { error: 'Employee not found' }
      const data = snap.data()!
      let balances: Record<string, number> = data.balances ?? {}

      const PAID_KEYS = ['pto', 'sick', 'personal', 'bereavement', 'paternity']
      const MEDICAL_KEYS = ['sick', 'fmla']
      const FAMILY_KEYS = ['maternity', 'paternity', 'bereavement', 'fmla']

      if (filter === 'paid') {
        balances = Object.fromEntries(Object.entries(balances).filter(([k]) => PAID_KEYS.includes(k)))
      } else if (filter === 'medical') {
        balances = Object.fromEntries(Object.entries(balances).filter(([k]) => MEDICAL_KEYS.includes(k)))
      } else if (filter === 'family') {
        balances = Object.fromEntries(Object.entries(balances).filter(([k]) => FAMILY_KEYS.includes(k)))
      } else if (filter === 'specific' && specificTypes?.length) {
        balances = Object.fromEntries(Object.entries(balances).filter(([k]) => specificTypes.includes(k)))
      }

      // Smart warnings for low balances
      const warnings: Array<{ type: string; days: number; message: string }> = []
      const LABELS: Record<string, string> = { pto: 'PTO', sick: 'Sick', personal: 'Personal', bereavement: 'Bereavement', fmla: 'FMLA', maternity: 'Maternity', paternity: 'Paternity' }
      for (const [key, days] of Object.entries(balances)) {
        if (typeof days !== 'number') continue
        if (days === 0) warnings.push({ type: LABELS[key] ?? key, days, message: `${LABELS[key] ?? key} balance is exhausted (0 days)` })
        else if (days <= 2) warnings.push({ type: LABELS[key] ?? key, days, message: `${LABELS[key] ?? key} is running low — only ${days} day${days > 1 ? 's' : ''} left` })
      }

      return {
        ui_component: 'BalanceChart',
        employeeId,
        employeeName: data.name,
        balances,
        warnings: warnings.length > 0 ? warnings : undefined,
        warningMessage: warnings.length > 0 ? `⚠️ ${warnings.map(w => w.message).join(' · ')}` : undefined,
      }
    },
  }),

  check_date_availability: tool({
    description: 'Quick check if a date/range is available for leave. Call this FIRST when employee mentions a date, BEFORE asking for type or reason. Returns overlap info.',
    inputSchema: z.object({
      employeeId: z.string(),
      startDate: z.string().describe('ISO date YYYY-MM-DD'),
      endDate: z.string().optional().describe('ISO date, defaults to startDate if not provided'),
    }),
    execute: async ({ employeeId, startDate, endDate }) => {
      const end = endDate ?? startDate
      const { hasOverlap, conflicts } = await findOverlappingLeaves(employeeId, startDate, end)
      const holidayName = COMPANY_HOLIDAYS[startDate]

      if (holidayName) {
        return {
          available: false,
          reason: `${startDate} is a company holiday (${holidayName}) — you are already off!`,
          isHoliday: true,
          holidayName,
        }
      }

      const dow = new Date(startDate + 'T00:00:00').getDay()
      if (dow === 0 || dow === 6) {
        return {
          available: false,
          reason: `${startDate} is a ${dow === 0 ? 'Sunday' : 'Saturday'} — no leave needed.`,
          isWeekend: true,
        }
      }

      if (hasOverlap) {
        const list = conflicts.map(c => `${c.leaveType} (${c.startDate}→${c.endDate}, ${c.status})`).join(', ')
        return {
          available: false,
          reason: `You already have leave on that date: ${list}. Cancel the existing one first or pick a different date.`,
          conflicts,
        }
      }

      return { available: true, reason: 'Date is available.' }
    },
  }),

  check_eligibility: tool({
    description: 'Check if an employee is eligible to take a specific leave type and duration. Validates balance, tenure, and policy rules.',
    inputSchema: z.object({
      employeeId: z.string(),
      leaveType: z.enum(['PTO', 'Sick', 'FMLA', 'Maternity', 'Paternity', 'Bereavement', 'Personal', 'Intermittent', 'Unpaid', 'CompOff', 'EmergencyLeave']),
      days: z.number().describe('Number of days requested'),
      startDate: z.string().describe('ISO date string'),
    }),
    execute: async ({ employeeId, leaveType, days, startDate }) => {
      const db = getAdminDb()
      const snap = await db.collection('users').doc(employeeId).get()
      if (!snap.exists) return { eligible: false, reason: 'Employee not found' }
      const data = snap.data()!
      const balances = data.balances ?? {}

      const balanceKey: Record<LeaveType, string> = {
        PTO: 'pto',
        Sick: 'sick',
        Personal: 'personal',
        Bereavement: 'bereavement',
        Maternity: 'maternity',
        Paternity: 'paternity',
        FMLA: 'fmla',
        Intermittent: 'fmla',
        Unpaid: 'unpaid',
        CompOff: 'pto',
        EmergencyLeave: 'sick',
      }

      const key = balanceKey[leaveType as LeaveType]
      const available = balances[key] ?? 0

      if (leaveType !== 'Unpaid' && available < days) {
        return {
          eligible: false,
          reason: `Insufficient ${leaveType} balance. Available: ${available} days, requested: ${days} days.`,
          available,
          requested: days,
        }
      }

      if (leaveType === 'FMLA' && data.tenureYears < 1) {
        return {
          eligible: false,
          reason: 'FMLA requires at least 12 months of employment.',
          available,
          requested: days,
        }
      }

      // Overlap check — prevent duplicate leaves on same dates
      const endDate = new Date(new Date(startDate).getTime() + (days - 1) * 86400000).toISOString().split('T')[0]
      const { hasOverlap, conflicts } = await findOverlappingLeaves(employeeId, startDate, endDate)
      if (hasOverlap) {
        const conflictList = conflicts.map(c =>
          `• ${c.leaveType} (${c.startDate} → ${c.endDate}, ${c.days}d) — ${c.status} [#${c.caseId.slice(-6).toUpperCase()}]`
        ).join('\n')
        return {
          eligible: false,
          reason: `You already have leave on these dates:\n${conflictList}\n\nCancel the existing leave first, or choose different dates.`,
          available,
          requested: days,
          overlappingLeaves: conflicts,
        }
      }

      // Weekend + holiday awareness
      const breakdown = countBusinessDays(startDate, endDate)
      const deductedDays = breakdown.businessDays
      const warnings: string[] = []

      if (breakdown.weekendDays > 0) {
        warnings.push(`${breakdown.weekendDays} weekend day${breakdown.weekendDays > 1 ? 's' : ''} excluded`)
      }
      if (breakdown.holidays.length > 0) {
        warnings.push(`${breakdown.holidays.length} company holiday${breakdown.holidays.length > 1 ? 's' : ''} excluded: ${breakdown.holidays.map(h => `${h.name} (${h.date})`).join(', ')}`)
      }
      if (deductedDays === 0) {
        return {
          eligible: false,
          reason: 'All selected dates fall on weekends or company holidays — no leave days needed. Choose different dates.',
          available,
          requested: days,
          breakdown,
        }
      }

      if (leaveType !== 'Unpaid' && available < deductedDays) {
        return {
          eligible: false,
          reason: `Insufficient ${leaveType} balance. Only ${deductedDays} business days will be deducted (${breakdown.calendarDays} calendar days, ${warnings.join(', ') || 'no exclusions'}), but you only have ${available} days available.`,
          available,
          requested: deductedDays,
          breakdown,
        }
      }

      return {
        eligible: true,
        reason: 'Eligible',
        available,
        requested: days,
        deductedDays,
        remaining: available - (leaveType !== 'Unpaid' ? deductedDays : 0),
        breakdown,
        warnings: warnings.length > 0 ? warnings : undefined,
      }
    },
  }),

  submit_leave: tool({
    description: 'Submit a leave request for an employee after eligibility is confirmed and employee has given explicit confirmation.',
    inputSchema: z.object({
      employeeId: z.string(),
      leaveType: z.enum(['PTO', 'Sick', 'FMLA', 'Maternity', 'Paternity', 'Bereavement', 'Personal', 'Intermittent', 'Unpaid', 'CompOff', 'EmergencyLeave']),
      startDate: z.string().describe('ISO date'),
      endDate: z.string().describe('ISO date'),
      reason: z.string().describe('Employee stated reason'),
      certificateRequired: z.boolean(),
      hasDocumentUploaded: z.boolean().default(false),
    }),
    execute: async ({ employeeId, leaveType, startDate, endDate, reason, certificateRequired }) => {
      // Hard gate: if cert required, check if a REAL document exists in the chat history
      // Don't trust the AI's hasDocumentUploaded flag — verify from Firestore
      if (certificateRequired) {
        const db2 = getAdminDb()
        const recentDocs = await db2.collection('documents')
          .where('employeeId', '==', employeeId)
          .get()
        const validDoc = recentDocs.docs.some((d) => {
          const data = d.data()
          return data.status === 'valid' && data.extractedFields?.isValid === true
        })
        if (!validDoc) {
          return {
            error: 'DOCUMENT_REQUIRED',
            message: `Cannot submit ${leaveType} without a verified document. Please upload your certificate first — drop an image or PDF in the chat.`,
          }
        }
      }

      // Hard gate: prevent overlapping leaves
      const { hasOverlap, conflicts } = await findOverlappingLeaves(employeeId, startDate, endDate)
      if (hasOverlap) {
        const conflictList = conflicts.map(c =>
          `${c.leaveType} (${c.startDate} → ${c.endDate}) — ${c.status}`
        ).join(', ')
        return {
          error: 'OVERLAP',
          message: `Cannot submit: you already have leave on these dates — ${conflictList}. Cancel the existing leave first or choose different dates.`,
        }
      }

      const db = getAdminDb()
      const userSnap = await db.collection('users').doc(employeeId).get()
      if (!userSnap.exists) return { error: 'Employee not found' }
      const user = userSnap.data()!
      const today = new Date().toISOString().split('T')[0]
      const isRetroactive = startDate < today

      const breakdown = countBusinessDays(startDate, endDate)
      const days = breakdown.businessDays

      // Find admin for this employee
      const adminsSnap = await db.collection('users').where('role', '==', 'admin').get()
      let adminId = ''
      for (const adminDoc of adminsSnap.docs) {
        const adminData = adminDoc.data()
        const managedIds: string[] = adminData.managedEmployeeIds ?? []
        if (managedIds.length === 0 || managedIds.includes(employeeId)) {
          adminId = adminDoc.id
          break
        }
      }

      // Since we gate on cert before this point, docStatus is always uploaded or not_required
      const docStatus = certificateRequired ? 'uploaded' : 'not_required'
      const status = 'open'
      const priority = leaveType === 'FMLA' || leaveType === 'Maternity' || leaveType === 'Paternity'
        ? 'high'
        : days >= 5 ? 'medium' : 'low'

      const now = FieldValue.serverTimestamp()
      const caseRef = await db.collection('cases').add({
        employeeId,
        employeeName: user.name,
        employeeDepartment: user.department,
        adminId,
        leaveType,
        startDate,
        endDate,
        days,
        reason,
        status,
        priority,
        docStatus,
        certificateRequired,
        isRetroactive,
        fmlaExpiry: leaveType === 'FMLA' || leaveType === 'Intermittent'
          ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
          : null,
        rejectionReason: null,
        notes: [{
          text: `Leave request submitted by ${user.name}`,
          actorId: employeeId,
          actorName: user.name,
          actorRole: 'employee',
          timestamp: new Date().toISOString(),
        }],
        createdAt: now,
        updatedAt: now,
      })

      // Deduct balance (except Unpaid)
      if (leaveType !== 'Unpaid') {
        const balanceKeyMap: Record<string, string> = {
          PTO: 'pto', Sick: 'sick', Personal: 'personal', Bereavement: 'bereavement',
          Maternity: 'maternity', Paternity: 'paternity', FMLA: 'fmla', Intermittent: 'fmla',
          CompOff: 'pto', EmergencyLeave: 'sick',
        }
        const key = balanceKeyMap[leaveType]
        if (key && user.balances?.[key] !== undefined) {
          await db.collection('users').doc(employeeId).update({
            [`balances.${key}`]: Math.max(0, (user.balances[key] ?? 0) - days),
          })
        }
      }

      // Create notification for admin
      if (adminId) {
        await db.collection('notifications').add({
          targetUserId: adminId,
          type: 'new_case',
          caseId: caseRef.id,
          message: `New ${leaveType} request from ${user.name} — ${days} day${days !== 1 ? 's' : ''} (${startDate} to ${endDate})`,
          read: false,
          dismissed: false,
          createdAt: now,
        })
      }

      await db.collection('audit_logs').add({
        caseId: caseRef.id,
        actorId: employeeId,
        actorRole: 'employee',
        action: 'case_created',
        detail: `${leaveType} leave submitted for ${days} days`,
        timestamp: now,
      })

      return {
        ui_component: 'CaseStatusCard',
        caseId: caseRef.id,
        leaveType,
        startDate,
        endDate,
        days,
        status,
        docStatus,
        reason,
        isRetroactive,
        message: `Leave submitted successfully (Case #${caseRef.id.slice(-6).toUpperCase()}).`,
      }
    },
  }),

  get_my_cases: tool({
    description: 'Get leave cases for the employee. Supports status, time, date range, and recency filters. Use dateFrom/dateTo for custom ranges like "last 6 months", "this year", "Jan to March". ALWAYS show results as CaseTable card.',
    inputSchema: z.object({
      employeeId: z.string(),
      statusFilter: z.enum(['all', 'open', 'past', 'pending_docs', 'approved', 'rejected', 'cancelled', 'under_review']).optional().default('all'),
      createdInLast: z.enum(['15m', '30m', '1h', '2h', '4h', 'today', '24h', '7d', '30d']).optional()
        .describe('Quick recency filter for recent queries'),
      dateFrom: z.string().optional().describe('ISO date YYYY-MM-DD — show cases created on or after this date'),
      dateTo: z.string().optional().describe('ISO date YYYY-MM-DD — show cases created on or before this date'),
      limit: z.number().optional().default(50),
    }),
    execute: async ({ employeeId, statusFilter, createdInLast, dateFrom, dateTo, limit }) => {
      const db = getAdminDb()
      const snap = await db.collection('cases')
        .where('employeeId', '==', employeeId)
        .get()

      let cases = snap.docs
        .map((d) => ({ caseId: d.id, ...d.data() } as CaseDoc))
        .sort((a, b) => toISO(b.createdAt).localeCompare(toISO(a.createdAt)))

      // Status filter
      if (statusFilter === 'past') {
        cases = cases.filter((c) => ['approved', 'rejected', 'cancelled'].includes(c.status))
      } else if (statusFilter !== 'all') {
        cases = cases.filter((c) => c.status === statusFilter)
      }

      // Custom date range filter
      if (dateFrom) {
        cases = cases.filter((c) => toISO(c.createdAt).slice(0, 10) >= dateFrom)
      }
      if (dateTo) {
        cases = cases.filter((c) => toISO(c.createdAt).slice(0, 10) <= dateTo)
      }

      // Time-based filter (only if no custom date range)
      if (createdInLast && !dateFrom && !dateTo) {
        const now = Date.now()
        const durations: Record<string, number> = {
          '15m': 15 * 60 * 1000,
          '30m': 30 * 60 * 1000,
          '1h': 60 * 60 * 1000,
          '2h': 2 * 60 * 60 * 1000,
          '4h': 4 * 60 * 60 * 1000,
          '24h': 24 * 60 * 60 * 1000,
          '7d': 7 * 24 * 60 * 60 * 1000,
          '30d': 30 * 24 * 60 * 60 * 1000,
        }
        if (createdInLast === 'today') {
          const midnight = new Date()
          midnight.setHours(0, 0, 0, 0)
          cases = cases.filter((c) => new Date(toISO(c.createdAt)).getTime() >= midnight.getTime())
        } else {
          const cutoff = now - (durations[createdInLast] ?? 0)
          cases = cases.filter((c) => new Date(toISO(c.createdAt)).getTime() >= cutoff)
        }
      }

      const lean = cases.slice(0, limit).map(leanCase)

      const timeLabel = createdInLast
        ? { '15m': 'Last 15 Minutes', '30m': 'Last 30 Minutes', '1h': 'Last Hour', '2h': 'Last 2 Hours', '4h': 'Last 4 Hours', 'today': 'Today', '24h': 'Last 24 Hours', '7d': 'Last 7 Days', '30d': 'Last 30 Days' }[createdInLast]
        : dateFrom && dateTo ? `${dateFrom} → ${dateTo}`
        : dateFrom ? `From ${dateFrom}`
        : dateTo ? `Until ${dateTo}`
        : null
      const statusLabel = statusFilter === 'past' ? 'Past' : statusFilter === 'open' ? 'Active' : statusFilter !== 'all' ? statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1) : ''
      const viewLabel = [statusLabel, timeLabel ? `(${timeLabel})` : '', 'Requests'].filter(Boolean).join(' ').trim() || 'All Requests'

      return {
        ui_component: 'CaseTable',
        cases: lean,
        total: lean.length,
        employeeId,
        viewLabel,
      }
    },
  }),

  cancel_leave: tool({
    description: 'Cancel a pending or open leave request. Only the employee who submitted it can cancel. Will restore balance.',
    inputSchema: z.object({
      employeeId: z.string(),
      caseId: z.string(),
    }),
    execute: async ({ employeeId, caseId }) => {
      const db = getAdminDb()
      const caseRef = db.collection('cases').doc(caseId)
      const caseSnap = await caseRef.get()
      if (!caseSnap.exists) return { error: 'Case not found' }
      const c = caseSnap.data() as CaseDoc

      if (c.employeeId !== employeeId) return { error: 'Unauthorised' }
      if (!['open', 'pending_docs'].includes(c.status)) {
        return { error: `Cannot cancel a ${c.status} leave request.` }
      }

      const now = FieldValue.serverTimestamp()
      await caseRef.update({
        status: 'cancelled',
        updatedAt: now,
        notes: [...(c.notes ?? []), {
          text: 'Leave request cancelled by employee',
          actorId: employeeId,
          actorName: c.employeeName,
          actorRole: 'employee',
          timestamp: new Date().toISOString(),
        }],
      })

      // Restore balance
      const balanceKeyMap: Record<string, string> = {
        PTO: 'pto', Sick: 'sick', Personal: 'personal', Bereavement: 'bereavement',
        Maternity: 'maternity', Paternity: 'paternity', FMLA: 'fmla', Intermittent: 'fmla',
        CompOff: 'pto', EmergencyLeave: 'sick',
      }
      const key = balanceKeyMap[c.leaveType]
      if (key && c.leaveType !== 'Unpaid') {
        const userSnap = await db.collection('users').doc(employeeId).get()
        if (userSnap.exists) {
          const userData = userSnap.data()!
          await db.collection('users').doc(employeeId).update({
            [`balances.${key}`]: (userData.balances?.[key] ?? 0) + c.days,
          })
        }
      }

      await db.collection('audit_logs').add({
        caseId,
        actorId: employeeId,
        actorRole: 'employee',
        action: 'case_cancelled',
        detail: 'Leave cancelled by employee — balance restored',
        timestamp: now,
      })

      return {
        ui_component: 'CaseStatusCard',
        caseId,
        leaveType: c.leaveType,
        startDate: c.startDate,
        endDate: c.endDate,
        days: c.days,
        status: 'cancelled' as const,
        docStatus: c.docStatus,
        reason: c.reason,
        message: `Leave #${caseId.slice(-6).toUpperCase()} cancelled. Your ${c.leaveType} balance has been restored.`,
      }
    },
  }),

  get_leave_calendar: tool({
    description: 'Get a summary of upcoming approved leaves for the employee to see who is out when.',
    inputSchema: z.object({
      employeeId: z.string(),
      department: z.string().describe('Filter by department for team calendar'),
    }),
    execute: async ({ employeeId, department }) => {
      const db = getAdminDb()
      const today = new Date().toISOString().split('T')[0]

      const snap = await db.collection('cases')
        .where('status', '==', 'approved')
        .get()

      let cases = snap.docs
        .map((d) => ({ caseId: d.id, ...d.data() } as CaseDoc))
        .filter((c) => c.endDate >= today)

      if (department) {
        cases = cases.filter((c) => c.employeeDepartment === department)
      }

      // Privacy: hide medical reasons from team calendar
      const SENSITIVE_TYPES = ['Sick', 'FMLA', 'Intermittent', 'Maternity', 'Paternity']
      const lean = cases.slice(0, 30).map((c) => {
        const l = leanCase(c)
        if (c.employeeId !== employeeId && SENSITIVE_TYPES.includes(c.leaveType)) {
          return { ...l, reason: 'Medical / personal leave' }
        }
        return l
      })

      return {
        ui_component: 'CaseTable',
        cases: lean,
        viewType: 'calendar',
        viewLabel: `Team Calendar — ${department}`,
        department,
        message: `Upcoming approved leaves in ${department}`,
      }
    },
  }),

  preview_leave_request: tool({
    description: 'Show the employee a confirmation card with all leave details BEFORE submitting. Always call this before submit_leave. Fetches current balance so the employee can see the impact.',
    inputSchema: z.object({
      employeeId: z.string(),
      leaveType: z.enum(['PTO', 'Sick', 'FMLA', 'Maternity', 'Paternity', 'Bereavement', 'Personal', 'Intermittent', 'Unpaid', 'CompOff', 'EmergencyLeave']),
      startDate: z.string().describe('ISO date YYYY-MM-DD'),
      endDate: z.string().describe('ISO date YYYY-MM-DD'),
      reason: z.string(),
      certificateRequired: z.boolean(),
    }),
    execute: async ({ employeeId, leaveType, startDate, endDate, reason, certificateRequired }) => {
      const db = getAdminDb()
      const snap = await db.collection('users').doc(employeeId).get()
      const balances = snap.exists ? (snap.data()!.balances ?? {}) : {}

      const balanceKeyMap: Record<string, string> = {
        PTO: 'pto', Sick: 'sick', Personal: 'personal', Bereavement: 'bereavement',
        Maternity: 'maternity', Paternity: 'paternity', FMLA: 'fmla', Intermittent: 'fmla',
        CompOff: 'pto', EmergencyLeave: 'sick', Unpaid: 'unpaid',
      }
      const key = balanceKeyMap[leaveType] ?? 'pto'
      const currentBalance = balances[key] ?? 0

      const breakdown = countBusinessDays(startDate, endDate)
      const deductedDays = breakdown.businessDays
      const remainingAfter = Math.max(0, currentBalance - (leaveType !== 'Unpaid' ? deductedDays : 0))

      return {
        ui_component: 'LeaveConfirmCard',
        leaveType,
        startDate,
        endDate,
        days: breakdown.calendarDays,
        deductedDays,
        reason,
        certificateRequired,
        currentBalance,
        remainingAfter,
        weekendDays: breakdown.weekendDays,
        holidays: breakdown.holidays,
        message: 'Review your leave request below.',
      }
    },
  }),

  calculate_end_date: tool({
    description: 'Calculate the correct endDate from a startDate + number of BUSINESS days. Skips weekends and company holidays. Use this whenever the employee says "X working days" or "X days".',
    inputSchema: z.object({
      startDate: z.string().describe('ISO date YYYY-MM-DD'),
      businessDays: z.number().describe('Number of working/business days requested'),
    }),
    execute: async ({ startDate, businessDays }) => {
      const current = new Date(startDate + 'T00:00:00')
      let counted = 0
      const skipped: Array<{ date: string; reason: string }> = []

      while (counted < businessDays) {
        const dow = current.getDay()
        const iso = current.toISOString().split('T')[0]
        const holidayName = COMPANY_HOLIDAYS[iso]

        if (dow === 0 || dow === 6) {
          skipped.push({ date: iso, reason: dow === 0 ? 'Sunday' : 'Saturday' })
        } else if (holidayName) {
          skipped.push({ date: iso, reason: holidayName })
        } else {
          counted++
          if (counted === businessDays) break
        }
        current.setDate(current.getDate() + 1)
      }

      const endDate = current.toISOString().split('T')[0]
      const calendarDays = Math.round((current.getTime() - new Date(startDate + 'T00:00:00').getTime()) / 86400000) + 1

      return {
        startDate,
        endDate,
        businessDays,
        calendarDays,
        skippedDays: skipped,
        summary: `${businessDays} working days from ${startDate} → ${endDate} (${calendarDays} calendar days, ${skipped.length} days skipped)`,
      }
    },
  }),

  get_leave_type_options: tool({
    description: 'Show a visual leave type picker card when the employee\'s intended leave type is ambiguous. Call this INSTEAD of asking in plain text. Fetches real-time balance so employee sees days remaining per type.',
    inputSchema: z.object({
      employeeId: z.string().describe('The uid of the employee'),
      suggestedTypes: z.array(z.enum(['PTO','Sick','FMLA','Maternity','Paternity','Bereavement','Personal','Intermittent','Unpaid','CompOff','EmergencyLeave']))
        .describe('Which types to show — max 4, ranked by relevance to what they said'),
    }),
    execute: async ({ employeeId, suggestedTypes }) => {
      const db = getAdminDb()
      const snap = await db.collection('users').doc(employeeId).get()
      const balances = snap.exists ? (snap.data()!.balances ?? {}) : {}

      const balanceKeyMap: Record<string, string> = {
        PTO: 'pto', Sick: 'sick', Personal: 'personal', Bereavement: 'bereavement',
        Maternity: 'maternity', Paternity: 'paternity', FMLA: 'fmla', Intermittent: 'fmla',
        CompOff: 'pto', EmergencyLeave: 'sick', Unpaid: 'unpaid',
      }

      return {
        ui_component: 'LeaveTypePickerCard',
        options: suggestedTypes.map(t => ({
          type: t,
          ...(TYPE_META_FOR_PICKER[t] ?? {}),
          balance: balances[balanceKeyMap[t] ?? ''] ?? 0,
        })),
      }
    },
  }),
}
