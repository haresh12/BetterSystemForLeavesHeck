/**
 * intelligence-mcp — Smart analysis tools for admin
 * Tools: get_case_risk_assessment, detect_leave_patterns, get_team_coverage, simulate_approval_impact
 */
import { tool } from 'ai'
import { z } from 'zod'
import { getAdminDb } from '@/lib/firebase/admin'
import type { CaseDoc } from '@/lib/firebase/types'
import { COMPANY_HOLIDAYS } from '@/lib/utils'

function toISO(ts: any): string {
  if (!ts) return new Date().toISOString()
  if (typeof ts === 'string') return ts
  if (ts?.toDate) return ts.toDate().toISOString()
  return new Date().toISOString()
}

export const intelligenceMcpTools = {
  get_case_risk_assessment: tool({
    description: 'AI risk assessment for a case. Analyzes employee history, team impact, document status, patterns. Returns recommendation: APPROVE / HOLD / REJECT with reasoning.',
    inputSchema: z.object({
      caseId: z.string(),
      adminId: z.string(),
    }),
    execute: async ({ caseId, adminId }) => {
      const db = getAdminDb()
      const caseSnap = await db.collection('cases').doc(caseId).get()
      if (!caseSnap.exists) return { error: 'Case not found' }
      const c = { caseId, ...caseSnap.data() } as CaseDoc & { caseId: string }

      // Get employee history
      const historySnap = await db.collection('cases').where('employeeId', '==', c.employeeId).get()
      const history = historySnap.docs.map(d => ({ caseId: d.id, ...d.data() } as CaseDoc & { caseId: string }))

      // Get employee info
      const empSnap = await db.collection('users').doc(c.employeeId).get()
      const emp = empSnap.exists ? empSnap.data()! : {}

      // Get team overlaps (same dept, overlapping dates, approved/open)
      const allCasesSnap = await db.collection('cases').get()
      const teamOverlaps = allCasesSnap.docs
        .map(d => ({ caseId: d.id, ...d.data() } as CaseDoc & { caseId: string }))
        .filter(tc =>
          tc.caseId !== caseId &&
          tc.employeeDepartment === c.employeeDepartment &&
          ['approved', 'open'].includes(tc.status) &&
          tc.startDate <= c.endDate && tc.endDate >= c.startDate
        )

      // Get document status
      const docSnap = await db.collection('documents').where('caseId', '==', caseId).get()
      const hasValidDoc = docSnap.docs.some(d => d.data().status === 'valid')

      // Risk factors
      const factors: Array<{ factor: string; score: 'low' | 'medium' | 'high'; detail: string }> = []

      // 1. Document status
      if (c.certificateRequired) {
        if (hasValidDoc) {
          factors.push({ factor: 'Document', score: 'low', detail: 'Valid certificate uploaded and verified' })
        } else {
          factors.push({ factor: 'Document', score: 'high', detail: 'Certificate required but not uploaded' })
        }
      } else {
        factors.push({ factor: 'Document', score: 'low', detail: 'No certificate required for this leave type' })
      }

      // 2. Team impact
      const deptEmployeesSnap = await db.collection('users').where('department', '==', c.employeeDepartment).get()
      const deptSize = deptEmployeesSnap.size
      const outCount = teamOverlaps.length + 1
      const coveragePct = Math.round(((deptSize - outCount) / deptSize) * 100)
      if (coveragePct < 50) {
        factors.push({ factor: 'Team Coverage', score: 'high', detail: `${c.employeeDepartment} drops to ${coveragePct}% (${deptSize - outCount}/${deptSize}) during this period` })
      } else if (coveragePct < 70) {
        factors.push({ factor: 'Team Coverage', score: 'medium', detail: `${c.employeeDepartment} at ${coveragePct}% coverage (${outCount} people out)` })
      } else {
        factors.push({ factor: 'Team Coverage', score: 'low', detail: `${c.employeeDepartment} at ${coveragePct}% coverage — no staffing concerns` })
      }

      // 3. Employee track record
      const rejected = history.filter(h => h.status === 'rejected').length
      const total = history.length
      if (rejected >= 2) {
        factors.push({ factor: 'Track Record', score: 'medium', detail: `${rejected} of ${total} past requests were rejected` })
      } else {
        factors.push({ factor: 'Track Record', score: 'low', detail: `Clean history — ${total} past requests, ${rejected} rejected` })
      }

      // 4. Monday/Friday sick pattern
      if (c.leaveType === 'Sick') {
        const sickHistory = history.filter(h => h.leaveType === 'Sick')
        const monFriSick = sickHistory.filter(h => {
          const dow = new Date(h.startDate + 'T00:00:00').getDay()
          return dow === 1 || dow === 5
        })
        if (sickHistory.length >= 3 && monFriSick.length / sickHistory.length > 0.5) {
          factors.push({ factor: 'Pattern Alert', score: 'high', detail: `${monFriSick.length}/${sickHistory.length} sick leaves fall on Monday/Friday — potential pattern` })
        }
      }

      // 5. Tenure
      const tenure = emp.tenureYears ?? 0
      if (tenure < 1) {
        factors.push({ factor: 'Tenure', score: 'medium', detail: `New employee — ${tenure < 1 ? 'less than 1 year' : tenure + ' years'} tenure` })
      } else {
        factors.push({ factor: 'Tenure', score: 'low', detail: `${tenure} years with the company` })
      }

      // Overall risk
      const highCount = factors.filter(f => f.score === 'high').length
      const medCount = factors.filter(f => f.score === 'medium').length
      const overallRisk = highCount >= 2 ? 'high' : highCount >= 1 ? 'medium' : medCount >= 2 ? 'medium' : 'low'
      const recommendation = overallRisk === 'high' ? 'HOLD — review risk factors before approving'
        : overallRisk === 'medium' ? 'APPROVE WITH NOTE — minor concerns noted'
        : 'APPROVE — low risk, no concerns'

      return {
        caseId,
        employeeName: c.employeeName,
        leaveType: c.leaveType,
        days: c.days,
        startDate: c.startDate,
        endDate: c.endDate,
        overallRisk,
        recommendation,
        factors,
        teamOverlaps: teamOverlaps.map(t => ({ employeeName: t.employeeName, leaveType: t.leaveType, dates: `${t.startDate} → ${t.endDate}` })),
        coveragePct,
        deptSize,
      }
    },
  }),

  detect_leave_patterns: tool({
    description: 'Detect suspicious or anomalous leave patterns across all managed employees. Finds Monday/Friday sick clustering, holiday-adjacent patterns, escalating frequency, and more.',
    inputSchema: z.object({
      adminId: z.string(),
      lookbackDays: z.number().optional().default(180),
    }),
    execute: async ({ adminId, lookbackDays }) => {
      const db = getAdminDb()
      const adminSnap = await db.collection('users').doc(adminId).get()
      const managedIds: string[] = adminSnap.exists ? (adminSnap.data()!.managedEmployeeIds ?? []) : []

      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - lookbackDays)
      const cutoffISO = cutoff.toISOString()

      const snap = await db.collection('cases').get()
      let allCases = snap.docs
        .map(d => ({ caseId: d.id, ...d.data() } as CaseDoc & { caseId: string }))
        .filter(c => toISO((c as any).createdAt) >= cutoffISO)
      if (managedIds.length > 0) {
        allCases = allCases.filter(c => managedIds.includes(c.employeeId))
      }

      // Group by employee
      const byEmployee: Record<string, (CaseDoc & { caseId: string })[]> = {}
      for (const c of allCases) {
        if (!byEmployee[c.employeeId]) byEmployee[c.employeeId] = []
        byEmployee[c.employeeId].push(c)
      }

      const patterns: Array<{
        pattern: string
        severity: 'high' | 'medium' | 'low'
        employeeName: string
        employeeId: string
        detail: string
        dataPoints: number
      }> = []

      const holidayDates = Object.keys(COMPANY_HOLIDAYS)

      for (const [empId, cases] of Object.entries(byEmployee)) {
        const empName = cases[0]?.employeeName ?? empId
        const sickCases = cases.filter(c => c.leaveType === 'Sick')

        // Pattern 1: Monday/Friday sick clustering
        if (sickCases.length >= 3) {
          const monFri = sickCases.filter(c => {
            const dow = new Date(c.startDate + 'T00:00:00').getDay()
            return dow === 1 || dow === 5
          })
          if (monFri.length / sickCases.length >= 0.5 && monFri.length >= 2) {
            patterns.push({
              pattern: 'Monday/Friday Sick Clustering',
              severity: monFri.length >= 4 ? 'high' : 'medium',
              employeeName: empName,
              employeeId: empId,
              detail: `${monFri.length} of ${sickCases.length} sick leaves fall on Monday or Friday`,
              dataPoints: monFri.length,
            })
          }
        }

        // Pattern 2: Holiday-adjacent leaves
        const adjacentLeaves = cases.filter(c => {
          const start = new Date(c.startDate + 'T00:00:00')
          const dayBefore = new Date(start.getTime() - 86400000).toISOString().split('T')[0]
          const end = new Date(c.endDate + 'T00:00:00')
          const dayAfter = new Date(end.getTime() + 86400000).toISOString().split('T')[0]
          return holidayDates.includes(dayBefore) || holidayDates.includes(dayAfter) ||
                 holidayDates.includes(c.startDate) || holidayDates.includes(c.endDate)
        })
        if (adjacentLeaves.length >= 2) {
          patterns.push({
            pattern: 'Holiday-Adjacent Leave Pattern',
            severity: 'medium',
            employeeName: empName,
            employeeId: empId,
            detail: `${adjacentLeaves.length} leaves taken adjacent to company holidays`,
            dataPoints: adjacentLeaves.length,
          })
        }

        // Pattern 3: Frequent short sick leaves (5+ single-day sick in 90 days)
        const recentSick = sickCases.filter(c => {
          const d = new Date()
          d.setDate(d.getDate() - 90)
          return toISO((c as any).createdAt) >= d.toISOString() && c.days === 1
        })
        if (recentSick.length >= 5) {
          patterns.push({
            pattern: 'Frequent Short Sick Leaves',
            severity: 'high',
            employeeName: empName,
            employeeId: empId,
            detail: `${recentSick.length} single-day sick leaves in the last 90 days`,
            dataPoints: recentSick.length,
          })
        }

        // Pattern 4: Escalating leave frequency
        const now = new Date()
        const q1Cases = cases.filter(c => {
          const d = new Date(toISO((c as any).createdAt))
          const monthsAgo = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24 * 30)
          return monthsAgo >= 3 && monthsAgo < 6
        })
        const q2Cases = cases.filter(c => {
          const d = new Date(toISO((c as any).createdAt))
          const monthsAgo = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24 * 30)
          return monthsAgo < 3
        })
        if (q1Cases.length > 0 && q2Cases.length >= q1Cases.length * 2) {
          patterns.push({
            pattern: 'Escalating Leave Frequency',
            severity: 'medium',
            employeeName: empName,
            employeeId: empId,
            detail: `Leave requests doubled: ${q1Cases.length} (3-6 months ago) → ${q2Cases.length} (last 3 months)`,
            dataPoints: q2Cases.length,
          })
        }
      }

      patterns.sort((a, b) => {
        const sev = { high: 0, medium: 1, low: 2 }
        return sev[a.severity] - sev[b.severity]
      })

      return {
        patterns,
        totalEmployeesScanned: Object.keys(byEmployee).length,
        totalPatternsFound: patterns.length,
        lookbackDays,
        message: patterns.length === 0
          ? 'No suspicious patterns detected across your managed employees.'
          : `Found ${patterns.length} pattern${patterns.length > 1 ? 's' : ''} across ${new Set(patterns.map(p => p.employeeId)).size} employee${new Set(patterns.map(p => p.employeeId)).size > 1 ? 's' : ''}.`,
      }
    },
  }),

  get_team_coverage: tool({
    description: 'Show team coverage for upcoming days. Which departments are understaffed? How many people are out each day?',
    inputSchema: z.object({
      adminId: z.string(),
      department: z.string().optional().describe('Filter to one department, or all if omitted'),
      days: z.number().optional().default(5).describe('Number of business days to look ahead'),
    }),
    execute: async ({ adminId, department, days }) => {
      const db = getAdminDb()

      // Get all users by department
      const usersSnap = await db.collection('users').where('role', '==', 'employee').get()
      const deptHeadcount: Record<string, number> = {}
      for (const u of usersSnap.docs) {
        const d = u.data().department
        if (department && d !== department) continue
        deptHeadcount[d] = (deptHeadcount[d] ?? 0) + 1
      }

      // Get approved/open cases
      const casesSnap = await db.collection('cases').get()
      const activeCases = casesSnap.docs
        .map(d => ({ caseId: d.id, ...d.data() } as CaseDoc & { caseId: string }))
        .filter(c => ['approved', 'open'].includes(c.status))

      // Build day-by-day coverage
      const today = new Date()
      const coverage: Array<{
        date: string
        dayOfWeek: string
        departments: Array<{
          department: string
          total: number
          out: number
          available: number
          pct: number
          outNames: string[]
        }>
      }> = []

      for (let i = 0; i < days + 3; i++) {
        const d = new Date(today)
        d.setDate(today.getDate() + i)
        if (d.getDay() === 0 || d.getDay() === 6) continue // skip weekends
        if (coverage.length >= days) break

        const dateStr = d.toISOString().split('T')[0]
        const dayName = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

        const dayDepts: typeof coverage[0]['departments'] = []
        for (const [dept, headcount] of Object.entries(deptHeadcount)) {
          const outCases = activeCases.filter(c =>
            c.employeeDepartment === dept &&
            c.startDate <= dateStr && c.endDate >= dateStr
          )
          const outCount = outCases.length
          const available = headcount - outCount
          const pct = Math.round((available / headcount) * 100)
          dayDepts.push({
            department: dept,
            total: headcount,
            out: outCount,
            available,
            pct,
            outNames: outCases.map(c => c.employeeName),
          })
        }

        coverage.push({ date: dateStr, dayOfWeek: dayName, departments: dayDepts })
      }

      // Find warnings
      const warnings = coverage.flatMap(day =>
        day.departments
          .filter(d => d.pct < 60)
          .map(d => `${day.dayOfWeek}: ${d.department} at ${d.pct}% (${d.out} out of ${d.total})`)
      )

      return {
        coverage,
        warnings,
        message: warnings.length > 0
          ? `⚠️ ${warnings.length} staffing concern${warnings.length > 1 ? 's' : ''} in the next ${days} business days.`
          : `All departments above 60% coverage for the next ${days} business days.`,
      }
    },
  }),
}
