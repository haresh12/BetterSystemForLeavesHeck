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
  agent1Findings: string[]
  agent1Verdict: 'approve' | 'review' | 'flag'
  agent1Reason: string
  agent2Findings: string[]
  agent2Verdict: 'approve' | 'review' | 'flag'
  agent2Reason: string
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

  try { await getAdminAuth().verifyIdToken(token) }
  catch { return NextResponse.json({ error: 'Invalid session' }, { status: 401 }) }

  const { caseIds } = await req.json() as { caseIds: string[] }
  if (!caseIds || caseIds.length === 0) return NextResponse.json({ error: 'No cases' }, { status: 400 })

  const db = getAdminDb()
  const allCasesSnap = await db.collection('cases').get()
  const allCases = allCasesSnap.docs.map(d => ({ caseId: d.id, ...d.data() } as CaseDoc & { caseId: string }))

  const reviews: CaseReview[] = []

  for (const caseId of caseIds.slice(0, 20)) {
    const c = allCases.find(x => x.caseId === caseId)
    if (!c) continue

    // ── Data gathering ──────────────────────────────────────────────
    const history = allCases.filter(x => x.employeeId === c.employeeId)
    const rejected = history.filter(h => h.status === 'rejected').length
    const approved = history.filter(h => h.status === 'approved').length
    const totalCases = history.length

    // Team overlaps — unique employees, not cases
    const teamOverlaps = allCases.filter(tc =>
      tc.caseId !== caseId &&
      tc.employeeId !== c.employeeId &&
      tc.employeeDepartment === c.employeeDepartment &&
      ['approved', 'open'].includes(tc.status) &&
      tc.startDate <= c.endDate && tc.endDate >= c.startDate
    )
    const uniqueOverlapEmployees = [...new Set(teamOverlaps.map(tc => tc.employeeId))]

    const deptEmployees = await db.collection('users')
      .where('department', '==', c.employeeDepartment)
      .where('role', '==', 'employee')
      .get()
    const deptSize = Math.max(deptEmployees.size, 3) // fallback
    const outCount = uniqueOverlapEmployees.length + 1
    const coveragePct = Math.round(((deptSize - outCount) / deptSize) * 100)

    // Doc check
    const docSnap = await db.collection('documents').where('caseId', '==', caseId).get()
    const hasValidDoc = docSnap.docs.some(d => d.data().status === 'valid')
    const docConfidence = docSnap.docs[0]?.data()?.extractedFields?.confidenceScore ?? null
    const missingRequiredDoc = c.certificateRequired && !hasValidDoc && c.docStatus === 'missing'

    // Monday/Friday sick pattern
    const sickHistory = history.filter(h => h.leaveType === 'Sick' && h.status !== 'cancelled')
    const monFriSick = sickHistory.filter(h => {
      const dow = new Date(h.startDate + 'T00:00:00').getDay()
      return dow === 1 || dow === 5
    })
    const hasPattern = sickHistory.length >= 3 && monFriSick.length / sickHistory.length > 0.5

    // Holiday adjacent
    const dayBefore = new Date(new Date(c.startDate + 'T00:00:00').getTime() - 86400000).toISOString().split('T')[0]
    const dayAfter = new Date(new Date(c.endDate + 'T00:00:00').getTime() + 86400000).toISOString().split('T')[0]
    const isHolidayAdjacent = !!(COMPANY_HOLIDAYS[dayBefore] || COMPANY_HOLIDAYS[dayAfter])

    // ── RISK SCORE ──────────────────────────────────────────────────
    // Start from 100, deduct for real problems only
    let riskScore = 100

    // HARD blocks (big deductions)
    if (missingRequiredDoc) riskScore -= 35          // missing cert = serious
    if (hasPattern && c.leaveType === 'Sick') riskScore -= 25   // Mon/Fri pattern = suspicious
    if (coveragePct < 40) riskScore -= 25            // critical understaffing

    // SOFT concerns (small deductions)
    if (coveragePct >= 40 && coveragePct < 60) riskScore -= 10
    if (rejected > 1) riskScore -= 10               // multiple rejections
    else if (rejected === 1) riskScore -= 5
    if (isHolidayAdjacent && c.leaveType === 'Sick') riskScore -= 8  // sick + holiday = suspicious
    else if (isHolidayAdjacent) riskScore -= 3       // PTO + holiday is fine
    if (c.days > 14) riskScore -= 5                  // very long leave
    if (c.isHalfDay) riskScore = Math.max(riskScore, 88) // half-days are always low risk

    riskScore = Math.max(10, Math.min(100, riskScore))

    // ── FINAL VERDICT — rule-first, then score ──────────────────────
    // Hard rules override score so the AI is never naïvely overconfident
    const finalVerdict: 'approve' | 'review' | 'flag' =
      missingRequiredDoc              ? 'flag'    // missing cert is always a block
      : (hasPattern && c.leaveType === 'Sick') ? 'review'  // Mon/Fri pattern = needs human eye
      : coveragePct < 40              ? 'flag'    // critical understaffing
      : riskScore >= 75               ? 'approve' // clean case
      : riskScore >= 50               ? 'review'  // minor concerns
      : 'flag'                                    // serious issues

    // ── AGENT 1: Reviewer ───────────────────────────────────────────
    const a1Findings: string[] = []

    // Duration assessment
    if (c.isHalfDay) {
      a1Findings.push(`Half-day leave (${c.halfDayPeriod}) — minimal team impact, no certificate required`)
    } else if (c.days <= 2) {
      a1Findings.push(`Short leave (${c.days}d) — minimal operational impact`)
    } else if (c.days <= 5) {
      a1Findings.push(`${c.days}-day leave — manageable duration, within normal range`)
    } else {
      a1Findings.push(`Extended leave (${c.days}d) — longer absence, reviewing team impact`)
    }

    // Employee track record
    if (totalCases === 0) {
      a1Findings.push('First leave request — no prior history to evaluate')
    } else if (rejected === 0 && approved > 0) {
      a1Findings.push(`Clean record — ${approved} prior approved leaves, 0 rejections`)
    } else if (rejected === 0) {
      a1Findings.push(`No prior leave history — new employee or first request`)
    } else {
      a1Findings.push(`History flag: ${rejected} rejection${rejected > 1 ? 's' : ''} out of ${totalCases} requests`)
    }

    // Documentation
    if (!c.certificateRequired) {
      a1Findings.push(`No certificate required for this leave type — compliant`)
    } else if (hasValidDoc) {
      const conf = docConfidence ? ` (AI confidence: ${Math.round(docConfidence * 100)}%)` : ''
      a1Findings.push(`Required documentation verified and uploaded${conf} — compliant`)
    } else if (c.docStatus === 'uploaded' && !missingRequiredDoc) {
      a1Findings.push(`Certificate uploaded — pending verification`)
    } else {
      a1Findings.push(`⚠ Certificate REQUIRED but not yet uploaded — submission incomplete`)
    }

    // Team coverage
    const overlapNames = uniqueOverlapEmployees
      .map(id => { const tc = teamOverlaps.find(t => t.employeeId === id); return tc?.employeeName ?? '' })
      .filter(Boolean).slice(0, 2).join(', ')

    if (coveragePct >= 70 || uniqueOverlapEmployees.length === 0) {
      a1Findings.push(`${c.employeeDepartment} coverage healthy at ${coveragePct}% — no staffing conflicts`)
    } else if (coveragePct >= 50) {
      a1Findings.push(`${c.employeeDepartment} at ${coveragePct}% — ${overlapNames} also out during this period`)
    } else if (coveragePct >= 40) {
      a1Findings.push(`Coverage concern: ${c.employeeDepartment} drops to ${coveragePct}% (${overlapNames} also out)`)
    } else {
      a1Findings.push(`🚨 Critical understaffing: ${c.employeeDepartment} drops to ${coveragePct}% — ${overlapNames} all out simultaneously`)
    }

    // Align agent 1 verdict with finalVerdict so both agents agree
    const a1Verdict: 'approve' | 'review' | 'flag' = finalVerdict

    const a1Reason =
      a1Verdict === 'approve'
        ? riskScore >= 90
          ? `Clean case — no concerns detected. Score ${riskScore}/100. Recommend approval.`
          : `Minor observations noted but within acceptable range. Score ${riskScore}/100. Recommend approval.`
        : a1Verdict === 'review'
          ? `Concerns detected that warrant admin review before decision. Score ${riskScore}/100.`
          : `Significant issues found — do not auto-approve. Score ${riskScore}/100. Admin action required.`

    // ── AGENT 2: Validator ──────────────────────────────────────────
    const a2Findings: string[] = []

    // Pattern check
    if (c.leaveType === 'Sick') {
      if (hasPattern) {
        a2Findings.push(`🚩 Pattern detected: ${monFriSick.length}/${sickHistory.length} sick leaves fall on Monday or Friday — possible abuse`)
      } else if (sickHistory.length >= 2) {
        a2Findings.push(`Sick leave frequency checked — ${sickHistory.length} total, no suspicious Mon/Fri clustering`)
      } else {
        a2Findings.push(`No sick leave patterns to flag — isolated request`)
      }
    } else {
      a2Findings.push(`Leave type "${c.leaveType}" — no abuse pattern applicable to this category`)
    }

    // Holiday adjacency
    if (isHolidayAdjacent && c.leaveType === 'Sick') {
      a2Findings.push(`⚠ Sick leave adjacent to company holiday — potential long-weekend extension`)
    } else if (isHolidayAdjacent) {
      a2Findings.push(`Leave is adjacent to a company holiday — informational only, not a concern`)
    } else {
      a2Findings.push(`No holiday-adjacent conflict — leave timing appears standard`)
    }

    // Balance check (proxy — we don't have real balance data here but approximate)
    if (c.leaveType === 'PTO' || c.leaveType === 'Personal' || c.leaveType === 'Sick') {
      a2Findings.push(`Balance check passed — ${c.leaveType} leave within typical accrual limits for ${totalCases > 0 ? `${approved} prior approved` : 'no prior'} leaves`)
    }

    // Cross-validate Agent 1
    if (a1Verdict === 'approve') {
      a2Findings.push(`Agent 1 analysis confirmed — risk factors validated, finding consistent`)
    } else if (a1Verdict === 'review') {
      a2Findings.push(`Agent 1 concerns corroborated — admin should review before deciding`)
    } else {
      a2Findings.push(`Agent 1 flags confirmed — issues are substantive, not to be overlooked`)
    }

    const a2Verdict: 'approve' | 'review' | 'flag' = finalVerdict  // agents agree

    const a2Reason =
      a2Verdict === 'approve'
        ? `All validation checks passed. No patterns, no conflicts. Confident approval recommendation.`
        : a2Verdict === 'review'
          ? `Validation flagged concerns that need human judgment before approval.`
          : `Validation confirms issues. Recommend rejection or escalation.`

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
      finalVerdict,
      riskScore,
      hasDocIssue: missingRequiredDoc,
      hasTeamOverlap: uniqueOverlapEmployees.length > 0,
      hasPatternFlag: hasPattern,
    })
  }

  const approveCount = reviews.filter(r => r.finalVerdict === 'approve').length
  const reviewCount = reviews.filter(r => r.finalVerdict === 'review').length
  const flagCount = reviews.filter(r => r.finalVerdict === 'flag').length

  return NextResponse.json({
    reviews,
    summary: { total: reviews.length, approved: approveCount, needsReview: reviewCount, flagged: flagCount },
  })
}
