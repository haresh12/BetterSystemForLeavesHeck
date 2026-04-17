/**
 * analytics-mcp — Aggregation and trend analysis
 * Tools: get_department_trends, get_case_volume_by_period, get_approval_rate_by_type
 */
import { tool } from 'ai'
import { z } from 'zod'
import { getAdminDb } from '@/lib/firebase/admin'
import type { CaseDoc } from '@/lib/firebase/types'

function toISO(ts: any): string {
  if (!ts) return new Date().toISOString()
  if (typeof ts === 'string') return ts
  if (ts?.toDate) return ts.toDate().toISOString()
  return new Date().toISOString()
}

export const analyticsMcpTools = {
  get_department_trends: tool({
    description: 'Get absence trends by department for a given time period. Returns data for BarChart rendering.',
    inputSchema: z.object({
      adminId: z.string(),
      periodDays: z.number().optional().default(90).describe('Number of days to look back'),
    }),
    execute: async ({ adminId, periodDays }) => {
      const db = getAdminDb()
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - periodDays)
      const cutoffISO = cutoff.toISOString()

      const snap = await db.collection('cases').get()

      const validStatuses = ['approved', 'open', 'under_review']
      const cases = snap.docs
        .map((d) => ({ caseId: d.id, ...d.data() } as CaseDoc & { caseId: string }))
        .filter((c) => validStatuses.includes(c.status) && toISO((c as any).createdAt) >= cutoffISO)

      const deptMap: Record<string, {
        department: string
        totalDays: number
        caseCount: number
        byType: Record<string, number>
      }> = {}

      for (const c of cases) {
        const dept = c.employeeDepartment ?? 'Unknown'
        if (!deptMap[dept]) {
          deptMap[dept] = { department: dept, totalDays: 0, caseCount: 0, byType: {} }
        }
        deptMap[dept].totalDays += c.days
        deptMap[dept].caseCount += 1
        deptMap[dept].byType[c.leaveType] = (deptMap[dept].byType[c.leaveType] ?? 0) + c.days
      }

      const chartData = Object.values(deptMap).sort((a, b) => b.totalDays - a.totalDays)

      return {
        ui_component: 'TrendCard',
        chartType: 'bar',
        title: `Absence by Department (Last ${periodDays} days)`,
        data: chartData,
        periodDays,
        totalCases: cases.length,
      }
    },
  }),

  get_case_volume_by_period: tool({
    description: 'Get case volume over time (weekly breakdown). Returns time-series data for charts.',
    inputSchema: z.object({
      adminId: z.string(),
      weeks: z.number().optional().default(12),
    }),
    execute: async ({ adminId, weeks }) => {
      const db = getAdminDb()
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - weeks * 7)
      const cutoffISO = cutoff.toISOString()

      const snap = await db.collection('cases').get()

      const cases = snap.docs
        .map((d) => ({ ...d.data() } as CaseDoc))
        .filter((c) => toISO((c as any).createdAt) >= cutoffISO)

      const weekMap: Record<string, { week: string; submitted: number; approved: number; rejected: number }> = {}

      for (const c of cases) {
        const date = new Date(toISO((c as any).createdAt))
        const weekStart = new Date(date)
        weekStart.setDate(date.getDate() - date.getDay())
        const weekKey = weekStart.toISOString().split('T')[0]

        if (!weekMap[weekKey]) {
          weekMap[weekKey] = { week: weekKey, submitted: 0, approved: 0, rejected: 0 }
        }
        weekMap[weekKey].submitted += 1
        if (c.status === 'approved') weekMap[weekKey].approved += 1
        if (c.status === 'rejected') weekMap[weekKey].rejected += 1
      }

      const chartData = Object.values(weekMap).sort((a, b) => a.week.localeCompare(b.week))

      return {
        ui_component: 'TrendCard',
        chartType: 'line',
        title: `Case Volume — Last ${weeks} Weeks`,
        data: chartData,
      }
    },
  }),

  get_approval_rate_by_type: tool({
    description: 'Get approval vs rejection rates broken down by leave type.',
    inputSchema: z.object({
      adminId: z.string(),
      periodDays: z.number().optional().default(90),
    }),
    execute: async ({ adminId, periodDays }) => {
      const db = getAdminDb()
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - periodDays)
      const cutoffISO = cutoff.toISOString()

      const snap = await db.collection('cases').get()

      const cases = snap.docs
        .map((d) => d.data() as CaseDoc)
        .filter((c) => ['approved', 'rejected'].includes(c.status) && toISO((c as any).createdAt) >= cutoffISO)

      const typeMap: Record<string, { leaveType: string; approved: number; rejected: number; total: number; approvalRate: number }> = {}

      for (const c of cases) {
        if (!typeMap[c.leaveType]) {
          typeMap[c.leaveType] = { leaveType: c.leaveType, approved: 0, rejected: 0, total: 0, approvalRate: 0 }
        }
        typeMap[c.leaveType].total += 1
        if (c.status === 'approved') typeMap[c.leaveType].approved += 1
        if (c.status === 'rejected') typeMap[c.leaveType].rejected += 1
      }

      Object.values(typeMap).forEach((t) => {
        t.approvalRate = t.total > 0 ? Math.round((t.approved / t.total) * 100) : 0
      })

      const chartData = Object.values(typeMap).sort((a, b) => b.total - a.total)

      return {
        ui_component: 'TrendCard',
        chartType: 'bar',
        title: 'Approval Rate by Leave Type',
        data: chartData,
        periodDays,
      }
    },
  }),
}
