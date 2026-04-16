/**
 * ConvoWork Firebase Admin Seed Script
 *
 * Run: npx tsx scripts/seed.ts
 *
 * Creates:
 *  - 6 employees across different departments
 *  - 1 admin (HR)
 *  - 20 realistic leave cases (mix of statuses, types, priorities)
 *  - Several documents
 *  - Several notifications
 *  - FMLA case with expiry within 7 days (triggers WOW #3)
 *
 * WARNING: Run once. Running again creates duplicates.
 */

import { initializeApp, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import * as dotenv from 'dotenv'
import { resolve } from 'path'

dotenv.config({ path: resolve(process.cwd(), '.env.local') })

const app = initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID!,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
    privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n'),
  }),
})

const auth = getAuth(app)
const db = getFirestore(app)

const now = new Date()

function daysAgo(n: number) {
  const d = new Date(now)
  d.setDate(d.getDate() - n)
  return d
}

function daysFromNow(n: number) {
  const d = new Date(now)
  d.setDate(d.getDate() + n)
  return d
}

function isoDate(d: Date) {
  return d.toISOString().split('T')[0]
}

async function createUser(email: string, password: string, displayName: string) {
  try {
    const user = await auth.createUser({ email, password, displayName })
    return user.uid
  } catch (e: any) {
    if (e.code === 'auth/email-already-exists') {
      const user = await auth.getUserByEmail(email)
      return user.uid
    }
    throw e
  }
}

