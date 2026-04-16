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
    description: 'Query and filter cases for admin. Supports natural language filter parameters including status, leave type, department, tenure, doc status, date range, and priority. Returns CaseTable component.',
    inputSchema: z.object({
      adminId: z.string(),
      status: z.enum(['all', 'open', 'pending_docs', 'approved', 'rejected', 'cancelled', 'under_review']).optional().default('all'),
      leaveType: z.enum(['all', 'PTO', 'Sick', 'FMLA', 'Maternity', 'Paternity', 'Bereavement', 'Personal', 'Intermittent', 'Unpaid', 'CompOff', 'EmergencyLeave']).optional().default('all'),
      docStatus: z.enum(['all', 'uploaded', 'missing', 'not_required', 'invalid']).optional().default('all'),
      priority: z.enum(['all', 'critical', 'high', 'medium', 'low']).optional().default('all'),
      department: z.string().optional(),
      minTenureYears: z.number().optional().describe('Minimum employee tenure in years'),
      startDateFrom: z.string().optional().describe('ISO date — filter cases starting from this date'),
      startDateTo: z.string().optional().describe('ISO date — filter cases up to this date'),
      employeeName: z.string().optional().describe('Partial employee name search'),
      sortBy: z.enum(['createdAt', 'startDate', 'priority']).optional().default('createdAt'),
      limit: z.number().optional().default(50),
    }),
    execute: async ({ adminId, status, leaveType, docStatus, priority, department, minTenureYears, startDateFrom, startDateTo, employeeName, sortBy, limit }) => {
      const db = getAdminDb()

      const adminSnap = await db.collection('users').doc(adminId).get()
      if (!adminSnap.exists) return { error: 'Admin not found' }
      const adminData = adminSnap.data()!
      const managedIds: string[] = adminData.managedEmployeeIds ?? []

      const orderField = sortBy === 'priority' ? 'createdAt' : (sortBy ?? 'createdAt')
      const snap = await db.collection('cases').orderBy(orderField, 'desc').get()

      let cases = snap.docs.map((d) => leanCase(d.data(), d.id))

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

      return {
        ui_component: 'CaseTable',
        cases: cases.slice(0, limit),
        total: cases.length,
        filters: { status, leaveType, docStatus, priority, department },
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
        ui_component: 'CaseCard',
        success: true,
        caseId,
        status: 'approved',
        message: `Case #${caseId.slice(-6).toUpperCase()} approved. Employee notified.`,
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
        message: `${approved} case${approved !== 1 ? 's' : ''} approved successfully. All employees notified.`,
      }
    },
  }),

  reject_case: tool({
    description: 'Reject a leave case. Reason is mandatory. Restores employee balance.',
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
        ui_component: 'CaseCard',
        success: true,
        caseId,
        status: 'rejected',
        message: `Case #${caseId.slice(-6).toUpperCase()} rejected. Employee balance restored and notified.`,
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
        db.collection('audit_logs').where('caseId', '==', caseId).orderBy('timestamp', 'asc').get(),
      ])

      if (!caseSnap.exists) return { error: 'Case not found' }

      const logs = logsSnap.docs.map((d) => ({
        ...d.data(),
        timestamp: toISO(d.data().timestamp),
      }))

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
        .where('docStatus', '==', 'not_required')
        .get()

      let candidates = snap.docs
        .map((d) => leanCase(d.data(), d.id))
        .filter((c) => {
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
}
