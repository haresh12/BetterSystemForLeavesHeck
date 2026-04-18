import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'
import * as fs from 'fs'
import * as path from 'path'

export const runtime = 'nodejs'
export const maxDuration = 120

// Load doc URLs
const urlsPath = path.join(process.cwd(), 'scripts', 'mock-docs', 'urls.json')
let docUrls: Record<string, string> = {}
try { docUrls = JSON.parse(fs.readFileSync(urlsPath, 'utf-8')) } catch {}
const medCertUrls = Object.entries(docUrls).filter(([k]) => k.startsWith('medical_cert')).map(([, v]) => v)
const fmlaUrls = Object.entries(docUrls).filter(([k]) => k.startsWith('wh380')).map(([, v]) => v)

function rnd(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min }

// Date helpers — all relative to today (2026-04-18)
function isoDate(daysFromToday: number): string {
  const d = new Date()
  d.setDate(d.getDate() + daysFromToday)
  return d.toISOString().split('T')[0]
}
function pastTimestamp(daysAgo: number, hoursAgo = 0): Date {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  d.setHours(d.getHours() - hoursAgo)
  return d
}
// Next weekday from a given offset
function nextWeekday(startOffset: number, count: number): { start: string; end: string } {
  const start = new Date()
  start.setDate(start.getDate() + startOffset)
  // skip weekends for start
  while (start.getDay() === 0 || start.getDay() === 6) start.setDate(start.getDate() + 1)
  const end = new Date(start)
  let added = 0
  while (added < count - 1) {
    end.setDate(end.getDate() + 1)
    if (end.getDay() !== 0 && end.getDay() !== 6) added++
  }
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  }
}

const EMPLOYEES = [
  { name: 'James Okafor',     department: 'Engineering', jobTitle: 'Senior Engineer',    tenureYears: 4 },
  { name: 'Sarah Chen',       department: 'Engineering', jobTitle: 'Staff Engineer',      tenureYears: 6 },
  { name: 'Marcus Reid',      department: 'Engineering', jobTitle: 'Junior Developer',    tenureYears: 1 },
  { name: 'Emily Watson',     department: 'Engineering', jobTitle: 'DevOps Engineer',     tenureYears: 3 },
  { name: 'Alex Johnson',     department: 'Engineering', jobTitle: 'QA Lead',             tenureYears: 5 },
  { name: 'Priya Singh',      department: 'Product',     jobTitle: 'Product Manager',     tenureYears: 3 },
  { name: 'Olivia Foster',    department: 'Product',     jobTitle: 'UX Designer',         tenureYears: 2 },
  { name: 'Ryan Thompson',    department: 'Product',     jobTitle: 'Data Analyst',        tenureYears: 4 },
  { name: 'Carlos Hernandez', department: 'Sales',       jobTitle: 'Account Executive',   tenureYears: 2 },
  { name: 'Aisha Patel',      department: 'Sales',       jobTitle: 'Sales Manager',       tenureYears: 5 },
  { name: 'John Park',        department: 'Sales',       jobTitle: 'Sales Rep',           tenureYears: 1 },
  { name: 'David Kim',        department: 'Sales',       jobTitle: 'BDR',                 tenureYears: 2 },
  { name: 'Sophia Martinez',  department: 'Design',      jobTitle: 'Visual Designer',     tenureYears: 3 },
  { name: 'Hannah Lee',       department: 'Design',      jobTitle: 'Brand Designer',      tenureYears: 2 },
  { name: 'Liam Chen',        department: 'Design',      jobTitle: 'Design Lead',         tenureYears: 7 },
]

// Monday 5 weeks ago, Monday 4 weeks ago, Monday 3 weeks ago, Friday 2 weeks ago
function mondaySickDates(): Array<{ start: string; end: string; daysAgo: number }> {
  const dates = []
  for (const weeksAgo of [5, 4, 3]) {
    const d = new Date()
    // go back weeksAgo * 7 days, then find Monday
    d.setDate(d.getDate() - weeksAgo * 7)
    while (d.getDay() !== 1) d.setDate(d.getDate() + 1)
    const s = d.toISOString().split('T')[0]
    dates.push({ start: s, end: s, daysAgo: weeksAgo * 7 })
  }
  // Add Friday sick leave
  const f = new Date()
  f.setDate(f.getDate() - 14)
  while (f.getDay() !== 5) f.setDate(f.getDate() - 1)
  const fs_ = f.toISOString().split('T')[0]
  dates.push({ start: fs_, end: fs_, daysAgo: 14 })
  return dates
}