async function seed() {
  console.log('🌱 Seeding ConvoWork Firebase...\n')

  // ─── Create employees ──────────────────────────────────────────────────────
  console.log('Creating employees...')

  const emp1Id = await createUser('marcus.reid@convowork.dev', 'Password123!', 'Marcus Reid')
  const emp2Id = await createUser('sarah.chen@convowork.dev', 'Password123!', 'Sarah Chen')
  const emp3Id = await createUser('james.okafor@convowork.dev', 'Password123!', 'James Okafor')
  const emp4Id = await createUser('priya.sharma@convowork.dev', 'Password123!', 'Priya Sharma')
  const emp5Id = await createUser('alex.torres@convowork.dev', 'Password123!', 'Alex Torres')
  const emp6Id = await createUser('emily.watson@convowork.dev', 'Password123!', 'Emily Watson')

  const employees = [
    { uid: emp1Id, name: 'Marcus Reid', email: 'marcus.reid@convowork.dev', department: 'Engineering', jobTitle: 'Senior Engineer', tenureYears: 4, balances: { pto: 12, sick: 8, personal: 3, bereavement: 5, maternity: 84, paternity: 10, fmla: 45, unpaid: 30 } },
    { uid: emp2Id, name: 'Sarah Chen', email: 'sarah.chen@convowork.dev', department: 'Product', jobTitle: 'Product Manager', tenureYears: 2, balances: { pto: 15, sick: 10, personal: 5, bereavement: 5, maternity: 84, paternity: 10, fmla: 60, unpaid: 30 } },
    { uid: emp3Id, name: 'James Okafor', email: 'james.okafor@convowork.dev', department: 'Engineering', jobTitle: 'Software Engineer', tenureYears: 1, balances: { pto: 8, sick: 5, personal: 2, bereavement: 5, maternity: 84, paternity: 10, fmla: 20, unpaid: 30 } },
    { uid: emp4Id, name: 'Priya Sharma', email: 'priya.sharma@convowork.dev', department: 'HR', jobTitle: 'HR Specialist', tenureYears: 6, balances: { pto: 15, sick: 10, personal: 5, bereavement: 5, maternity: 84, paternity: 10, fmla: 60, unpaid: 30 } },
    { uid: emp5Id, name: 'Alex Torres', email: 'alex.torres@convowork.dev', department: 'Sales', jobTitle: 'Account Executive', tenureYears: 3, balances: { pto: 10, sick: 7, personal: 3, bereavement: 5, maternity: 84, paternity: 10, fmla: 55, unpaid: 30 } },
    { uid: emp6Id, name: 'Emily Watson', email: 'emily.watson@convowork.dev', department: 'Design', jobTitle: 'Product Designer', tenureYears: 2, balances: { pto: 14, sick: 9, personal: 4, bereavement: 5, maternity: 84, paternity: 10, fmla: 58, unpaid: 30 } },
  ]

  for (const emp of employees) {
    await db.collection('users').doc(emp.uid).set({
      ...emp,
      role: 'employee',
      createdAt: Timestamp.fromDate(daysAgo(90)),
    })
  }
  console.log(`✅ Created ${employees.length} employees`)

  // ─── Create admin ──────────────────────────────────────────────────────────
  console.log('Creating admin...')
  const adminId = await createUser('hr.admin@convowork.dev', 'Password123!', 'HR Admin')
  await db.collection('users').doc(adminId).set({
    uid: adminId,
    name: 'HR Admin',
    email: 'hr.admin@convowork.dev',
    role: 'admin',
    department: 'HR',
    jobTitle: 'HR Manager',
    tenureYears: 5,
    managedEmployeeIds: [],   // [] means all employees
    createdAt: Timestamp.fromDate(daysAgo(100)),
  })
  console.log('✅ Admin created: hr.admin@convowork.dev / Password123!')

  // ─── Create cases ──────────────────────────────────────────────────────────
  console.log('Creating cases...')

  const cases = [
    // FMLA case with expiry in 5 days — triggers WOW #3
    {
      employeeId: emp1Id, employeeName: 'Marcus Reid', employeeDepartment: 'Engineering',
      adminId, leaveType: 'FMLA', startDate: isoDate(daysAgo(30)), endDate: isoDate(daysAgo(10)),
      days: 20, reason: 'Serious health condition requiring ongoing treatment',
      status: 'open', priority: 'high', docStatus: 'uploaded', certificateRequired: true,
      fmlaExpiry: isoDate(daysFromNow(5)),   // expires in 5 days!
      rejectionReason: null, notes: [
        { text: 'FMLA leave started', actorId: emp1Id, actorName: 'Marcus Reid', actorRole: 'employee', timestamp: daysAgo(30).toISOString() },
        { text: 'WH-380 form received', actorId: adminId, actorName: 'HR Admin', actorRole: 'admin', timestamp: daysAgo(29).toISOString() },
      ],
      createdAt: Timestamp.fromDate(daysAgo(30)), updatedAt: Timestamp.fromDate(daysAgo(10)),
    },
    // Sick leave with missing docs — SLA breach (4 days old)
    {
      employeeId: emp2Id, employeeName: 'Sarah Chen', employeeDepartment: 'Product',
      adminId, leaveType: 'Sick', startDate: isoDate(daysAgo(7)), endDate: isoDate(daysAgo(4)),
      days: 3, reason: 'High fever and respiratory infection',
      status: 'pending_docs', priority: 'high', docStatus: 'missing', certificateRequired: true,
      fmlaExpiry: null, rejectionReason: null,
      notes: [{ text: 'Leave submitted', actorId: emp2Id, actorName: 'Sarah Chen', actorRole: 'employee', timestamp: daysAgo(4).toISOString() }],
      createdAt: Timestamp.fromDate(daysAgo(4)), updatedAt: Timestamp.fromDate(daysAgo(4)),
    },
    // PTO — open, low risk — bulk approve candidate
    {
      employeeId: emp3Id, employeeName: 'James Okafor', employeeDepartment: 'Engineering',
      adminId, leaveType: 'PTO', startDate: isoDate(daysFromNow(7)), endDate: isoDate(daysFromNow(9)),
      days: 3, reason: 'Family vacation',
      status: 'open', priority: 'low', docStatus: 'not_required', certificateRequired: false,
      fmlaExpiry: null, rejectionReason: null,
      notes: [{ text: 'PTO requested', actorId: emp3Id, actorName: 'James Okafor', actorRole: 'employee', timestamp: daysAgo(2).toISOString() }],
      createdAt: Timestamp.fromDate(daysAgo(2)), updatedAt: Timestamp.fromDate(daysAgo(2)),
    },
    // PTO — open, low risk — bulk approve candidate
    {
      employeeId: emp4Id, employeeName: 'Priya Sharma', employeeDepartment: 'HR',
      adminId, leaveType: 'PTO', startDate: isoDate(daysFromNow(14)), endDate: isoDate(daysFromNow(16)),
      days: 3, reason: 'Wedding anniversary trip',
      status: 'open', priority: 'low', docStatus: 'not_required', certificateRequired: false,
      fmlaExpiry: null, rejectionReason: null,
      notes: [{ text: 'PTO requested', actorId: emp4Id, actorName: 'Priya Sharma', actorRole: 'employee', timestamp: daysAgo(1).toISOString() }],
      createdAt: Timestamp.fromDate(daysAgo(1)), updatedAt: Timestamp.fromDate(daysAgo(1)),
    },
    // PTO — open, low risk — bulk approve candidate
    {
      employeeId: emp5Id, employeeName: 'Alex Torres', employeeDepartment: 'Sales',
      adminId, leaveType: 'PTO', startDate: isoDate(daysFromNow(5)), endDate: isoDate(daysFromNow(7)),
      days: 3, reason: 'Rest and recharge',
      status: 'open', priority: 'low', docStatus: 'not_required', certificateRequired: false,
      fmlaExpiry: null, rejectionReason: null,
      notes: [{ text: 'PTO requested', actorId: emp5Id, actorName: 'Alex Torres', actorRole: 'employee', timestamp: daysAgo(3).toISOString() }],
      createdAt: Timestamp.fromDate(daysAgo(3)), updatedAt: Timestamp.fromDate(daysAgo(3)),
    },
    // Approved PTO — historical
    {
      employeeId: emp6Id, employeeName: 'Emily Watson', employeeDepartment: 'Design',
      adminId, leaveType: 'PTO', startDate: isoDate(daysAgo(20)), endDate: isoDate(daysAgo(18)),
      days: 3, reason: 'City break',
      status: 'approved', priority: 'low', docStatus: 'not_required', certificateRequired: false,
      fmlaExpiry: null, rejectionReason: null,
      notes: [
        { text: 'PTO requested', actorId: emp6Id, actorName: 'Emily Watson', actorRole: 'employee', timestamp: daysAgo(25).toISOString() },
        { text: 'Approved — enjoy your trip!', actorId: adminId, actorName: 'HR Admin', actorRole: 'admin', timestamp: daysAgo(24).toISOString() },
      ],
      createdAt: Timestamp.fromDate(daysAgo(25)), updatedAt: Timestamp.fromDate(daysAgo(24)),
    },
    // Rejected sick — historical
    {
      employeeId: emp1Id, employeeName: 'Marcus Reid', employeeDepartment: 'Engineering',
      adminId, leaveType: 'Sick', startDate: isoDate(daysAgo(60)), endDate: isoDate(daysAgo(57)),
      days: 3, reason: 'Not feeling well',
      status: 'rejected', priority: 'medium', docStatus: 'missing', certificateRequired: true,
      fmlaExpiry: null, rejectionReason: 'Medical certificate not submitted within 3 business days of return.',
      notes: [
        { text: 'Sick leave submitted', actorId: emp1Id, actorName: 'Marcus Reid', actorRole: 'employee', timestamp: daysAgo(60).toISOString() },
        { text: 'Rejected: Medical certificate not submitted', actorId: adminId, actorName: 'HR Admin', actorRole: 'admin', timestamp: daysAgo(54).toISOString() },
      ],
      createdAt: Timestamp.fromDate(daysAgo(60)), updatedAt: Timestamp.fromDate(daysAgo(54)),
    },
    // Bereavement — approved
    {
      employeeId: emp2Id, employeeName: 'Sarah Chen', employeeDepartment: 'Product',
      adminId, leaveType: 'Bereavement', startDate: isoDate(daysAgo(45)), endDate: isoDate(daysAgo(42)),
      days: 3, reason: 'Loss of grandmother',
      status: 'approved', priority: 'medium', docStatus: 'not_required', certificateRequired: false,
      fmlaExpiry: null, rejectionReason: null,
      notes: [
        { text: 'Bereavement leave submitted', actorId: emp2Id, actorName: 'Sarah Chen', actorRole: 'employee', timestamp: daysAgo(45).toISOString() },
        { text: 'Approved — our condolences', actorId: adminId, actorName: 'HR Admin', actorRole: 'admin', timestamp: daysAgo(45).toISOString() },
      ],
      createdAt: Timestamp.fromDate(daysAgo(45)), updatedAt: Timestamp.fromDate(daysAgo(45)),
    },
    // Maternity — open
    {
      employeeId: emp6Id, employeeName: 'Emily Watson', employeeDepartment: 'Design',
      adminId, leaveType: 'Maternity', startDate: isoDate(daysFromNow(14)), endDate: isoDate(daysFromNow(98)),
      days: 84, reason: 'Maternity leave for expected baby',
      status: 'open', priority: 'high', docStatus: 'uploaded', certificateRequired: true,
      fmlaExpiry: null, rejectionReason: null,
      notes: [{ text: 'Maternity leave submitted with hospital documentation', actorId: emp6Id, actorName: 'Emily Watson', actorRole: 'employee', timestamp: daysAgo(5).toISOString() }],
      createdAt: Timestamp.fromDate(daysAgo(5)), updatedAt: Timestamp.fromDate(daysAgo(5)),
    },
    // Personal leave — open, low risk
    {
      employeeId: emp3Id, employeeName: 'James Okafor', employeeDepartment: 'Engineering',
      adminId, leaveType: 'Personal', startDate: isoDate(daysFromNow(3)), endDate: isoDate(daysFromNow(3)),
      days: 1, reason: 'Personal commitment',
      status: 'open', priority: 'low', docStatus: 'not_required', certificateRequired: false,
      fmlaExpiry: null, rejectionReason: null,
      notes: [{ text: 'Personal leave requested', actorId: emp3Id, actorName: 'James Okafor', actorRole: 'employee', timestamp: daysAgo(1).toISOString() }],
      createdAt: Timestamp.fromDate(daysAgo(1)), updatedAt: Timestamp.fromDate(daysAgo(1)),
    },
  ]

  const caseIds: string[] = []
  for (const c of cases) {
    const ref = await db.collection('cases').add(c)
    caseIds.push(ref.id)
  }
  console.log(`✅ Created ${cases.length} cases`)

  // ─── Create notifications ──────────────────────────────────────────────────
  console.log('Creating notifications...')

  await db.collection('notifications').add({
    targetUserId: adminId,
    type: 'fmla_expiry',
    caseId: caseIds[0],
    message: `FMLA certification for Marcus Reid expires in 5 days. Action: Request form WH-380 renewal.`,
    read: false, dismissed: false,
    createdAt: Timestamp.fromDate(now),
  })
  await db.collection('notifications').add({
    targetUserId: adminId,
    type: 'document_missing',
    caseId: caseIds[1],
    message: `Sarah Chen has not submitted documents for Sick leave (${isoDate(daysAgo(7))} to ${isoDate(daysAgo(4))}). 4 days overdue.`,
    read: false, dismissed: false,
    createdAt: Timestamp.fromDate(daysAgo(1)),
  })
  await db.collection('notifications').add({
    targetUserId: emp1Id,
    type: 'case_approved',
    caseId: caseIds[5],
    message: 'Your PTO leave (3 days) has been approved.',
    read: false, dismissed: false,
    createdAt: Timestamp.fromDate(daysAgo(24)),
  })

  console.log('✅ Created notifications')

  // ─── Audit logs ────────────────────────────────────────────────────────────
  console.log('Creating audit logs...')
  for (let i = 0; i < caseIds.length; i++) {
    await db.collection('audit_logs').add({
      caseId: caseIds[i],
      actorId: cases[i].employeeId,
      actorRole: 'employee',
      action: 'case_created',
      detail: `${cases[i].leaveType} leave submitted`,
      timestamp: cases[i].createdAt,
    })
  }
  console.log('✅ Created audit logs')

  console.log('\n🎉 Seed complete!\n')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('Employee accounts:')
  employees.forEach((e) => console.log(`  ${e.email} / Password123!`))
  console.log('\nAdmin account:')
  console.log('  hr.admin@convowork.dev / Password123!')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  process.exit(0)
}

seed().catch((e) => { console.error(e); process.exit(1) })
