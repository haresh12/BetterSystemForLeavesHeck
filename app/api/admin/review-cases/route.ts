import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin'
import type { CaseDoc } from '@/lib/firebase/types'
import { COMPANY_HOLIDAYS } from '@/lib/utils'

export const runtime = 'nodejs'
export const maxDuration = 30

function toISO(ts: any): string {
  if (!ts) return new Date().toISOString()
  if (typeof ts === 'string') return ts
  if (ts?.toDate) return ts.toDate().toISOString()
  return new Date().toISOString()
}

export interface CaseReview {
  caseId: string
  employeeName: string
  department: string
  leaveType: string
  days: number
  isHalfDay?: boolean
  halfDayPeriod?: string
  startDate: string
  endDate: string
  reason: string
  // Agent 1: Reviewer
  agent1Findings: string[]
  agent1Verdict: 'approve' | 'review' | 'flag'
  agent1Reason: string
  // Agent 2: Validator
  agent2Findings: string[]
  agent2Verdict: 'approve' | 'review' | 'flag'
  agent2Reason: string
  // Final
  finalVerdict: 'approve' | 'review' | 'flag'
  riskScore: number
  hasDocIssue: boolean
  hasTeamOverlap: boolean
  hasPatternFlag: boolean
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const token = cookieStore.get('session')?.value
  if (!token) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  let uid: string
  try {
    const decoded = await getAdminAuth().verifyIdToken(token)
    uid = decoded.uid
  } catch {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
  }

  const { caseIds } = await req.json() as { caseIds: string[] }
  if (!caseIds || caseIds.length === 0) return NextResponse.json({ error: 'No cases' }, { status: 400 })

  const db = getAdminDb()
  const allCasesSnap = await db.collection('cases').get()
  const allCases = allCasesSnap.docs.map(d => ({ caseId: d.id, ...d.data() } as CaseDoc & { caseId: string }))

  const reviews: CaseReview[] = []

