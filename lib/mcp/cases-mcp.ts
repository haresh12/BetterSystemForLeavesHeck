/**
 * cases-mcp — Admin case management operations
 * Tools: list_cases, get_case, approve_case, bulk_approve, reject_case, add_note, get_case_history, request_bulk_approve_candidates
 */
import { tool } from 'ai'
import { z } from 'zod'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminDb } from '@/lib/firebase/admin'
import type { CaseDoc, LeanCase } from '@/lib/firebase/types'

function toISO(ts: any): string {
  if (!ts) return new Date().toISOString()
  if (typeof ts === 'string') return ts
  if (ts?.toDate) return ts.toDate().toISOString()
  return new Date().toISOString()
}

function leanCase(d: FirebaseFirestore.DocumentData, id: string): LeanCase {
  return {
    caseId: id,
    ...d,
    createdAt: toISO(d.createdAt),
    updatedAt: toISO(d.updatedAt),
  } as LeanCase
}

export const casesMcpTools = {
  list_cases: tool({
    description: 'Query and filter cases for admin. Supports natural language filter parameters. ALWAYS provide a short, human-readable tabName that describes this filter (e.g. "Personal Cases", "Urgent Tomorrow", "FMLA Missing Docs", "Engineering High Priority", "Sarah Chen Cases").',
    inputSchema: z.object({
      adminId: z.string(),
      tabName: z.string().describe('Short human-readable name for this filter view. Examples: "Personal Cases", "Starting Tomorrow", "FMLA Missing Docs", "Engineering Team", "High Priority Urgent". Be descriptive and concise.'),
      status: z.enum(['all', 'open', 'pending_docs', 'approved', 'rejected', 'cancelled', 'under_review']).optional().default('all'),
      leaveType: z.enum(['all', 'PTO', 'Sick', 'FMLA', 'Maternity', 'Paternity', 'Bereavement', 'Personal', 'Intermittent', 'Unpaid', 'CompOff', 'EmergencyLeave']).optional().default('all'),
      docStatus: z.enum(['all', 'uploaded', 'missing', 'not_required', 'invalid']).optional().default('all'),
      priority: z.enum(['all', 'critical', 'high', 'medium', 'low']).optional().default('all'),
      department: z.string().optional(),
      minTenureYears: z.number().optional().describe('Minimum employee tenure in years'),
      startDateFrom: z.string().optional().describe('ISO date — filter cases where LEAVE starts from this date'),
      startDateTo: z.string().optional().describe('ISO date — filter cases where LEAVE starts up to this date'),
      updatedAfter: z.string().optional().describe('ISO date — filter cases updated/actioned AFTER this date. Use for "rejected today", "approved this week", etc.'),
      employeeName: z.string().optional().describe('Partial employee name search'),
      sortBy: z.enum(['createdAt', 'startDate', 'priority']).optional().default('createdAt'),
      limit: z.number().optional().default(50),
    }),
    execute: async ({ adminId, tabName, status, leaveType, docStatus, priority, department, minTenureYears, startDateFrom, startDateTo, updatedAfter, employeeName, sortBy, limit }) => {
      const db = getAdminDb()

      const adminSnap = await db.collection('users').doc(adminId).get()
      if (!adminSnap.exists) return { error: 'Admin not found' }
      const adminData = adminSnap.data()!
      const managedIds: string[] = adminData.managedEmployeeIds ?? []

      const snap = await db.collection('cases').get()

      const sortField = sortBy === 'startDate' ? 'startDate' : 'createdAt'
      let cases = snap.docs
        .map((d) => leanCase(d.data(), d.id))
        .sort((a, b) => ((b as any)[sortField] ?? '').localeCompare((a as any)[sortField] ?? ''))

      if (managedIds.length > 0) {
        cases = cases.filter((c) => managedIds.includes(c.employeeId))
      }

      if (status !== 'all') cases = cases.filter((c) => c.status === status)
      if (leaveType !== 'all') cases = cases.filter((c) => c.leaveType === leaveType)
      if (docStatus !== 'all') cases = cases.filter((c) => c.docStatus === docStatus)
      if (priority !== 'all') cases = cases.filter((c) => c.priority === priority)
      if (department) cases = cases.filter((c) => c.employeeDepartment?.toLowerCase().includes(department.toLowerCase()))
      if (employeeName) cases = cases.filter((c) => c.employeeName.toLowerCase().includes(employeeName.toLowerCase()))
      if (startDateFrom) cases = cases.filter((c) => c.startDate >= startDateFrom!)
      if (startDateTo) cases = cases.filter((c) => c.startDate <= startDateTo!)
      if (updatedAfter) cases = cases.filter((c) => toISO(c.updatedAt) >= updatedAfter!)

      if (minTenureYears !== undefined) {
        const employeeIds = [...new Set(cases.map((c) => c.employeeId))]
        const tenureMap: Record<string, number> = {}
        await Promise.all(
          employeeIds.map(async (id) => {
            const s = await db.collection('users').doc(id).get()
            if (s.exists) tenureMap[id] = s.data()!.tenureYears ?? 0
          })
        )
        cases = cases.filter((c) => (tenureMap[c.employeeId] ?? 0) >= minTenureYears!)
      }

      if (sortBy === 'priority') {
        const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
        cases.sort((a, b) => (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3))
      }

      const resultCount = cases.length
      return {
        ui_component: 'CaseTable',
        cases: cases.slice(0, limit),
        total: resultCount,
        tabName,
        filters: { status, leaveType, docStatus, priority, department, startDateFrom, startDateTo, updatedAfter, employeeName },
        exactMessage: `${tabName} tab created — ${resultCount} case${resultCount !== 1 ? 's' : ''}.`,
      }
    },
  }),

  get_case: tool({
    description: 'Get full details of a single case including all notes and document status.',
    inputSchema: z.object({
      caseId: z.string(),
    }),
    execute: async ({ caseId }) => {
      const db = getAdminDb()
      const snap = await db.collection('cases').doc(caseId).get()
      if (!snap.exists) return { error: `Case ${caseId} not found` }

      const docsSnap = await db.collection('documents').where('caseId', '==', caseId).get()
      const documents = docsSnap.docs.map((d) => d.data())

      return {
        ui_component: 'CaseCard',
        case: leanCase(snap.data()!, snap.id),
        documents,
      }
    },
  }),

  approve_case: tool({
    description: 'Approve a single leave case. Writes audit log and notifies employee.',
    inputSchema: z.object({
      caseId: z.string(),
      adminId: z.string(),
      note: z.string().optional().describe('Optional approval note'),
    }),
    execute: async ({ caseId, adminId, note }) => {
      const db = getAdminDb()
      const caseRef = db.collection('cases').doc(caseId)
      const caseSnap = await caseRef.get()
      if (!caseSnap.exists) return { error: 'Case not found' }
      const c = caseSnap.data() as CaseDoc

      const adminSnap = await db.collection('users').doc(adminId).get()
      const adminName = adminSnap.exists ? adminSnap.data()!.name : 'Admin'

      const now = FieldValue.serverTimestamp()
      await caseRef.update({
        status: 'approved',
        updatedAt: now,
        notes: [...(c.notes ?? []), {
          text: note ? `Approved — ${note}` : 'Leave request approved',
          actorId: adminId,
          actorName: adminName,
          actorRole: 'admin',
          timestamp: new Date().toISOString(),
        }],
      })

      await db.collection('notifications').add({
        targetUserId: c.employeeId,
        type: 'case_approved',
        caseId,
        message: `Your ${c.leaveType} leave (${c.startDate} to ${c.endDate}) has been approved.`,
        read: false,
        dismissed: false,
        createdAt: now,
      })

      await db.collection('audit_logs').add({
        caseId,
        actorId: adminId,
        actorRole: 'admin',
        action: 'case_approved',
        detail: note ?? 'Approved',
        timestamp: now,
      })

      return {
        success: true,
        caseId,
        status: 'approved',
        exactMessage: `Case #${caseId.slice(-6).toUpperCase()} approved. Employee notified.`,
      }
    },
  }),

  bulk_approve: tool({
    description: 'Bulk approve multiple low-risk cases at once. Always requires a prior confirm step.',
    inputSchema: z.object({
      adminId: z.string(),
      caseIds: z.array(z.string()).describe('Array of case IDs to approve'),
      confirmed: z.boolean().describe('Must be true — means admin said yes to the ConfirmCard'),
    }),
    execute: async ({ adminId, caseIds, confirmed }) => {
      if (!confirmed) {
        return { error: 'Bulk approve requires explicit confirmation.' }
      }

      const db = getAdminDb()
      const adminSnap = await db.collection('users').doc(adminId).get()
      const adminName = adminSnap.exists ? adminSnap.data()!.name : 'Admin'
      const now = FieldValue.serverTimestamp()
      const results: { caseId: string; status: string }[] = []

      await Promise.all(
        caseIds.map(async (caseId) => {
          const caseRef = db.collection('cases').doc(caseId)
          const caseSnap = await caseRef.get()
          if (!caseSnap.exists) {
            results.push({ caseId, status: 'not_found' })
            return
          }
          const c = caseSnap.data() as CaseDoc
          await caseRef.update({
            status: 'approved',
            updatedAt: now,
            notes: [...(c.notes ?? []), {
              text: 'Bulk approved',
              actorId: adminId,
              actorName: adminName,
              actorRole: 'admin',
              timestamp: new Date().toISOString(),
            }],
          })
          await db.collection('notifications').add({
            targetUserId: c.employeeId,
            type: 'case_approved',
            caseId,
            message: `Your ${c.leaveType} leave (${c.startDate} to ${c.endDate}) has been approved.`,
            read: false,
            dismissed: false,
            createdAt: now,
          })
          await db.collection('audit_logs').add({
            caseId,
            actorId: adminId,
            actorRole: 'admin',
            action: 'bulk_approved',
            detail: 'Bulk approved',
            timestamp: now,
          })
          results.push({ caseId, status: 'approved' })
        })
      )

      const approved = results.filter((r) => r.status === 'approved').length
      return {
        success: true,
        approved,
        total: caseIds.length,
        exactMessage: `${approved} case${approved !== 1 ? 's' : ''} approved. All employees notified.`,
      }
    },
  }),

  bulk_reject: tool({
    description: 'Reject multiple cases at once with reasons. Use when admin says "reject all flagged", "reject these 5 cases". Each case gets its own reason.',
    inputSchema: z.object({
      adminId: z.string(),
      cases: z.array(z.object({
        caseId: z.string(),
        reason: z.string(),
      })).describe('Array of {caseId, reason} pairs'),
    }),
    execute: async ({ adminId, cases: casesToReject }) => {
      const db = getAdminDb()
      const adminSnap = await db.collection('users').doc(adminId).get()
      const adminName = adminSnap.exists ? adminSnap.data()!.name : 'Admin'
      const now = FieldValue.serverTimestamp()
      const results: string[] = []

      for (const { caseId, reason } of casesToReject) {
        const caseRef = db.collection('cases').doc(caseId)
        const caseSnap = await caseRef.get()
        if (!caseSnap.exists) { results.push(`${caseId}: not found`); continue }
        const c = caseSnap.data() as CaseDoc

        await caseRef.update({
          status: 'rejected', rejectionReason: reason, updatedAt: now,
          notes: [...(c.notes ?? []), { text: `Rejected: ${reason}`, actorId: adminId, actorName: adminName, actorRole: 'admin', timestamp: new Date().toISOString() }],
        })

        // Restore balance
        const balanceKeyMap: Record<string, string> = { PTO: 'pto', Sick: 'sick', Personal: 'personal', Bereavement: 'bereavement', Maternity: 'maternity', Paternity: 'paternity', FMLA: 'fmla', Intermittent: 'fmla', CompOff: 'pto', EmergencyLeave: 'sick' }
        const key = balanceKeyMap[c.leaveType]
        if (key && c.leaveType !== 'Unpaid') {
          const userSnap = await db.collection('users').doc(c.employeeId).get()
          if (userSnap.exists) {
            await db.collection('users').doc(c.employeeId).update({ [`balances.${key}`]: (userSnap.data()!.balances?.[key] ?? 0) + c.days })
          }
        }

        await db.collection('notifications').add({ targetUserId: c.employeeId, type: 'case_rejected', caseId, message: `Your ${c.leaveType} leave was rejected. Reason: ${reason}`, read: false, dismissed: false, createdAt: now })
        results.push(`${c.employeeName}: rejected`)
      }

      return {
        success: true,
        rejected: results.length,
        total: casesToReject.length,
        exactMessage: `${results.length} case${results.length !== 1 ? 's' : ''} rejected. Balances restored, employees notified.`,
      }
    },
  }),

  reject_case: tool({
    description: 'Reject a single leave case. Reason is mandatory. Restores employee balance. For multiple rejections use bulk_reject instead.',
    inputSchema: z.object({
      caseId: z.string(),
      adminId: z.string(),
      reason: z.string().min(5).describe('Rejection reason — specific, not vague'),
    }),
    execute: async ({ caseId, adminId, reason }) => {
      const db = getAdminDb()
      const caseRef = db.collection('cases').doc(caseId)
      const caseSnap = await caseRef.get()
      if (!caseSnap.exists) return { error: 'Case not found' }
      const c = caseSnap.data() as CaseDoc

      const adminSnap = await db.collection('users').doc(adminId).get()
      const adminName = adminSnap.exists ? adminSnap.data()!.name : 'Admin'
      const now = FieldValue.serverTimestamp()

      await caseRef.update({
        status: 'rejected',
        rejectionReason: reason,
        updatedAt: now,
        notes: [...(c.notes ?? []), {
          text: `Rejected: ${reason}`,
          actorId: adminId,
          actorName: adminName,
          actorRole: 'admin',
          timestamp: new Date().toISOString(),
        }],
      })

      const balanceKeyMap: Record<string, string> = {
        PTO: 'pto', Sick: 'sick', Personal: 'personal', Bereavement: 'bereavement',
        Maternity: 'maternity', Paternity: 'paternity', FMLA: 'fmla', Intermittent: 'fmla',
        CompOff: 'pto', EmergencyLeave: 'sick',
      }
      const key = balanceKeyMap[c.leaveType]
      if (key && c.leaveType !== 'Unpaid') {
        const userSnap = await db.collection('users').doc(c.employeeId).get()
        if (userSnap.exists) {
          const userData = userSnap.data()!
          await db.collection('users').doc(c.employeeId).update({
            [`balances.${key}`]: (userData.balances?.[key] ?? 0) + c.days,
          })
        }
      }

      await db.collection('notifications').add({
        targetUserId: c.employeeId,
        type: 'case_rejected',
        caseId,
        message: `Your ${c.leaveType} leave request was rejected. Reason: ${reason}`,
        read: false,
        dismissed: false,
        createdAt: now,
      })

      await db.collection('audit_logs').add({
        caseId,
        actorId: adminId,
        actorRole: 'admin',
        action: 'case_rejected',
        detail: reason,
        timestamp: now,
      })

      return {
        success: true,
        caseId,
        status: 'rejected',
        exactMessage: `Case #${caseId.slice(-6).toUpperCase()} rejected. Balance restored, employee notified.`,
      }
    },
  }),

  add_note: tool({
    description: 'Add an admin note to a case for the audit trail.',
    inputSchema: z.object({
      caseId: z.string(),
      adminId: z.string(),
      note: z.string(),
    }),
    execute: async ({ caseId, adminId, note }) => {
      const db = getAdminDb()
      const caseRef = db.collection('cases').doc(caseId)
      const caseSnap = await caseRef.get()
      if (!caseSnap.exists) return { error: 'Case not found' }
      const c = caseSnap.data() as CaseDoc

      const adminSnap = await db.collection('users').doc(adminId).get()
      const adminName = adminSnap.exists ? adminSnap.data()!.name : 'Admin'

      await caseRef.update({
        updatedAt: FieldValue.serverTimestamp(),
        notes: [...(c.notes ?? []), {
          text: note,
          actorId: adminId,
          actorName: adminName,
          actorRole: 'admin',
          timestamp: new Date().toISOString(),
        }],
      })

      return { success: true, caseId, message: `Note added to case #${caseId.slice(-6).toUpperCase()}.` }
    },
  }),

  get_case_history: tool({
    description: 'Get full audit trail for a case including all notes, status changes, and document events.',
    inputSchema: z.object({
      caseId: z.string(),
    }),
    execute: async ({ caseId }) => {
      const db = getAdminDb()
      const [caseSnap, logsSnap] = await Promise.all([
        db.collection('cases').doc(caseId).get(),
        db.collection('audit_logs').where('caseId', '==', caseId).get(),
      ])

      if (!caseSnap.exists) return { error: 'Case not found' }

      const logs = logsSnap.docs
        .map((d) => ({ ...d.data(), timestamp: toISO(d.data().timestamp) }))
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp))

      return {
        ui_component: 'CaseCard',
        case: leanCase(caseSnap.data()!, caseSnap.id),
        auditLogs: logs,
      }
    },
  }),

  request_bulk_approve_candidates: tool({
    description: 'Identify low-risk cases eligible for bulk approval. Returns a ConfirmCard for admin to review before final approval.',
    inputSchema: z.object({
      adminId: z.string(),
      leaveType: z.enum(['PTO', 'all']).optional().default('PTO'),
      maxDays: z.number().optional().default(5),
      withinDays: z.number().optional().default(7).describe('Cases submitted within the last N days'),
    }),
    execute: async ({ adminId, leaveType, maxDays, withinDays }) => {
      const db = getAdminDb()
      const adminSnap = await db.collection('users').doc(adminId).get()
      if (!adminSnap.exists) return { error: 'Admin not found' }
      const managedIds: string[] = adminSnap.data()!.managedEmployeeIds ?? []

      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - withinDays)

      const snap = await db.collection('cases')
        .where('status', '==', 'open')
        .get()

      let candidates = snap.docs
        .map((d) => leanCase(d.data(), d.id))
        .filter((c) => {
          if (c.docStatus !== 'not_required') return false
          if (managedIds.length > 0 && !managedIds.includes(c.employeeId)) return false
          if (leaveType !== 'all' && c.leaveType !== leaveType) return false
          if (c.days > maxDays) return false
          if (new Date(c.createdAt) < cutoff) return false
          return true
        })

      return {
        ui_component: 'ConfirmCard',
        action: 'bulk_approve',
        candidates: candidates.slice(0, 20),
        count: candidates.length,
        message: `Found ${candidates.length} low-risk ${leaveType === 'all' ? '' : leaveType + ' '}case${candidates.length !== 1 ? 's' : ''} eligible for bulk approval. Reply "yes" to confirm.`,
      }
    },
  }),

  list_employees: tool({
    description: 'List all employees the admin currently manages, or all employees in the org. Shows name, department, tenure, and whether they are managed by this admin.',
    inputSchema: z.object({
      adminId: z.string(),
      showAll: z.boolean().optional().default(false).describe('true = show ALL employees in org, false = only managed ones'),
    }),
    execute: async ({ adminId, showAll }) => {
      const db = getAdminDb()
      const adminSnap = await db.collection('users').doc(adminId).get()
      if (!adminSnap.exists) return { error: 'Admin not found' }
      const managedIds: string[] = adminSnap.data()!.managedEmployeeIds ?? []

      const snap = await db.collection('users').where('role', '==', 'employee').get()
      let employees = snap.docs.map(d => ({
        uid: d.id,
        name: d.data().name,
        email: d.data().email,
        department: d.data().department,
        jobTitle: d.data().jobTitle ?? '',
        tenureYears: d.data().tenureYears ?? 0,
        isManaged: managedIds.length === 0 || managedIds.includes(d.id),
      }))

      if (!showAll && managedIds.length > 0) {
        employees = employees.filter(e => e.isManaged)
      }

      employees.sort((a, b) => a.name.localeCompare(b.name))

      return {
        employees,
        managedCount: employees.filter(e => e.isManaged).length,
        totalCount: employees.length,
        message: showAll
          ? `${employees.length} employees in org, ${managedIds.length > 0 ? managedIds.length + ' managed by you' : 'you manage all'}.`
          : `${employees.length} managed employee${employees.length !== 1 ? 's' : ''}.`,
      }
    },
  }),

  manage_employee: tool({
    description: 'Add or remove an employee from the admin managed list. Use action "add" to start managing an employee, "remove" to stop.',
    inputSchema: z.object({
      adminId: z.string(),
      employeeId: z.string().describe('The uid of the employee to add or remove'),
      action: z.enum(['add', 'remove']),
    }),
    execute: async ({ adminId, employeeId, action }) => {
      const db = getAdminDb()
      const adminRef = db.collection('users').doc(adminId)
      const adminSnap = await adminRef.get()
      if (!adminSnap.exists) return { error: 'Admin not found' }

      const empSnap = await db.collection('users').doc(employeeId).get()
      if (!empSnap.exists) return { error: 'Employee not found' }
      const empName = empSnap.data()!.name

      const currentManaged: string[] = adminSnap.data()!.managedEmployeeIds ?? []

      if (action === 'add') {
        if (currentManaged.includes(employeeId)) {
          return { success: true, message: `${empName} is already in your managed list.` }
        }
        await adminRef.update({ managedEmployeeIds: [...currentManaged, employeeId] })
        return { success: true, message: `Added ${empName} to your managed employees. You can now see their cases.` }
      } else {
        if (!currentManaged.includes(employeeId)) {
          return { success: true, message: `${empName} is not in your managed list.` }
        }
        await adminRef.update({ managedEmployeeIds: currentManaged.filter(id => id !== employeeId) })
        return { success: true, message: `Removed ${empName} from your managed employees. Their cases will no longer appear in your queue.` }
      }
    },
  }),

  search_employees: tool({
    description: 'Search for employees by name or department. Use this when admin says "find employee John" or "who is in Engineering".',
    inputSchema: z.object({
      query: z.string().describe('Name or department to search'),
    }),
    execute: async ({ query }) => {
      const db = getAdminDb()
      const snap = await db.collection('users').where('role', '==', 'employee').get()
      const q = query.toLowerCase()

      const results = snap.docs
        .map(d => ({ uid: d.id, ...d.data() }))
        .filter((e: any) =>
          e.name?.toLowerCase().includes(q) ||
          e.department?.toLowerCase().includes(q) ||
          e.email?.toLowerCase().includes(q)
        )
        .map((e: any) => ({
          uid: e.uid,
          name: e.name,
          email: e.email,
          department: e.department,
          tenureYears: e.tenureYears ?? 0,
        }))

      return {
        results,
        total: results.length,
        message: results.length === 0
          ? `No employees found matching "${query}".`
          : `Found ${results.length} employee${results.length !== 1 ? 's' : ''} matching "${query}".`,
      }
    },
  }),

  trigger_review: tool({
    description: 'Open the AI Review Dialog on the admin dashboard to review cases with two AI agents. Call this when admin says "review", "analyze", "check these cases", "review first N", "review [type] cases". The dashboard will open a full-screen review panel showing Agent 1 (Reviewer) and Agent 2 (Validator) analyzing each case.',
    inputSchema: z.object({
      adminId: z.string(),
      caseIds: z.array(z.string()).describe('Array of case IDs to review. If admin says "first 5", pass only 5.'),
      tabName: z.string().describe('Human-readable name for this review session, e.g. "Personal Cases", "First 10 PTO", "Engineering Urgent"'),
    }),
    execute: async ({ adminId, caseIds, tabName }) => {
      return {
        ui_component: 'ReviewTrigger',
        caseIds,
        tabName,
        total: caseIds.length,
        message: `Opening AI Review for ${caseIds.length} cases — "${tabName}"`,
      }
    },
  }),
}
