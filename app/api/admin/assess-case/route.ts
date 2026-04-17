import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin'
import type { CaseDoc } from '@/lib/firebase/types'
import { COMPANY_HOLIDAYS } from '@/lib/utils'

export const runtime = 'nodejs'
export const maxDuration = 15

function toISO(ts: any): string {
  if (!ts) return new Date().toISOString()
  if (typeof ts === 'string') return ts
  if (ts?.toDate) return ts.toDate().toISOString()
  return new Date().toISOString()
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

  const { caseId } = await req.json()
  const db = getAdminDb()

  const caseSnap = await db.collection('cases').doc(caseId).get()
  if (!caseSnap.exists) return NextResponse.json({ error: 'Case not found' }, { status: 404 })
  const c = { caseId, ...caseSnap.data() } as CaseDoc & { caseId: string }

  // Run all analyses in parallel
  const [historySnap, empSnap, allCasesSnap, docSnap, deptSnap] = await Promise.all([
    db.collection('cases').where('employeeId', '==', c.employeeId).get(),
    db.collection('users').doc(c.employeeId).get(),
    db.collection('cases').get(),
    db.collection('documents').where('caseId', '==', caseId).get(),
    db.collection('users').where('department', '==', c.employeeDepartment).where('role', '==', 'employee').get(),
  ])

  const history = historySnap.docs.map(d => ({ caseId: d.id, ...d.data() } as CaseDoc & { caseId: string }))
  const emp = empSnap.exists ? empSnap.data()! : {}
  const deptSize = deptSnap.size

  // Team overlaps
  const teamOverlaps = allCasesSnap.docs
    .map(d => ({ caseId: d.id, ...d.data() } as CaseDoc & { caseId: string }))
    .filter(tc => tc.caseId !== caseId && tc.employeeDepartment === c.employeeDepartment && ['approved', 'open'].includes(tc.status) && tc.startDate <= c.endDate && tc.endDate >= c.startDate)

  const outCount = teamOverlaps.length + 1
  const coveragePct = Math.round(((deptSize - outCount) / Math.max(deptSize, 1)) * 100)

  // Document check
  const hasValidDoc = docSnap.docs.some(d => d.data().status === 'valid')
  const docData = docSnap.docs[0]?.data() ?? null

  // Risk factors
  const factors: Array<{ factor: string; score: 'low' | 'medium' | 'high'; detail: string; icon: string }> = []

  // 1. Document
  if (c.certificateRequired) {
    if (hasValidDoc) {
      const conf = docData?.extractedFields?.confidenceScore
      factors.push({ factor: 'Document Verification', score: conf >= 0.8 ? 'low' : 'medium', detail: `Certificate verified${conf ? ` (${Math.round(conf * 100)}% confidence)` : ''}`, icon: 'doc' })
    } else {
      factors.push({ factor: 'Document Verification', score: 'high', detail: 'Certificate REQUIRED but not uploaded', icon: 'doc' })
    }
  } else {
    factors.push({ factor: 'Document Verification', score: 'low', detail: 'No certificate required for this leave type', icon: 'doc' })
  }

  // 2. Team coverage
  if (coveragePct < 50) factors.push({ factor: 'Team Coverage Impact', score: 'high', detail: `${c.employeeDepartment} drops to ${coveragePct}% (${outCount} of ${deptSize} out)`, icon: 'team' })
  else if (coveragePct < 70) factors.push({ factor: 'Team Coverage Impact', score: 'medium', detail: `${c.employeeDepartment} at ${coveragePct}% coverage`, icon: 'team' })
  else factors.push({ factor: 'Team Coverage Impact', score: 'low', detail: `${c.employeeDepartment} at ${coveragePct}% — adequate staffing`, icon: 'team' })

  // 3. Employee track record
  const totalCases = history.length
  const rejected = history.filter(h => h.status === 'rejected').length
  const approved = history.filter(h => h.status === 'approved').length
  if (rejected >= 3) factors.push({ factor: 'Employee History', score: 'high', detail: `${rejected} rejected out of ${totalCases} total requests`, icon: 'history' })
  else if (rejected >= 1) factors.push({ factor: 'Employee History', score: 'medium', detail: `${approved} approved, ${rejected} rejected of ${totalCases} total`, icon: 'history' })
  else factors.push({ factor: 'Employee History', score: 'low', detail: `Clean record — ${totalCases} requests, ${approved} approved, 0 rejected`, icon: 'history' })

  // 4. Monday/Friday sick pattern
  const sickHistory = history.filter(h => h.leaveType === 'Sick')
  const monFriSick = sickHistory.filter(h => { const dow = new Date(h.startDate + 'T00:00:00').getDay(); return dow === 1 || dow === 5 })
  if (c.leaveType === 'Sick' && sickHistory.length >= 3 && monFriSick.length / sickHistory.length > 0.5) {
    factors.push({ factor: 'Pattern Alert', score: 'high', detail: `${monFriSick.length}/${sickHistory.length} sick leaves on Monday/Friday — suspicious pattern`, icon: 'pattern' })
  } else if (c.leaveType === 'Sick') {
    factors.push({ factor: 'Pattern Check', score: 'low', detail: 'No suspicious sick leave patterns detected', icon: 'pattern' })
  }

  // 5. Tenure
  const tenure = emp.tenureYears ?? 0
  factors.push({ factor: 'Employee Tenure', score: tenure < 1 ? 'medium' : 'low', detail: tenure < 1 ? `New employee — ${(tenure * 12).toFixed(0)} months` : `${tenure} years with the company`, icon: 'tenure' })

  // 6. FMLA compliance
  if (c.leaveType === 'FMLA' || c.leaveType === 'Intermittent') {
    if (tenure < 1) factors.push({ factor: 'FMLA Eligibility', score: 'high', detail: 'Employee may not meet 12-month FMLA requirement', icon: 'compliance' })
    else factors.push({ factor: 'FMLA Eligibility', score: 'low', detail: 'Meets 12-month tenure requirement for FMLA', icon: 'compliance' })
  }

  // 7. Holiday adjacency
  const startDow = new Date(c.startDate + 'T00:00:00')
  const dayBefore = new Date(startDow.getTime() - 86400000).toISOString().split('T')[0]
  const endDate = new Date(c.endDate + 'T00:00:00')
  const dayAfter = new Date(endDate.getTime() + 86400000).toISOString().split('T')[0]
  if (COMPANY_HOLIDAYS[dayBefore] || COMPANY_HOLIDAYS[dayAfter]) {
    factors.push({ factor: 'Holiday Adjacent', score: 'medium', detail: `Leave is adjacent to ${COMPANY_HOLIDAYS[dayBefore] ?? COMPANY_HOLIDAYS[dayAfter]}`, icon: 'holiday' })
  }

  // Overall score
  const highCount = factors.filter(f => f.score === 'high').length
  const medCount = factors.filter(f => f.score === 'medium').length
  const overallRisk = highCount >= 2 ? 'high' : highCount >= 1 ? 'medium' : medCount >= 2 ? 'medium' : 'low'

  const recommendation = overallRisk === 'high'
    ? { action: 'HOLD', text: 'Review risk factors before approving', color: '#ef4444' }
    : overallRisk === 'medium'
    ? { action: 'APPROVE WITH CAUTION', text: 'Minor concerns noted — approve if acceptable', color: '#f59e0b' }
    : { action: 'APPROVE', text: 'Low risk — safe to approve', color: '#16a34a' }

  // Score as percentage (0-100)
  const riskScore = Math.max(0, Math.min(100, 100 - (highCount * 25 + medCount * 10)))

  return NextResponse.json({
    caseId,
    employeeName: c.employeeName,
    leaveType: c.leaveType,
    days: c.days,
    overallRisk,
    riskScore,
    recommendation,
    factors,
    teamOverlaps: teamOverlaps.slice(0, 5).map(t => ({ name: t.employeeName, type: t.leaveType, dates: `${t.startDate} - ${t.endDate}` })),
    coveragePct,
    deptSize,
    tenure,
    document: docData ? { fileName: docData.fileName, fileUrl: docData.fileUrl, confidence: docData.extractedFields?.confidenceScore, doctorName: docData.extractedFields?.doctorName, hospital: docData.extractedFields?.hospital } : null,
    employeeHistory: { total: totalCases, approved, rejected, cancelled: history.filter(h => h.status === 'cancelled').length },
  })
}
