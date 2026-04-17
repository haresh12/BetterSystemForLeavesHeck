import type { Timestamp } from 'firebase/firestore'

// ─── Users ────────────────────────────────────────────────────────────────────
export type UserRole = 'employee' | 'admin'
export type EmployeeGender = 'male' | 'female'

export interface LeaveBalances {
  pto: number
  sick: number
  personal: number
  bereavement: number
  maternity: number
  paternity: number
  fmla: number          // days remaining in FMLA entitlement (usually 60/yr)
  unpaid: number
}

export interface UserDoc {
  uid: string
  name: string
  email: string
  role: UserRole
  gender?: EmployeeGender
  department: string
  jobTitle: string
  tenureYears: number
  managedEmployeeIds?: string[]   // admin only — [] means "all in org"
  balances?: LeaveBalances        // employee only
  createdAt: Timestamp
}

// ─── Cases ───────────────────────────────────────────────────────────────────
export type LeaveType =
  | 'PTO'
  | 'Sick'
  | 'FMLA'
  | 'Maternity'
  | 'Paternity'
  | 'Bereavement'
  | 'Personal'
  | 'Intermittent'
  | 'Unpaid'
  | 'CompOff'            // Compensatory Off
  | 'EmergencyLeave'

export type CaseStatus = 'open' | 'pending_docs' | 'approved' | 'rejected' | 'cancelled' | 'under_review'
export type CasePriority = 'critical' | 'high' | 'medium' | 'low'
export type DocStatus = 'uploaded' | 'missing' | 'not_required' | 'invalid'

export interface CaseNote {
  text: string
  actorId: string
  actorName: string
  actorRole: UserRole
  timestamp: string   // ISO
}

export interface CaseDoc {
  caseId: string
  employeeId: string
  employeeName: string
  employeeDepartment: string
  adminId: string
  leaveType: LeaveType
  startDate: string       // ISO
  endDate: string         // ISO
  days: number
  reason: string
  status: CaseStatus
  priority: CasePriority
  docStatus: DocStatus
  certificateRequired: boolean
  isRetroactive?: boolean
  fmlaExpiry: string | null   // ISO
  rejectionReason: string | null
  notes: CaseNote[]
  createdAt: Timestamp
  updatedAt: Timestamp
}

// ─── Documents ────────────────────────────────────────────────────────────────
export interface ExtractedFields {
  patientName: string | null
  doctorName: string | null
  hospital: string | null
  recommendedRestStart: string | null   // ISO
  recommendedRestEnd: string | null     // ISO
  diagnosisType: string | null
  signatureDetected: boolean
  isValid: boolean
  invalidReason: string | null
  confidenceScore: number              // 0–1
}

export interface DocumentDoc {
  documentId: string
  caseId: string
  employeeId: string
  fileName: string
  uploadedAt: Timestamp
  extractedFields: ExtractedFields
  status: 'valid' | 'invalid' | 'pending_review'
}

// ─── Notifications ────────────────────────────────────────────────────────────
export type NotificationType =
  | 'fmla_expiry'
  | 'document_missing'
  | 'case_approved'
  | 'case_rejected'
  | 'sla_breach'
  | 'new_case'
  | 'document_reminder'
  | 'leave_cancelled'
  | 'balance_low'

export interface NotificationDoc {
  notificationId: string
  targetUserId: string
  type: NotificationType
  caseId: string
  message: string
  read: boolean
  dismissed: boolean
  createdAt: Timestamp
}

// ─── Audit Logs ──────────────────────────────────────────────────────────────
export interface AuditLogDoc {
  logId: string
  caseId: string
  actorId: string
  actorRole: UserRole
  action: string
  detail: string
  timestamp: Timestamp
}

// ─── Policies ─────────────────────────────────────────────────────────────────
export interface PolicyDoc {
  leaveType: LeaveType
  displayName: string
  description: string
  maxDaysPerYear: number
  requiresCertificate: boolean
  certificateAfterDays: number | null   // null = always required
  carryForwardAllowed: boolean
  maxCarryForwardDays: number
  noticePeriodDays: number
  isActive: boolean
  eligibilityMonths: number   // minimum tenure to be eligible
}

// ─── Lean serialised version (for AI tool responses) ─────────────────────────
export interface LeanCase {
  caseId: string
  employeeId: string
  employeeName: string
  employeeDepartment: string
  adminId: string
  leaveType: LeaveType
  startDate: string
  endDate: string
  days: number
  reason: string
  status: CaseStatus
  priority: CasePriority
  docStatus: DocStatus
  certificateRequired: boolean
  fmlaExpiry: string | null
  rejectionReason: string | null
  notes: CaseNote[]
  createdAt: string   // ISO (serialised from Timestamp)
  updatedAt: string
}
