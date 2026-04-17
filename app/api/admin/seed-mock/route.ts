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
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }
function dateStr(daysFromNow: number) { const d = new Date(); d.setDate(d.getDate() + daysFromNow); return d.toISOString().split('T')[0] }
function pastDate(daysAgo: number) { const d = new Date(); d.setDate(d.getDate() - daysAgo); return d }

const EMPLOYEES = [
  { name: 'James Okafor', department: 'Engineering', jobTitle: 'Senior Engineer', tenureYears: 4 },
  { name: 'Sarah Chen', department: 'Engineering', jobTitle: 'Staff Engineer', tenureYears: 6 },
  { name: 'Marcus Reid', department: 'Engineering', jobTitle: 'Junior Developer', tenureYears: 1 },
  { name: 'Emily Watson', department: 'Engineering', jobTitle: 'DevOps Engineer', tenureYears: 3 },
  { name: 'Alex Johnson', department: 'Engineering', jobTitle: 'QA Lead', tenureYears: 5 },
  { name: 'Priya Singh', department: 'Product', jobTitle: 'Product Manager', tenureYears: 3 },
  { name: 'Olivia Foster', department: 'Product', jobTitle: 'UX Designer', tenureYears: 2 },
  { name: 'Ryan Thompson', department: 'Product', jobTitle: 'Data Analyst', tenureYears: 4 },
  { name: 'Carlos Hernandez', department: 'Sales', jobTitle: 'Account Executive', tenureYears: 2 },
  { name: 'Aisha Patel', department: 'Sales', jobTitle: 'Sales Manager', tenureYears: 5 },
  { name: 'John Park', department: 'Sales', jobTitle: 'Sales Rep', tenureYears: 1 },
  { name: 'David Kim', department: 'Sales', jobTitle: 'BDR', tenureYears: 2 },
  { name: 'Sophia Martinez', department: 'Design', jobTitle: 'Visual Designer', tenureYears: 3 },
  { name: 'Hannah Lee', department: 'Design', jobTitle: 'Brand Designer', tenureYears: 2 },
  { name: 'Liam Chen', department: 'Design', jobTitle: 'Design Lead', tenureYears: 7 },
]

const REASONS: Record<string, string[]> = {
  PTO: ['Family vacation', 'Travel plans', 'Weekend getaway', 'Visiting parents', 'Friend wedding', 'Anniversary trip'],
  Personal: ['Family event', 'Birthday celebration', 'School meeting', 'DMV appointment', 'Moving apartment', 'Passport renewal'],
  Sick: ['Flu symptoms', 'Severe migraine', 'Back pain', 'Dental procedure', 'Stomach bug', 'High fever'],
  FMLA: ['Chronic back condition', 'Post-surgical rehab', 'Mental health treatment', 'Cancer treatment'],
  Maternity: ['Expected delivery', 'Planned C-section'],
  Paternity: ['Wife expecting', 'Newborn care'],
  Bereavement: ['Father passed away', 'Family loss'],
}

export async function POST() {
  const cookieStore = await cookies()
  const token = cookieStore.get('session')?.value
  if (!token) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  try { await getAdminAuth().verifyIdToken(token) } catch { return NextResponse.json({ error: 'Invalid' }, { status: 401 }) }

  const db = getAdminDb()

  // Delete old mock data
  const collections = ['cases', 'users', 'documents', 'audit_logs', 'notifications']
  for (const col of collections) {
    const snap = await db.collection(col).where('isMockData', '==', true).get()
    if (snap.empty) continue
    const batch = db.batch()
    snap.docs.forEach(d => batch.delete(d.ref))
    await batch.commit()
  }

  // Create employees
  const empIds: string[] = []
  const empBatch = db.batch()
  for (const emp of EMPLOYEES) {
    const ref = db.collection('users').doc()
    empBatch.set(ref, { ...emp, email: `${emp.name.toLowerCase().replace(/\s/g, '.')}@convowork.com`, role: 'employee', balances: { pto: rnd(5, 15), sick: rnd(3, 10), personal: rnd(2, 5), bereavement: 10, fmla: 60, maternity: 84, paternity: 10, unpaid: 30 }, createdAt: FieldValue.serverTimestamp(), isMockData: true })
    empIds.push(ref.id)
  }
  await empBatch.commit()

  // Create cases in batches of 20
  const types = ['PTO', 'PTO', 'PTO', 'Personal', 'Personal', 'Sick', 'Sick', 'FMLA', 'Maternity', 'Paternity', 'Bereavement', 'PTO', 'Personal', 'Sick', 'PTO']
  let caseCount = 0

  for (let batch = 0; batch < 5; batch++) {
    const b = db.batch()
    for (let i = 0; i < 20; i++) {
      const empIdx = rnd(0, 14)
      const type = pick(types)
      const days = type === 'Maternity' ? rnd(42, 84) : type === 'FMLA' ? rnd(5, 15) : rnd(1, 3)
      // Spread dates across 60 days to reduce accidental overlaps
      const startOffset = rnd(1, 60)
      const certRequired = ['FMLA', 'Maternity', 'Paternity'].includes(type) || (type === 'Sick' && days >= 3)
      const hasMissingDoc = certRequired && rnd(0, 3) === 0
      const status = hasMissingDoc ? 'pending_docs' : 'open'

      const ref = db.collection('cases').doc()
      b.set(ref, {
        employeeId: empIds[empIdx],
        employeeName: EMPLOYEES[empIdx].name,
        employeeDepartment: EMPLOYEES[empIdx].department,
        adminId: '',
        leaveType: type,
        startDate: dateStr(startOffset),
        endDate: dateStr(startOffset + days - 1),
        days,
        reason: pick(REASONS[type] ?? REASONS.PTO),
        status,
        priority: ['FMLA', 'Maternity', 'Paternity'].includes(type) ? 'high' : days >= 5 ? 'medium' : 'low',
        docStatus: certRequired ? (hasMissingDoc ? 'missing' : 'uploaded') : 'not_required',
        certificateRequired: certRequired,
        isRetroactive: false,
        fmlaExpiry: type === 'FMLA' ? dateStr(startOffset + 365) : null,
        rejectionReason: null,
        notes: [{ text: `Leave request submitted`, actorId: empIds[empIdx], actorName: EMPLOYEES[empIdx].name, actorRole: 'employee', timestamp: new Date().toISOString() }],
        createdAt: pastDate(rnd(0, 10)),
        updatedAt: pastDate(rnd(0, 5)),
        isMockData: true,
      })
      caseCount++
    }
    await b.commit()
  }

  return NextResponse.json({ success: true, message: `Seeded ${empIds.length} employees + ${caseCount} cases` })
}