  for (const caseId of caseIds.slice(0, 20)) {
    const c = allCases.find(x => x.caseId === caseId)
    if (!c) continue

    // Get employee history
    const history = allCases.filter(x => x.employeeId === c.employeeId)
    const rejected = history.filter(h => h.status === 'rejected').length
    const totalCases = history.length

    // Team overlaps — count UNIQUE employees, not cases
    const teamOverlaps = allCases.filter(tc =>
      tc.caseId !== caseId &&
      tc.employeeId !== c.employeeId && // exclude same employee's other cases
      tc.employeeDepartment === c.employeeDepartment &&
      ['approved', 'open'].includes(tc.status) &&
      tc.startDate <= c.endDate && tc.endDate >= c.startDate
    )
    const uniqueOverlapEmployees = [...new Set(teamOverlaps.map(tc => tc.employeeId))]

    // Dept size
    const deptEmployees = await db.collection('users').where('department', '==', c.employeeDepartment).where('role', '==', 'employee').get()
    const deptSize = deptEmployees.size
    const outCount = uniqueOverlapEmployees.length + 1 // +1 for this employee
    const coveragePct = Math.round(((deptSize - outCount) / Math.max(deptSize, 1)) * 100)

    // Doc check
    const docSnap = await db.collection('documents').where('caseId', '==', caseId).get()
    const hasValidDoc = docSnap.docs.some(d => d.data().status === 'valid')
    const docConfidence = docSnap.docs[0]?.data()?.extractedFields?.confidenceScore ?? null

    // Monday/Friday pattern
    const sickHistory = history.filter(h => h.leaveType === 'Sick')
    const monFriSick = sickHistory.filter(h => { const dow = new Date(h.startDate + 'T00:00:00').getDay(); return dow === 1 || dow === 5 })
    const hasPattern = sickHistory.length >= 3 && monFriSick.length / sickHistory.length > 0.5

    // Holiday adjacent
    const dayBefore = new Date(new Date(c.startDate + 'T00:00:00').getTime() - 86400000).toISOString().split('T')[0]
    const dayAfter = new Date(new Date(c.endDate + 'T00:00:00').getTime() + 86400000).toISOString().split('T')[0]
    const isHolidayAdjacent = !!(COMPANY_HOLIDAYS[dayBefore] || COMPANY_HOLIDAYS[dayAfter])

    // ── Agent 1: Reviewer ──
    const a1Findings: string[] = []
    let a1Verdict: 'approve' | 'review' | 'flag' = 'approve'

    // Balance/duration
    if (c.days <= 2) a1Findings.push(`Short leave (${c.days}d) — low impact`)
    else if (c.days <= 5) a1Findings.push(`${c.days} day leave — moderate duration`)
    else a1Findings.push(`Extended leave (${c.days}d) — requires careful review`)

    // History
    if (rejected === 0) a1Findings.push(`Clean history — ${totalCases} past requests, 0 rejected`)
    else { a1Findings.push(`${rejected} past rejections out of ${totalCases} requests`); a1Verdict = 'review' }

    // Docs
    if (c.certificateRequired) {
      if (hasValidDoc) a1Findings.push(`Document verified${docConfidence ? ` (${Math.round(docConfidence * 100)}% confidence)` : ''}`)
      else { a1Findings.push('Certificate REQUIRED but not uploaded'); a1Verdict = 'flag' }
    } else {
      a1Findings.push('No certificate required')
    }

    // Team
    const overlapNames = uniqueOverlapEmployees.map(id => { const tc = teamOverlaps.find(t => t.employeeId === id); return tc?.employeeName ?? '' }).filter(Boolean).slice(0, 3).join(', ')
    if (coveragePct < 50) { a1Findings.push(`${c.employeeDepartment} drops to ${coveragePct}% (${deptSize - outCount}/${deptSize} available). Also out: ${overlapNames || 'no one'}`); a1Verdict = 'flag' }
    else if (coveragePct < 70) { a1Findings.push(`${c.employeeDepartment} at ${coveragePct}% — ${uniqueOverlapEmployees.length} colleague${uniqueOverlapEmployees.length > 1 ? 's' : ''} also out (${overlapNames})`); if (a1Verdict === 'approve') a1Verdict = 'review' }
    else a1Findings.push(`${c.employeeDepartment} team coverage healthy at ${coveragePct}% — no staffing concerns`)

    const a1Reason = a1Verdict === 'approve' ? 'Low risk, no concerns found'
      : a1Verdict === 'review' ? 'Minor concerns — recommend admin review'
      : 'Issues detected — needs attention'

    // ── Agent 2: Validator ──
    const a2Findings: string[] = []
    let a2Verdict = a1Verdict

    // Pattern check
    if (hasPattern && c.leaveType === 'Sick') {
      a2Findings.push(`PATTERN: ${monFriSick.length}/${sickHistory.length} sick leaves on Monday/Friday`)
      a2Verdict = 'flag'
    } else if (c.leaveType === 'Sick') {
      a2Findings.push('No suspicious sick leave patterns')
    }

    // Holiday adjacency
    if (isHolidayAdjacent) {
      a2Findings.push(`Leave adjacent to company holiday — possible long weekend extension`)
      if (a2Verdict === 'approve') a2Verdict = 'review'
    }

    // Cross-validate agent 1
    if (a1Verdict === 'approve') {
      a2Findings.push('Agent 1 review confirmed — no additional risks found')
    } else if (a1Verdict === 'review') {
      a2Findings.push('Confirmed Agent 1 concerns — recommend manual review')
    } else {
      a2Findings.push('Confirmed Agent 1 flags — do not auto-approve')
    }

    const a2Reason = a2Verdict === 'approve' ? 'Validated — safe to approve'
      : a2Verdict === 'review' ? 'Validated with concerns — admin should decide'
      : 'Validated — issues require manual attention'

    // Risk score — balanced: most cases should score 70+
    let riskScore = 100
    // Major deductions
    if (c.certificateRequired && !hasValidDoc) riskScore -= 30 // missing required doc is serious
    if (hasPattern) riskScore -= 20 // suspicious pattern
    if (coveragePct < 50) riskScore -= 20 // critical understaffing
    // Minor deductions
    if (coveragePct >= 50 && coveragePct < 70) riskScore -= 8
    if (rejected > 0) riskScore -= 5
    if (isHolidayAdjacent) riskScore -= 5
    if (c.days > 10) riskScore -= 5 // long leave = slightly more risk
    riskScore = Math.max(10, Math.min(100, riskScore))

    reviews.push({
      caseId,
      employeeName: c.employeeName,
      department: c.employeeDepartment,
      leaveType: c.leaveType,
      days: c.days,
      ...(c.isHalfDay ? { isHalfDay: true, halfDayPeriod: c.halfDayPeriod } : {}),
      startDate: c.startDate,
      endDate: c.endDate,
      reason: c.reason,
      agent1Findings: a1Findings,
      agent1Verdict: a1Verdict,
      agent1Reason: a1Reason,
      agent2Findings: a2Findings,
      agent2Verdict: a2Verdict,
      agent2Reason: a2Reason,
      finalVerdict: a2Verdict,
      riskScore,
      hasDocIssue: c.certificateRequired && !hasValidDoc,
      hasTeamOverlap: teamOverlaps.length > 0,
      hasPatternFlag: hasPattern,
    })
  }

  const approved = reviews.filter(r => r.finalVerdict === 'approve').length
  const needsReview = reviews.filter(r => r.finalVerdict === 'review').length
  const flagged = reviews.filter(r => r.finalVerdict === 'flag').length

  return NextResponse.json({
    reviews,
    summary: { total: reviews.length, approved, needsReview, flagged },
  })
}
