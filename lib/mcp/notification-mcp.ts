/**
 * notification-mcp — Persistent notification management
 * Tools: get_unread_notifications, mark_read, send_employee_reminder, get_proactive_alerts
 */
import { tool } from 'ai'
import { z } from 'zod'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminDb } from '@/lib/firebase/admin'
import type { CaseDoc } from '@/lib/firebase/types'

function toISO(ts: any): string {
  if (!ts) return new Date().toISOString()
  if (typeof ts === 'string') return ts
  if (ts?.toDate) return ts.toDate().toISOString()
  return new Date().toISOString()
}

export const notificationMcpTools = {
  get_unread_notifications: tool({
    description: 'Get all unread, non-dismissed notifications for a user.',
    inputSchema: z.object({
      userId: z.string(),
    }),
    execute: async ({ userId }) => {
      const db = getAdminDb()
      const snap = await db.collection('notifications')
        .where('targetUserId', '==', userId)
        .where('dismissed', '==', false)
        .get()

      const notifications = snap.docs
        .map((d) => ({
          notificationId: d.id,
          ...d.data(),
          createdAt: toISO(d.data().createdAt),
        }))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

      return {
        notifications,
        unreadCount: notifications.filter((n) => !(n as any).read).length,
        total: notifications.length,
      }
    },
  }),

  mark_read: tool({
    description: 'Mark one or all notifications as read for a user.',
    inputSchema: z.object({
      userId: z.string(),
      notificationId: z.string().optional().describe('If omitted, marks all as read'),
    }),
    execute: async ({ userId, notificationId }) => {
      const db = getAdminDb()
      if (notificationId) {
        await db.collection('notifications').doc(notificationId).update({ read: true })
        return { success: true, marked: 1 }
      }

      const snap = await db.collection('notifications')
        .where('targetUserId', '==', userId)
        .where('read', '==', false)
        .get()

      const batch = db.batch()
      snap.docs.forEach((d) => batch.update(d.ref, { read: true }))
      await batch.commit()

      return { success: true, marked: snap.size }
    },
  }),

  send_employee_reminder: tool({
    description: 'Send a document reminder notification to an employee with a pending document case.',
    inputSchema: z.object({
      caseId: z.string(),
      adminId: z.string(),
      customMessage: z.string().optional(),
    }),
    execute: async ({ caseId, adminId, customMessage }) => {
      const db = getAdminDb()
      const caseSnap = await db.collection('cases').doc(caseId).get()
      if (!caseSnap.exists) return { error: 'Case not found' }
      const c = caseSnap.data() as CaseDoc

      const message = customMessage ??
        `Reminder: Your ${c.leaveType} leave request (${c.startDate} to ${c.endDate}) is pending document submission. Please upload your certificate.`

      await db.collection('notifications').add({
        targetUserId: c.employeeId,
        type: 'document_reminder',
        caseId,
        message,
        read: false,
        dismissed: false,
        createdAt: FieldValue.serverTimestamp(),
      })

      return {
        success: true,
        employeeId: c.employeeId,
        employeeName: c.employeeName,
        message: `Reminder sent to ${c.employeeName} for case #${caseId.slice(-6).toUpperCase()}.`,
      }
    },
  }),

  get_proactive_alerts: tool({
    description: 'Run proactive intelligence scan for an admin. Checks FMLA expiries, SLA breaches, pending docs overdue. Fires once per session.',
    inputSchema: z.object({
      adminId: z.string(),
    }),
    execute: async ({ adminId }) => {
      const db = getAdminDb()
      const adminSnap = await db.collection('users').doc(adminId).get()
      if (!adminSnap.exists) return { alerts: [] }
      const managedIds: string[] = adminSnap.data()!.managedEmployeeIds ?? []

      const snap = await db.collection('cases').get()

      const activeStatuses = ['open', 'pending_docs', 'under_review']
      let cases = snap.docs
        .map((d) => ({ caseId: d.id, ...d.data() } as CaseDoc & { caseId: string }))
        .filter((c) => activeStatuses.includes(c.status))
        .sort((a, b) => toISO((b as any).createdAt).localeCompare(toISO((a as any).createdAt)))
      if (managedIds.length > 0) {
        cases = cases.filter((c) => managedIds.includes(c.employeeId))
      }

      const alerts: Array<{
        type: string
        severity: 'critical' | 'high' | 'medium'
        caseId: string
        employeeName: string
        message: string
        daysRemaining?: number
      }> = []

      const now = new Date()

      for (const c of cases) {
        if (c.fmlaExpiry && (c.leaveType === 'FMLA' || c.leaveType === 'Intermittent')) {
          const expiry = new Date(c.fmlaExpiry)
          const daysUntilExpiry = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          if (daysUntilExpiry <= 7 && daysUntilExpiry > 0) {
            alerts.push({
              type: 'fmla_expiry',
              severity: daysUntilExpiry <= 3 ? 'critical' : 'high',
              caseId: c.caseId,
              employeeName: c.employeeName,
              message: `FMLA certification for ${c.employeeName} expires in ${daysUntilExpiry} day${daysUntilExpiry !== 1 ? 's' : ''}. Action: Request form WH-380 renewal.`,
              daysRemaining: daysUntilExpiry,
            })
          }
        }

        if (c.status === 'pending_docs' && c.createdAt) {
          const createdAt = (c.createdAt as any)?.toDate?.() ?? new Date(c.createdAt as any)
          const daysOpen = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24))
          if (daysOpen >= 3) {
            alerts.push({
              type: 'sla_breach',
              severity: daysOpen >= 5 ? 'critical' : 'high',
              caseId: c.caseId,
              employeeName: c.employeeName,
              message: `Case for ${c.employeeName} has been pending documents for ${daysOpen} day${daysOpen !== 1 ? 's' : ''}. SLA risk.`,
            })
          }
        }
      }

      const openCount = cases.filter((c) => c.status === 'open').length
      const pendingDocsCount = cases.filter((c) => c.status === 'pending_docs').length
      const underReviewCount = cases.filter((c) => c.status === 'under_review').length

      return {
        ui_component: 'ProactiveAlertCard',
        alerts,
        summary: {
          openCount,
          pendingDocsCount,
          underReviewCount,
          totalManagedCases: cases.length,
          criticalAlerts: alerts.filter((a) => a.severity === 'critical').length,
        },
        exactMessage: alerts.length === 0
          ? `${cases.length} managed cases, ${openCount} open, ${pendingDocsCount} pending docs — no critical alerts today.`
          : `${cases.length} managed cases. ${alerts.length} alert${alerts.length !== 1 ? 's' : ''}: ${alerts.filter(a => a.severity === 'critical').length} critical, ${alerts.filter(a => a.severity === 'high').length} high. ${openCount} open, ${pendingDocsCount} pending docs.`,
      }
    },
  }),
}