export async function POST() {
  const cookieStore = await cookies()
  const token = cookieStore.get('session')?.value
  if (!token) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  let adminUid: string
  try {
    const decoded = await getAdminAuth().verifyIdToken(token)
    adminUid = decoded.uid
  } catch {
    return NextResponse.json({ error: 'Invalid' }, { status: 401 })
  }

  const db = getAdminDb()

  // ── 1. Delete old mock data ──
  const collections = ['cases', 'users', 'documents', 'audit_logs', 'notifications']
  for (const col of collections) {
    const snap = await db.collection(col).where('isMockData', '==', true).get()
    if (!snap.empty) {
      const batch = db.batch()
      snap.docs.forEach(d => batch.delete(d.ref))
      await batch.commit()
    }
  }

  // ── 2. Clear admin managedEmployeeIds so ALL cases are visible ──
  await db.collection('users').doc(adminUid).update({ managedEmployeeIds: [] })

  // ── 3. Create mock employees ──
  const empIds: string[] = []
  const empBatch = db.batch()
  for (const emp of EMPLOYEES) {
    const ref = db.collection('users').doc()
    empBatch.set(ref, {
      ...emp,
      email: `${emp.name.toLowerCase().replace(/\s+/g, '.')}@convowork.com`,
      role: 'employee',
      balances: {
        PTO: rnd(8, 18), Sick: rnd(5, 10), Personal: rnd(3, 6),
        Bereavement: 10, FMLA: 60, Maternity: 84, Paternity: 10,
        Unpaid: 30, CompOff: rnd(2, 6), EmergencyLeave: 5,
      },
      createdAt: FieldValue.serverTimestamp(),
      isMockData: true,
    })
    empIds.push(ref.id)
  }
  await empBatch.commit()

  // Employee index helpers
  const E = (name: string) => EMPLOYEES.findIndex(e => e.name === name)
  const eId = (name: string) => empIds[E(name)]
  const emp = (name: string) => EMPLOYEES[E(name)]

  const cases: Array<{
    employeeId: string; employeeName: string; employeeDepartment: string
    leaveType: string; startDate: string; endDate: string; days: number
    reason: string; status: string; priority: string
    docStatus: string; certificateRequired: boolean
    isHalfDay?: boolean; halfDayPeriod?: string
    rejectionReason: string | null; fmlaExpiry: string | null
    notes: Array<{ text: string; actorId: string; actorName: string; actorRole: string; timestamp: string }>
    createdAt: Date; updatedAt: Date; isMockData: boolean
    docUrl?: string
  }> = []

  function mkCase(
    empName: string,
    leaveType: string,
    start: string,
    end: string,
    days: number,
    reason: string,
    status: string,
    opts: {
      priority?: string; halfDay?: boolean; halfDayPeriod?: 'morning' | 'afternoon'
      certRequired?: boolean; docStatus?: string; docUrl?: string
      rejectionReason?: string; fmlaExpiry?: string
      createdDaysAgo?: number; updatedDaysAgo?: number
    } = {}
  ) {
    const empObj = emp(empName)
    const certRequired = opts.certRequired ?? (['FMLA', 'Maternity', 'Paternity'].includes(leaveType) || (leaveType === 'Sick' && days >= 3) || (leaveType === 'Bereavement' && days >= 5))
    const docSt = opts.docStatus ?? (certRequired ? 'uploaded' : 'not_required')
    cases.push({
      employeeId: eId(empName),
      employeeName: empObj.name,
      employeeDepartment: empObj.department,
      leaveType,
      startDate: start,
      endDate: end,
      days: opts.halfDay ? 0.5 : days,
      reason,
      status,
      priority: opts.priority ?? (['FMLA', 'Maternity', 'Paternity'].includes(leaveType) ? 'high' : days >= 5 ? 'medium' : 'low'),
      docStatus: docSt,
      certificateRequired: certRequired,
      ...(opts.halfDay ? { isHalfDay: true, halfDayPeriod: opts.halfDayPeriod ?? 'morning' } : {}),
      rejectionReason: opts.rejectionReason ?? null,
      fmlaExpiry: opts.fmlaExpiry ?? (leaveType === 'FMLA' ? isoDate(365) : null),
      notes: [{ text: 'Leave request submitted', actorId: eId(empName), actorName: empObj.name, actorRole: 'employee', timestamp: new Date().toISOString() }],
      createdAt: pastTimestamp(opts.createdDaysAgo ?? rnd(1, 5)),
      updatedAt: pastTimestamp(opts.updatedDaysAgo ?? rnd(0, 3)),
      isMockData: true,
      ...(opts.docUrl ? { docUrl: opts.docUrl } : {}),
    })
  }

  // ─────────────────────────────────────────────────────────────────
  // PTO CASES (15) — All open, high score
  // ─────────────────────────────────────────────────────────────────
  const { start: pto1s, end: pto1e } = nextWeekday(3, 3)
  mkCase('Sarah Chen',       'PTO', pto1s, pto1e, 3, 'Family vacation in Hawaii', 'open', { createdDaysAgo: 5 })

  const { start: pto2s, end: pto2e } = nextWeekday(7, 2)
  mkCase('Emily Watson',     'PTO', pto2s, pto2e, 2, 'Weekend trip extension to Napa', 'open', { createdDaysAgo: 4 })

  const { start: pto3s, end: pto3e } = nextWeekday(12, 4)
  mkCase('Ryan Thompson',    'PTO', pto3s, pto3e, 4, 'Annual family trip to Europe', 'open', { createdDaysAgo: 6 })

  const { start: pto4s, end: pto4e } = nextWeekday(5, 1)
  mkCase('Carlos Hernandez', 'PTO', pto4s, pto4e, 1, 'Sister\'s wedding ceremony', 'open', { createdDaysAgo: 3 })

  const { start: pto5s, end: pto5e } = nextWeekday(2, 2)
  mkCase('Aisha Patel',      'PTO', pto5s, pto5e, 2, 'Planned vacation to Cancun', 'open', { createdDaysAgo: 4 })

  const { start: pto6s, end: pto6e } = nextWeekday(9, 3)
  mkCase('John Park',        'PTO', pto6s, pto6e, 3, 'Visiting family in Chicago', 'open', { createdDaysAgo: 5 })

  const { start: pto7s, end: pto7e } = nextWeekday(6, 1)
  mkCase('Priya Singh',      'PTO', pto7s, pto7e, 1, 'Long weekend getaway to Sedona', 'open', { createdDaysAgo: 2 })

  const { start: pto8s, end: pto8e } = nextWeekday(14, 5)
  mkCase('Liam Chen',        'PTO', pto8s, pto8e, 5, 'Annual European vacation — booked 6 months ago', 'open', { priority: 'medium', createdDaysAgo: 8 })

  const { start: pto9s, end: pto9e } = nextWeekday(4, 2)
  mkCase('Hannah Lee',       'PTO', pto9s, pto9e, 2, 'Best friend\'s bachelorette trip to Nashville', 'open', { createdDaysAgo: 3 })

  const { start: pto10s, end: pto10e } = nextWeekday(10, 3)
  mkCase('Sophia Martinez',  'PTO', pto10s, pto10e, 3, 'Anniversary trip to Napa Valley', 'open', { createdDaysAgo: 5 })

  const { start: pto11s, end: pto11e } = nextWeekday(8, 2)
  mkCase('David Kim',        'PTO', pto11s, pto11e, 2, 'Family reunion in Seattle', 'open', { createdDaysAgo: 4 })

  const { start: pto12s, end: pto12e } = nextWeekday(15, 1)
  mkCase('Alex Johnson',     'PTO', pto12s, pto12e, 1, 'Attending college friend\'s graduation', 'open', { createdDaysAgo: 3 })

  const { start: pto13s, end: pto13e } = nextWeekday(20, 4)
  mkCase('Olivia Foster',    'PTO', pto13s, pto13e, 4, 'International vacation to Japan', 'open', { priority: 'medium', createdDaysAgo: 10 })

  const { start: pto14s, end: pto14e } = nextWeekday(11, 2)
  mkCase('Marcus Reid',      'PTO', pto14s, pto14e, 2, 'Road trip to Yellowstone', 'open', { createdDaysAgo: 4 })

  // One tomorrow (urgent)
  const tmrw = isoDate(1)
  mkCase('James Okafor',     'PTO', tmrw, tmrw, 1, 'Mental health day — planned in advance', 'open', { priority: 'high', createdDaysAgo: 7 })

  // ─────────────────────────────────────────────────────────────────
  // PERSONAL CASES (12) — All open, high score
  // ─────────────────────────────────────────────────────────────────
  const { start: p1s, end: p1e } = nextWeekday(4, 1)
  mkCase('Carlos Hernandez', 'Personal', p1s, p1e, 1, 'DMV appointment and license renewal', 'open', { createdDaysAgo: 2 })

  const { start: p2s, end: p2e } = nextWeekday(6, 1)
  mkCase('Emily Watson',     'Personal', p2s, p2e, 1, 'Moving to new apartment — lease start day', 'open', { createdDaysAgo: 3 })

  const { start: p3s, end: p3e } = nextWeekday(8, 1)
  mkCase('Sophia Martinez',  'Personal', p3s, p3e, 1, 'Parent-teacher conference and school enrollment', 'open', { createdDaysAgo: 2 })

  const { start: p4s, end: p4e } = nextWeekday(5, 2)
  mkCase('Ryan Thompson',    'Personal', p4s, p4e, 2, 'Helping parents move to assisted living facility', 'open', { createdDaysAgo: 5 })

  const { start: p5s, end: p5e } = nextWeekday(3, 1)
  mkCase('Hannah Lee',       'Personal', p5s, p5e, 1, 'Birthday celebration — personal day', 'open', { createdDaysAgo: 1 })

  const { start: p6s, end: p6e } = nextWeekday(10, 1)
  mkCase('David Kim',        'Personal', p6s, p6e, 1, 'Passport renewal appointment at consulate', 'open', { createdDaysAgo: 4 })

  const { start: p7s, end: p7e } = nextWeekday(7, 1)
  mkCase('Aisha Patel',      'Personal', p7s, p7e, 1, 'Religious observance — cultural holiday', 'open', { createdDaysAgo: 3 })

  const { start: p8s, end: p8e } = nextWeekday(12, 1)
  mkCase('John Park',        'Personal', p8s, p8e, 1, 'Citizenship interview at USCIS office', 'open', { createdDaysAgo: 5 })

  const { start: p9s, end: p9e } = nextWeekday(9, 2)
  mkCase('Priya Singh',      'Personal', p9s, p9e, 2, 'Attending cousin\'s wedding out of state', 'open', { createdDaysAgo: 6 })

  const { start: p10s, end: p10e } = nextWeekday(15, 1)
  mkCase('Marcus Reid',      'Personal', p10s, p10e, 1, 'Home inspection and mortgage closing day', 'open', { createdDaysAgo: 3 })

  const { start: p11s, end: p11e } = nextWeekday(6, 1)
  mkCase('Liam Chen',        'Personal', p11s, p11e, 1, 'Volunteering at local community center', 'open', { createdDaysAgo: 2 })

  const { start: p12s, end: p12e } = nextWeekday(18, 1)
  mkCase('Olivia Foster',    'Personal', p12s, p12e, 1, 'Taking spouse to specialist appointment', 'open', { createdDaysAgo: 4 })

  // ─────────────────────────────────────────────────────────────────
  // SICK CASES (10) — 7 clean, 3 are James's Monday pattern
  // ─────────────────────────────────────────────────────────────────
  const { start: s1s, end: s1e } = nextWeekday(2, 1)
  mkCase('Emily Watson',  'Sick', s1s, s1e, 1, 'Severe migraine — prescribed rest', 'open', { createdDaysAgo: 1 })

  const { start: s2s, end: s2e } = nextWeekday(4, 1)
  mkCase('Alex Johnson',  'Sick', s2s, s2e, 1, 'Flu symptoms — doctor advised 1 day rest', 'open', { createdDaysAgo: 2 })

  const { start: s3s, end: s3e } = nextWeekday(3, 3)
  mkCase('Priya Singh',   'Sick', s3s, s3e, 3, 'Bronchitis — prescribed antibiotics and rest', 'open', {
    certRequired: true, docStatus: 'uploaded', createdDaysAgo: 3,
    ...(medCertUrls.length > 0 ? { docUrl: medCertUrls[0] } : {}),
  })

  const { start: s4s, end: s4e } = nextWeekday(7, 1)
  mkCase('Sophia Martinez', 'Sick', s4s, s4e, 1, 'Child is sick — staying home to care for them', 'open', { createdDaysAgo: 2 })

  const { start: s5s, end: s5e } = nextWeekday(5, 1)
  mkCase('Hannah Lee',    'Sick', s5s, s5e, 1, 'Food poisoning — doctor visit completed', 'open', { createdDaysAgo: 1 })

  const { start: s6s, end: s6e } = nextWeekday(8, 2)
  mkCase('Carlos Hernandez', 'Sick', s6s, s6e, 2, 'Back injury from weekend activity', 'open', { createdDaysAgo: 3 })

  const { start: s7s, end: s7e } = nextWeekday(6, 1)
  mkCase('David Kim',     'Sick', s7s, s7e, 1, 'High fever — medical certificate attached', 'open', { createdDaysAgo: 2 })

  // James Okafor: pattern — 3 past Monday sick days + 1 future Monday (for demo pattern detection)
  const sickDates = mondaySickDates()
  for (const sd of sickDates) {
    mkCase('James Okafor', 'Sick', sd.start, sd.end, 1, 'Not feeling well — taking sick day', 'approved', {
      createdDaysAgo: sd.daysAgo + 1, updatedDaysAgo: sd.daysAgo,
    })
  }
  // Current pending Monday sick (next Monday)
  const nextMon = new Date()
  nextMon.setDate(nextMon.getDate() + ((8 - nextMon.getDay()) % 7 || 7))
  const nextMonStr = nextMon.toISOString().split('T')[0]
  mkCase('James Okafor', 'Sick', nextMonStr, nextMonStr, 1, 'Feeling unwell — taking sick day', 'open', { createdDaysAgo: 1 })

  // ─────────────────────────────────────────────────────────────────
  // FMLA CASES (5) — 3 with docs, 2 pending docs
  // ─────────────────────────────────────────────────────────────────
  const { start: f1s, end: f1e } = nextWeekday(7, 10)
  mkCase('Sarah Chen', 'FMLA', f1s, f1e, 10, 'Chronic migraine disorder — ongoing neurological treatment', 'open', {
    priority: 'high', certRequired: true, docStatus: 'uploaded',
    ...(fmlaUrls.length > 0 ? { docUrl: fmlaUrls[0] } : {}),
    createdDaysAgo: 10,
  })

  const { start: f2s, end: f2e } = nextWeekday(14, 8)
  mkCase('Alex Johnson', 'FMLA', f2s, f2e, 8, 'Post-surgical rehabilitation following knee replacement', 'open', {
    priority: 'high', certRequired: true, docStatus: 'uploaded',
    ...(fmlaUrls.length > 1 ? { docUrl: fmlaUrls[1] } : {}),
    createdDaysAgo: 14,
  })

  const { start: f3s, end: f3e } = nextWeekday(5, 12)
  mkCase('Ryan Thompson', 'FMLA', f3s, f3e, 12, 'Mental health treatment — therapist-approved FMLA leave', 'open', {
    priority: 'high', certRequired: true, docStatus: 'uploaded',
    createdDaysAgo: 8,
  })

  // FMLA missing docs — pending_docs
  const { start: f4s, end: f4e } = nextWeekday(3, 15)
  mkCase('Marcus Reid', 'FMLA', f4s, f4e, 15, 'Chronic condition — awaiting specialist documentation', 'pending_docs', {
    priority: 'high', certRequired: true, docStatus: 'missing',
    createdDaysAgo: 6,
  })

  const { start: f5s, end: f5e } = nextWeekday(2, 10)
  mkCase('Olivia Foster', 'FMLA', f5s, f5e, 10, 'Serious medical condition requiring extended leave', 'pending_docs', {
    priority: 'high', certRequired: true, docStatus: 'missing',
    createdDaysAgo: 4,
  })

  // ─────────────────────────────────────────────────────────────────
  // BEREAVEMENT CASES (4)
  // ─────────────────────────────────────────────────────────────────
  const bv1s = isoDate(-3); const bv1e = isoDate(-1)
  mkCase('Sophia Martinez', 'Bereavement', bv1s, bv1e, 3, 'Father passed away — funeral arrangements', 'approved', { createdDaysAgo: 5, updatedDaysAgo: 3 })

  const { start: bv2s, end: bv2e } = nextWeekday(2, 3)
  mkCase('Carlos Hernandez', 'Bereavement', bv2s, bv2e, 3, 'Grandmother passed away — traveling for funeral', 'open', { createdDaysAgo: 1 })

  const { start: bv3s, end: bv3e } = nextWeekday(4, 5)
  mkCase('Liam Chen', 'Bereavement', bv3s, bv3e, 5, 'Spouse\'s parent — bereavement and estate matters', 'open', {
    certRequired: true, docStatus: 'uploaded', createdDaysAgo: 3,
  })

  const { start: bv4s, end: bv4e } = nextWeekday(1, 2)
  mkCase('Hannah Lee', 'Bereavement', bv4s, bv4e, 2, 'Close family member — attending memorial service', 'open', { createdDaysAgo: 1 })

  // ─────────────────────────────────────────────────────────────────
  // EMERGENCY LEAVE (4) — urgent, next 2 days
  // ─────────────────────────────────────────────────────────────────
  mkCase('John Park',    'EmergencyLeave', isoDate(1), isoDate(1), 1, 'Pipe burst at home — emergency repairs', 'open', { priority: 'high', createdDaysAgo: 0 })
  mkCase('David Kim',    'EmergencyLeave', isoDate(1), isoDate(2), 2, 'Child hospitalized — emergency care required', 'open', { priority: 'high', createdDaysAgo: 0 })
  mkCase('Aisha Patel',  'EmergencyLeave', isoDate(2), isoDate(2), 1, 'Immediate family emergency — medical situation', 'open', { priority: 'high', createdDaysAgo: 0 })

  const { start: el4s, end: el4e } = nextWeekday(3, 1)
  mkCase('Emily Watson', 'EmergencyLeave', el4s, el4e, 1, 'Elderly parent fell — accompanying to hospital', 'open', { createdDaysAgo: 1 })

  // ─────────────────────────────────────────────────────────────────
  // COMP OFF (4)
  // ─────────────────────────────────────────────────────────────────
  const { start: c1s, end: c1e } = nextWeekday(5, 2)
  mkCase('Sarah Chen',    'CompOff', c1s, c1e, 2, 'Compensatory leave for Q4 crunch weekend work', 'open', { createdDaysAgo: 3 })

  const { start: c2s, end: c2e } = nextWeekday(8, 1)
  mkCase('Alex Johnson',  'CompOff', c2s, c2e, 1, 'Comp off for working last Sunday during release', 'open', { createdDaysAgo: 2 })

  const { start: c3s, end: c3e } = nextWeekday(10, 3)
  mkCase('Ryan Thompson', 'CompOff', c3s, c3e, 3, 'Compensatory leave earned from product launch overtime', 'open', { priority: 'medium', createdDaysAgo: 4 })

  const { start: c4s, end: c4e } = nextWeekday(6, 1)
  mkCase('Priya Singh',   'CompOff', c4s, c4e, 1, 'Comp off for attending weekend client meeting', 'open', { createdDaysAgo: 2 })

  // ─────────────────────────────────────────────────────────────────
  // MATERNITY / PATERNITY (3)
  // ─────────────────────────────────────────────────────────────────
  const { start: mat1s, end: mat1e } = nextWeekday(20, 60)
  mkCase('Olivia Foster', 'Maternity', mat1s, mat1e, 60, 'Planned maternity leave — expected delivery May 2026', 'pending_docs', {
    priority: 'high', certRequired: true, docStatus: 'missing',
    createdDaysAgo: 15,
  })

  const { start: pat1s, end: pat1e } = nextWeekday(25, 10)
  mkCase('Marcus Reid', 'Paternity', pat1s, pat1e, 10, 'Wife expecting — paternity leave for newborn care', 'open', {
    priority: 'high', certRequired: true, docStatus: 'uploaded',
    createdDaysAgo: 12,
  })

  // ─────────────────────────────────────────────────────────────────
  // HALF-DAY CASES (5)
  // ─────────────────────────────────────────────────────────────────
  const hdTmrw = isoDate(1)
  mkCase('Emily Watson',  'PTO',      hdTmrw, hdTmrw, 1, 'Doctor appointment in the morning', 'open', { halfDay: true, halfDayPeriod: 'morning', createdDaysAgo: 1 })
  mkCase('Carlos Hernandez', 'Personal', isoDate(2), isoDate(2), 1, 'Leaving early for son\'s school play', 'open', { halfDay: true, halfDayPeriod: 'afternoon', createdDaysAgo: 1 })
  mkCase('Hannah Lee',    'Sick',     isoDate(3), isoDate(3), 1, 'Migraine — taking morning off', 'open', { halfDay: true, halfDayPeriod: 'morning', createdDaysAgo: 0 })

  const { start: hd4s } = nextWeekday(5, 1)
  mkCase('Priya Singh',   'PTO',      hd4s, hd4s, 1, 'Afternoon appointment — leaving at lunch', 'open', { halfDay: true, halfDayPeriod: 'afternoon', createdDaysAgo: 2 })

  const { start: hd5s } = nextWeekday(7, 1)
  mkCase('David Kim',     'Personal', hd5s, hd5s, 1, 'Bank appointment in the afternoon', 'open', { halfDay: true, halfDayPeriod: 'afternoon', createdDaysAgo: 2 })

  // ─────────────────────────────────────────────────────────────────
  // UNPAID / HISTORICAL APPROVED cases (for history context)
  // ─────────────────────────────────────────────────────────────────
  // Some historically approved PTO for employees — gives them a clean track record
  const approvedHistory = [
    { emp: 'Sarah Chen', type: 'PTO', daysAgo: 30, duration: 3, reason: 'Summer vacation' },
    { emp: 'Emily Watson', type: 'PTO', daysAgo: 25, duration: 2, reason: 'Family trip' },
    { emp: 'Priya Singh', type: 'Sick', daysAgo: 20, duration: 1, reason: 'Flu symptoms' },
    { emp: 'Ryan Thompson', type: 'Personal', daysAgo: 15, duration: 1, reason: 'Family event' },
    { emp: 'Carlos Hernandez', type: 'PTO', daysAgo: 22, duration: 2, reason: 'Weekend getaway' },
    { emp: 'Aisha Patel', type: 'Personal', daysAgo: 18, duration: 1, reason: 'Religious observance' },
    { emp: 'Liam Chen', type: 'PTO', daysAgo: 35, duration: 5, reason: 'Annual vacation' },
    { emp: 'Sophia Martinez', type: 'Sick', daysAgo: 12, duration: 1, reason: 'Migraine' },
  ]
  for (const h of approvedHistory) {
    const start = isoDate(-h.daysAgo)
    const end = isoDate(-h.daysAgo + h.duration - 1)
    mkCase(h.emp, h.type, start, end, h.duration, h.reason, 'approved', {
      createdDaysAgo: h.daysAgo + 2, updatedDaysAgo: h.daysAgo - 1,
    })
  }

  // ─────────────────────────────────────────────────────────────────
  // Write all cases to Firestore in batches of 20
  // ─────────────────────────────────────────────────────────────────
  for (let start = 0; start < cases.length; start += 20) {
    const batch = db.batch()
    const chunk = cases.slice(start, start + 20)
    for (const c of chunk) {
      const ref = db.collection('cases').doc()
      const { docUrl: _docUrl, ...caseData } = c as any
      batch.set(ref, caseData)
    }
    await batch.commit()
  }

  // ─────────────────────────────────────────────────────────────────
  // Create document records for cases that have doc URLs
  // ─────────────────────────────────────────────────────────────────
  // (documents linked to the FMLA / Sick cases with uploaded status)
  // The doc creation is done separately in the actual app flow

  return NextResponse.json({
    success: true,
    message: `Seeded ${EMPLOYEES.length} employees + ${cases.length} cases across all leave types. Admin managedEmployeeIds cleared for full visibility.`,
    breakdown: {
      PTO: 15, Personal: 12, Sick: 10, FMLA: 5, Bereavement: 4,
      EmergencyLeave: 4, CompOff: 4, HalfDay: 5, Maternity: 1, Paternity: 1,
      approved_history: approvedHistory.length,
    },
  })
}
