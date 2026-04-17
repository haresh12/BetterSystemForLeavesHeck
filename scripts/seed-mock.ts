/**
 * Seed 100 OPEN mock cases + 15 employees for admin demo
 * ALL cases are OPEN — admin reviews/approves/rejects during demo
 * Run: npx tsx scripts/seed-mock.ts
 * Reset: npx tsx scripts/seed-mock.ts --reset
 */
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import * as fs from 'fs'
import * as path from 'path'

// ── Load env ──────────────────────────────────────────────────────────────────
const envPath = path.join(__dirname, '..', '.env.local')
const envContent = fs.readFileSync(envPath, 'utf-8')
const env: Record<string, string> = {}
for (const line of envContent.split('\n')) {
  if (!line || line.startsWith('#')) continue
  const eqIdx = line.indexOf('=')
  if (eqIdx === -1) continue
  const key = line.slice(0, eqIdx).trim()
  let val = line.slice(eqIdx + 1).trim()
  if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1)
  env[key] = val
}

if (getApps().length === 0) {
  initializeApp({
    credential: cert({
      projectId: env.FIREBASE_PROJECT_ID,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  })
}
const db = getFirestore()

// ── Load document URLs ────────────────────────────────────────────────────────
const urlsPath = path.join(__dirname, 'mock-docs', 'urls.json')
const docUrls: Record<string, string> = fs.existsSync(urlsPath) ? JSON.parse(fs.readFileSync(urlsPath, 'utf-8')) : {}
const medCertUrls = Object.entries(docUrls).filter(([k]) => k.startsWith('medical_cert')).map(([, v]) => v)
const fmlaUrls = Object.entries(docUrls).filter(([k]) => k.startsWith('wh380')).map(([, v]) => v)
const maternityUrls = Object.entries(docUrls).filter(([k]) => k.startsWith('discharge')).map(([, v]) => v)
const birthCertUrls = Object.entries(docUrls).filter(([k]) => k.startsWith('birth_cert')).map(([, v]) => v)
const deathCertUrls = Object.entries(docUrls).filter(([k]) => k.startsWith('death_cert')).map(([, v]) => v)

function pickUrl(type: string): string | null {
  const map: Record<string, string[]> = { Sick: medCertUrls, FMLA: fmlaUrls, Intermittent: fmlaUrls, Maternity: maternityUrls, Paternity: birthCertUrls, Bereavement: deathCertUrls }
  const arr = map[type]
  return arr && arr.length > 0 ? arr[Math.floor(Math.random() * arr.length)] : null
}

function rnd(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min }

function dateStr(daysFromNow: number): string {
  const d = new Date(); d.setDate(d.getDate() + daysFromNow)
  return d.toISOString().split('T')[0]
}

function pastTimestamp(daysAgo: number): Date {
  const d = new Date(); d.setDate(d.getDate() - daysAgo); return d
}

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }

// ── Mock employees (15 across 4 departments) ─────────────────────────────────
const EMPLOYEES = [
  { name: 'James Okafor',       email: 'james.okafor@convowork.com',       department: 'Engineering', jobTitle: 'Senior Engineer',    tenureYears: 4 },
  { name: 'Sarah Chen',         email: 'sarah.chen@convowork.com',         department: 'Engineering', jobTitle: 'Staff Engineer',     tenureYears: 6 },
  { name: 'Marcus Reid',        email: 'marcus.reid@convowork.com',        department: 'Engineering', jobTitle: 'Junior Developer',   tenureYears: 1 },
  { name: 'Emily Watson',       email: 'emily.watson@convowork.com',       department: 'Engineering', jobTitle: 'DevOps Engineer',    tenureYears: 3 },
  { name: 'Alex Johnson',       email: 'alex.johnson@convowork.com',       department: 'Engineering', jobTitle: 'QA Lead',            tenureYears: 5 },
  { name: 'Priya Singh',        email: 'priya.singh@convowork.com',        department: 'Product',     jobTitle: 'Product Manager',    tenureYears: 3 },
  { name: 'Olivia Foster',      email: 'olivia.foster@convowork.com',      department: 'Product',     jobTitle: 'UX Designer',        tenureYears: 2 },
  { name: 'Ryan Thompson',      email: 'ryan.thompson@convowork.com',      department: 'Product',     jobTitle: 'Data Analyst',       tenureYears: 4 },
  { name: 'Carlos Hernandez',   email: 'carlos.hernandez@convowork.com',   department: 'Sales',       jobTitle: 'Account Executive',  tenureYears: 2 },
  { name: 'Aisha Patel',        email: 'aisha.patel@convowork.com',        department: 'Sales',       jobTitle: 'Sales Manager',      tenureYears: 5 },
  { name: 'John Park',          email: 'john.park@convowork.com',          department: 'Sales',       jobTitle: 'Sales Rep',          tenureYears: 1 },
  { name: 'David Kim',          email: 'david.kim@convowork.com',          department: 'Sales',       jobTitle: 'BDR',                tenureYears: 2 },
  { name: 'Sophia Martinez',    email: 'sophia.martinez@convowork.com',    department: 'Design',      jobTitle: 'Visual Designer',    tenureYears: 3 },
  { name: 'Hannah Lee',         email: 'hannah.lee@convowork.com',         department: 'Design',      jobTitle: 'Brand Designer',     tenureYears: 2 },
  { name: 'Liam Chen',          email: 'liam.chen@convowork.com',          department: 'Design',      jobTitle: 'Design Lead',        tenureYears: 7 },
]

const REASONS: Record<string, string[]> = {
  PTO: ['Family vacation', 'Travel plans', 'Personal time off', 'Weekend getaway', 'Visiting parents', 'Friend wedding out of town', 'Home renovation break', 'Anniversary trip', 'Beach holiday', 'Mountain retreat'],
  Personal: ['Family event', 'Birthday celebration', 'School parent-teacher meeting', 'Apartment inspection', 'DMV appointment', 'Volunteering at shelter', 'Moving to new apartment', 'Sister graduation', 'Bank appointment', 'Passport renewal'],
  Sick: ['Flu symptoms since morning', 'Severe migraine', 'Back pain flare-up', 'Dental procedure scheduled', 'Eye infection', 'Stomach bug', 'Post-surgery recovery', 'Allergic reaction', 'High fever', 'Knee injury from gym'],
  FMLA: ['Chronic back condition treatment', 'Post-surgical knee rehabilitation', 'Ongoing mental health treatment', 'Cancer treatment sessions', 'Cardiac rehabilitation program', 'Fibromyalgia management'],
  Maternity: ['Expected delivery', 'Planned C-section', 'Maternity leave for newborn'],
  Paternity: ['Wife expecting delivery', 'Partner due date approaching', 'Newborn care leave'],
  Bereavement: ['Father passed away', 'Grandmother funeral', 'Close family member loss', 'Mother hospitalized - critical'],
  CompOff: ['Worked weekend on release', 'Overtime on Q4 close', 'Saturday deployment'],
}

// ── CASE DEFINITIONS ──────────────────────────────────────────────────────────
interface CaseDef {
  empIdx: number
  leaveType: string
  days: number
  startOffset: number // days from now (positive = future, negative = past/retroactive)
  reason: string
  certRequired: boolean
  hasDoc: boolean      // if cert required, does the doc exist?
  status: 'open' | 'pending_docs'
  createdAgo: number   // how many days ago was this case created
}

const CASES: CaseDef[] = []

// ── PTO cases (25) — all open, no docs needed ────────────────────────────────
// 5 starting TOMORROW (urgent!)
for (let i = 0; i < 5; i++) {
  CASES.push({ empIdx: rnd(0, 14), leaveType: 'PTO', days: rnd(1, 3), startOffset: 1, reason: pick(REASONS.PTO), certRequired: false, hasDoc: false, status: 'open', createdAgo: rnd(1, 3) })
}
// 5 starting in 2-3 days
for (let i = 0; i < 5; i++) {
  CASES.push({ empIdx: rnd(0, 14), leaveType: 'PTO', days: rnd(1, 5), startOffset: rnd(2, 3), reason: pick(REASONS.PTO), certRequired: false, hasDoc: false, status: 'open', createdAgo: rnd(1, 4) })
}
// 10 starting next week
for (let i = 0; i < 10; i++) {
  CASES.push({ empIdx: rnd(0, 14), leaveType: 'PTO', days: rnd(1, 5), startOffset: rnd(5, 14), reason: pick(REASONS.PTO), certRequired: false, hasDoc: false, status: 'open', createdAgo: rnd(1, 7) })
}
// 5 starting in 2+ weeks
for (let i = 0; i < 5; i++) {
  CASES.push({ empIdx: rnd(0, 14), leaveType: 'PTO', days: rnd(3, 5), startOffset: rnd(14, 30), reason: pick(REASONS.PTO), certRequired: false, hasDoc: false, status: 'open', createdAgo: rnd(1, 5) })
}

// ── Personal cases (20) — all open, no docs ──────────────────────────────────
for (let i = 0; i < 8; i++) {
  CASES.push({ empIdx: rnd(0, 14), leaveType: 'Personal', days: rnd(1, 2), startOffset: rnd(1, 7), reason: pick(REASONS.Personal), certRequired: false, hasDoc: false, status: 'open', createdAgo: rnd(0, 4) })
}
for (let i = 0; i < 12; i++) {
  CASES.push({ empIdx: rnd(0, 14), leaveType: 'Personal', days: rnd(1, 3), startOffset: rnd(7, 21), reason: pick(REASONS.Personal), certRequired: false, hasDoc: false, status: 'open', createdAgo: rnd(1, 6) })
}

// ── Sick cases (20) — some need docs (3+ days), some pending_docs ────────────
// Short sick (no doc needed)
for (let i = 0; i < 8; i++) {
  CASES.push({ empIdx: rnd(0, 14), leaveType: 'Sick', days: rnd(1, 2), startOffset: rnd(0, 5), reason: pick(REASONS.Sick), certRequired: false, hasDoc: false, status: 'open', createdAgo: rnd(0, 3) })
}
// Long sick WITH docs uploaded
for (let i = 0; i < 5; i++) {
  CASES.push({ empIdx: rnd(0, 14), leaveType: 'Sick', days: rnd(3, 7), startOffset: rnd(1, 10), reason: pick(REASONS.Sick), certRequired: true, hasDoc: true, status: 'open', createdAgo: rnd(1, 5) })
}
// Long sick MISSING docs (pending_docs)
for (let i = 0; i < 7; i++) {
  CASES.push({ empIdx: rnd(0, 14), leaveType: 'Sick', days: rnd(3, 5), startOffset: rnd(1, 7), reason: pick(REASONS.Sick), certRequired: true, hasDoc: false, status: 'pending_docs', createdAgo: rnd(3, 8) })
}

// ── FMLA cases (15) — all need docs ──────────────────────────────────────────
// FMLA with docs (open, ready to review)
for (let i = 0; i < 10; i++) {
  CASES.push({ empIdx: rnd(0, 14), leaveType: 'FMLA', days: rnd(5, 20), startOffset: rnd(3, 30), reason: pick(REASONS.FMLA), certRequired: true, hasDoc: true, status: 'open', createdAgo: rnd(2, 10) })
}
// FMLA missing docs
for (let i = 0; i < 5; i++) {
  CASES.push({ empIdx: rnd(0, 14), leaveType: 'FMLA', days: rnd(10, 30), startOffset: rnd(5, 20), reason: pick(REASONS.FMLA), certRequired: true, hasDoc: false, status: 'pending_docs', createdAgo: rnd(4, 12) })
}

// ── Maternity (5) — all with docs ────────────────────────────────────────────
for (let i = 0; i < 5; i++) {
  CASES.push({ empIdx: pick([6, 7, 13, 5, 12]), leaveType: 'Maternity', days: rnd(42, 84), startOffset: rnd(7, 45), reason: pick(REASONS.Maternity), certRequired: true, hasDoc: true, status: 'open', createdAgo: rnd(3, 14) })
}

// ── Paternity (5) — all with docs ────────────────────────────────────────────
for (let i = 0; i < 5; i++) {
  CASES.push({ empIdx: pick([0, 2, 3, 8, 11]), leaveType: 'Paternity', days: rnd(5, 10), startOffset: rnd(3, 21), reason: pick(REASONS.Paternity), certRequired: true, hasDoc: true, status: 'open', createdAgo: rnd(1, 7) })
}

// ── Bereavement (5) — some with docs, some pending ──────────────────────────
for (let i = 0; i < 3; i++) {
  CASES.push({ empIdx: rnd(0, 14), leaveType: 'Bereavement', days: rnd(5, 7), startOffset: rnd(0, 3), reason: pick(REASONS.Bereavement), certRequired: true, hasDoc: true, status: 'open', createdAgo: rnd(0, 3) })
}
for (let i = 0; i < 2; i++) {
  CASES.push({ empIdx: rnd(0, 14), leaveType: 'Bereavement', days: rnd(5, 10), startOffset: rnd(0, 5), reason: pick(REASONS.Bereavement), certRequired: true, hasDoc: false, status: 'pending_docs', createdAgo: rnd(2, 5) })
}

// ── SEEDED PATTERNS (intentional anomalies for AI to detect) ─────────────────

// James Okafor (idx 0): 6 Monday sick leaves — SUSPICIOUS
for (let i = 0; i < 6; i++) {
  // Find past Mondays
  const d = new Date()
  d.setDate(d.getDate() - (7 * (i + 1)) - ((d.getDay() + 6) % 7))
  const offset = Math.floor((d.getTime() - Date.now()) / 86400000)
  CASES.push({ empIdx: 0, leaveType: 'Sick', days: 1, startOffset: offset, reason: pick(['Headache', 'Not feeling well', 'Flu symptoms', 'Stomach issue', 'Back pain', 'Migraine']), certRequired: false, hasDoc: false, status: 'open', createdAgo: Math.abs(offset) + 1 })
}

// 4 Engineering people out SAME WEEK — coverage gap
const nextMon = 7 - new Date().getDay() + 1
for (let i = 0; i < 4; i++) {
  CASES.push({ empIdx: i, leaveType: 'PTO', days: 5, startOffset: nextMon, reason: pick(REASONS.PTO), certRequired: false, hasDoc: false, status: 'open', createdAgo: rnd(2, 5) })
}

// Sarah Chen (idx 1): escalating frequency
for (let i = 0; i < 4; i++) {
  CASES.push({ empIdx: 1, leaveType: 'Sick', days: 1, startOffset: rnd(-30, -10), reason: pick(REASONS.Sick), certRequired: false, hasDoc: false, status: 'open', createdAgo: rnd(10, 30) })
}

console.log(`Total cases to create: ${CASES.length}`)

// ── RESET ─────────────────────────────────────────────────────────────────────
async function resetMockData() {
  console.log('Deleting all mock data (isMockData: true)...')
  const collections = ['cases', 'users', 'documents', 'notifications', 'audit_logs']
  let total = 0
  for (const col of collections) {
    const snap = await db.collection(col).where('isMockData', '==', true).get()
    if (snap.empty) continue
    const chunks: FirebaseFirestore.QueryDocumentSnapshot[][] = []
    for (let i = 0; i < snap.docs.length; i += 400) chunks.push(snap.docs.slice(i, i + 400))
    for (const chunk of chunks) {
      const batch = db.batch()
      chunk.forEach(d => batch.delete(d.ref))
      await batch.commit()
    }
    total += snap.size
    console.log(`  Deleted ${snap.size} from ${col}`)
  }
  console.log(`Total deleted: ${total}\n`)
}

// ── SEED ──────────────────────────────────────────────────────────────────────
async function seed() {
  console.log('Creating 15 mock employees...')
  const empIds: string[] = []
  for (const emp of EMPLOYEES) {
    const ref = await db.collection('users').add({
      ...emp,
      role: 'employee',
      balances: { pto: rnd(5, 15), sick: rnd(3, 10), personal: rnd(2, 5), bereavement: 10, fmla: 60, maternity: 84, paternity: 10, unpaid: 30 },
      createdAt: FieldValue.serverTimestamp(),
      isMockData: true,
    })
    empIds.push(ref.id)
  }
  console.log(`  Created ${empIds.length} employees`)

  console.log(`Creating ${CASES.length} mock cases...`)
  let count = 0
  for (const c of CASES) {
    const emp = EMPLOYEES[c.empIdx]
    const empId = empIds[c.empIdx]
    const start = dateStr(c.startOffset)
    const end = dateStr(c.startOffset + c.days - 1)
    const created = pastTimestamp(c.createdAgo)
    const priority = ['FMLA', 'Maternity', 'Paternity'].includes(c.leaveType) ? 'high' : c.days >= 5 ? 'medium' : 'low'

    const caseRef = await db.collection('cases').add({
      employeeId: empId,
      employeeName: emp.name,
      employeeDepartment: emp.department,
      adminId: '',
      leaveType: c.leaveType,
      startDate: start,
      endDate: end,
      days: c.days,
      reason: c.reason,
      status: c.status,
      priority,
      docStatus: c.certRequired ? (c.hasDoc ? 'uploaded' : 'missing') : 'not_required',
      certificateRequired: c.certRequired,
      isRetroactive: c.startOffset < 0,
      fmlaExpiry: (c.leaveType === 'FMLA' || c.leaveType === 'Intermittent') ? dateStr(c.startOffset + 365) : null,
      rejectionReason: null,
      notes: [{ text: `Leave request submitted by ${emp.name}`, actorId: empId, actorName: emp.name, actorRole: 'employee', timestamp: created.toISOString() }],
      createdAt: created,
      updatedAt: created,
      isMockData: true,
    })

    // Create document if cert required and has doc
    if (c.certRequired && c.hasDoc) {
      const fileUrl = pickUrl(c.leaveType)
      const doctors = ['Dr. Sarah Johnson', 'Dr. Michael Chen', 'Dr. Priya Patel', 'Dr. James Wilson', 'Dr. Emily Rodriguez']
      const hospitals = ['Metro General Hospital', 'City Medical Center', 'St. Mary\'s Hospital', 'Valley Health Clinic', 'Pacific Medical Group']
      await db.collection('documents').add({
        caseId: caseRef.id,
        employeeId: empId,
        fileName: `${c.leaveType.toLowerCase()}_cert_${emp.name.replace(/\s/g, '_').toLowerCase()}.pdf`,
        fileUrl,
        uploadedAt: created,
        status: 'valid',
        extractedFields: {
          doctorName: pick(doctors),
          hospital: pick(hospitals),
          recommendedRestStart: start,
          recommendedRestEnd: end,
          diagnosisType: c.leaveType === 'Sick' ? 'Acute illness' : c.leaveType === 'FMLA' ? 'Serious health condition' : 'Medical procedure',
          signatureDetected: true,
          isValid: true,
          invalidReason: null,
          confidenceScore: Math.round((0.78 + Math.random() * 0.18) * 100) / 100,
        },
        isMockData: true,
      })
    }

    await db.collection('audit_logs').add({
      caseId: caseRef.id, actorId: empId, actorRole: 'employee',
      action: 'case_created', detail: `${c.leaveType} leave submitted for ${c.days} days`,
      timestamp: created, isMockData: true,
    })

    count++
    if (count % 25 === 0) console.log(`  ${count} cases created...`)
  }

  console.log(`\nDone! ${empIds.length} employees, ${count} cases. All isMockData: true.`)
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  if (process.argv.includes('--reset')) {
    await resetMockData()
    console.log('Run without --reset to re-seed.')
  } else {
    await resetMockData()
    await seed()
  }
  process.exit(0)
}

main().catch(err => { console.error('FATAL:', err); process.exit(1) })
