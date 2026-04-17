/**
 * policy-mcp — Leave policy rules engine
 * Tools: get_leave_policy, check_certificate_required, get_fmla_rules, get_leave_types, get_company_holidays
 */
import { tool } from 'ai'
import { z } from 'zod'
import { COMPANY_HOLIDAYS } from '@/lib/utils'

// Company leave policies — in a real org these would be in Firestore policies collection
// but defining them here as structured data that agents query via tools
const LEAVE_POLICIES = {
  PTO: {
    displayName: 'Paid Time Off (PTO)',
    description: 'Pre-approved discretionary time off for vacation, personal needs, or rest.',
    maxDaysPerYear: 15,
    requiresCertificate: false,
    certificateAfterDays: null,
    carryForwardAllowed: true,
    maxCarryForwardDays: 5,
    noticePeriodDays: 5,
    eligibilityMonths: 3,
    halfDayAllowed: true,
    isActive: true,
  },
  Sick: {
    displayName: 'Sick Leave',
    description: 'For personal illness or medical appointments. Certificate required for 3+ consecutive days.',
    maxDaysPerYear: 10,
    requiresCertificate: true,
    certificateAfterDays: 2,  // required from day 3 onwards
    carryForwardAllowed: false,
    maxCarryForwardDays: 0,
    noticePeriodDays: 0,
    eligibilityMonths: 0,
    halfDayAllowed: true,
    isActive: true,
  },
  FMLA: {
    displayName: 'Family & Medical Leave (FMLA)',
    description: 'Federal job-protected leave for serious health conditions, childbirth, or family care. Requires WH-380 form.',
    maxDaysPerYear: 60,
    requiresCertificate: true,
    certificateAfterDays: 0,  // always required
    carryForwardAllowed: false,
    maxCarryForwardDays: 0,
    noticePeriodDays: 30,
    eligibilityMonths: 12,
    halfDayAllowed: false,
    isActive: true,
  },
  Maternity: {
    displayName: 'Maternity Leave',
    description: 'Paid maternity leave for birthing parents. Hospital discharge papers or birth certificate required.',
    maxDaysPerYear: 84,
    requiresCertificate: true,
    certificateAfterDays: 0,
    carryForwardAllowed: false,
    maxCarryForwardDays: 0,
    noticePeriodDays: 60,
    eligibilityMonths: 12,
    halfDayAllowed: false,
    isActive: true,
  },
  Paternity: {
    displayName: 'Paternity Leave',
    description: 'Paid paternity leave for non-birthing parents.',
    maxDaysPerYear: 10,
    requiresCertificate: true,
    certificateAfterDays: 0,
    carryForwardAllowed: false,
    maxCarryForwardDays: 0,
    noticePeriodDays: 30,
    eligibilityMonths: 12,
    halfDayAllowed: false,
    isActive: true,
  },
  Bereavement: {
    displayName: 'Bereavement Leave',
    description: 'Leave for the death of an immediate or extended family member.',
    maxDaysPerYear: 10,
    requiresCertificate: false,
    certificateAfterDays: 5,  // death certificate for 5+ days
    carryForwardAllowed: false,
    maxCarryForwardDays: 0,
    noticePeriodDays: 0,
    eligibilityMonths: 0,
    halfDayAllowed: true,
    isActive: true,
  },
  Personal: {
    displayName: 'Personal Leave',
    description: 'Unpaid personal leave for events not covered by other leave types.',
    maxDaysPerYear: 5,
    requiresCertificate: false,
    certificateAfterDays: null,
    carryForwardAllowed: false,
    maxCarryForwardDays: 0,
    noticePeriodDays: 3,
    eligibilityMonths: 0,
    halfDayAllowed: true,
    isActive: true,
  },
  Intermittent: {
    displayName: 'Intermittent FMLA',
    description: 'Intermittent or reduced-schedule FMLA for recurring medical conditions.',
    maxDaysPerYear: 60,
    requiresCertificate: true,
    certificateAfterDays: 0,
    carryForwardAllowed: false,
    maxCarryForwardDays: 0,
    noticePeriodDays: 30,
    eligibilityMonths: 12,
    halfDayAllowed: false,
    isActive: true,
  },
  Unpaid: {
    displayName: 'Unpaid Leave',
    description: 'Unpaid extended leave when all other balances are exhausted.',
    maxDaysPerYear: 30,
    requiresCertificate: false,
    certificateAfterDays: null,
    carryForwardAllowed: false,
    maxCarryForwardDays: 0,
    noticePeriodDays: 14,
    eligibilityMonths: 6,
    halfDayAllowed: true,
    isActive: true,
  },
  CompOff: {
    displayName: 'Compensatory Off',
    description: 'Time off in lieu of overtime worked.',
    maxDaysPerYear: 10,
    requiresCertificate: false,
    certificateAfterDays: null,
    carryForwardAllowed: true,
    maxCarryForwardDays: 5,
    noticePeriodDays: 1,
    eligibilityMonths: 0,
    halfDayAllowed: true,
    isActive: true,
  },
  EmergencyLeave: {
    displayName: 'Emergency Leave',
    description: 'Immediate leave for unforeseen emergencies.',
    maxDaysPerYear: 3,
    requiresCertificate: false,
    certificateAfterDays: null,
    carryForwardAllowed: false,
    maxCarryForwardDays: 0,
    noticePeriodDays: 0,
    eligibilityMonths: 0,
    halfDayAllowed: true,
    isActive: true,
  },
}

export const policyMcpTools = {
  get_leave_policy: tool({
    description: 'Get full policy details for a specific leave type.',
    inputSchema: z.object({
      leaveType: z.enum(['PTO', 'Sick', 'FMLA', 'Maternity', 'Paternity', 'Bereavement', 'Personal', 'Intermittent', 'Unpaid', 'CompOff', 'EmergencyLeave']),
    }),
    execute: async ({ leaveType }) => {
      const policy = LEAVE_POLICIES[leaveType]
      if (!policy) return { error: `Unknown leave type: ${leaveType}` }
      return { leaveType, ...policy }
    },
  }),

  check_certificate_required: tool({
    description: 'Determine whether a medical certificate or supporting document is required for a given leave type and duration.',
    inputSchema: z.object({
      leaveType: z.enum(['PTO', 'Sick', 'FMLA', 'Maternity', 'Paternity', 'Bereavement', 'Personal', 'Intermittent', 'Unpaid', 'CompOff', 'EmergencyLeave']),
      days: z.number().describe('Number of leave days (use 0.5 for half-day)'),
      startDayOfWeek: z.number().optional().describe('0=Sunday, 1=Monday ... 6=Saturday — used for Monday/Friday flag checks'),
      isHalfDay: z.boolean().optional().default(false).describe('True for half-day leave requests'),
    }),
    execute: async ({ leaveType, days, startDayOfWeek, isHalfDay }) => {
      const policy = LEAVE_POLICIES[leaveType]
      if (!policy) return { required: false, reason: 'Unknown leave type' }

      // Half-day leaves never require certificates (duration-based rules don't apply)
      if (isHalfDay && policy.certificateAfterDays !== 0) {
        return { required: false, documentType: 'None', reason: `Half-day ${policy.displayName} does not require documentation.` }
      }

      let required = false
      let documentType = 'None'
      let reason = ''

      if (policy.certificateAfterDays === 0) {
        // Always required
        required = true
        reason = `${policy.displayName} always requires supporting documentation.`
        const certMap: Record<string, string> = {
          FMLA: 'WH-380 form or equivalent',
          Intermittent: 'WH-380 form with recertification',
          Maternity: 'Hospital discharge papers or birth certificate',
          Paternity: 'Birth certificate or hospital letter',
          Bereavement: 'Obituary or funeral program (for 5+ days: death certificate)',
        }
        documentType = certMap[leaveType] ?? 'Medical certificate on official letterhead'
      } else if (policy.certificateAfterDays !== null && days >= policy.certificateAfterDays) {
        // Required only after N days
        required = true
        reason = `${policy.displayName} requires a certificate for ${days >= policy.certificateAfterDays ? 'requests of ' + policy.certificateAfterDays + '+ days' : ''}.`
        documentType = 'Medical certificate on official letterhead'
      }

      // Monday/Friday policy flag for sick leave
      if (leaveType === 'Sick' && !required && startDayOfWeek !== undefined) {
        if (startDayOfWeek === 1 || startDayOfWeek === 5) {
          return {
            required: false,
            flagged: true,
            reason: 'Policy note: Sick leave starting Monday or Friday may require manager review. Certificate recommended.',
            documentType: 'Medical certificate (recommended)',
          }
        }
      }

      return { required, documentType, reason: reason || `${policy.displayName} does not require supporting documents.` }
    },
  }),

  get_fmla_rules: tool({
    description: 'Get FMLA-specific rules including eligibility, duration, certification requirements, and renewal schedule.',
    inputSchema: z.object({}),
    execute: async () => {
      return {
        eligibility: {
          minTenureMonths: 12,
          minHoursWorked: 1250,
          companySizeMin: 50,
        },
        duration: {
          maxWeeksPerYear: 12,
          maxDaysPerYear: 60,
          intermittentAllowed: true,
          reducedScheduleAllowed: true,
        },
        certificationRules: {
          formRequired: 'WH-380-E (employee health condition) or WH-380-F (family member)',
          certificationValidityMonths: 12,
          renewalRequired: true,
          renewalWindowDays: 15,
          recertificationForIntermittent: 'Every 6 months or on changed condition',
        },
        expiryWarning: {
          warnDaysBeforeExpiry: 7,
          actionRequired: 'Contact employee to request renewal form WH-380',
        },
        designationRequirements: {
          noticeToEmployeeDays: 5,
          designationFormRequired: true,
        },
      }
    },
  }),

  get_leave_types: tool({
    description: 'Get a summary of all available leave types in the organisation with key details.',
    inputSchema: z.object({
      includeInactive: z.boolean().optional().default(false),
    }),
    execute: async ({ includeInactive }) => {
      const types = Object.entries(LEAVE_POLICIES)
        .filter(([, p]) => includeInactive || p.isActive)
        .map(([type, policy]) => ({
          leaveType: type,
          displayName: policy.displayName,
          description: policy.description,
          maxDaysPerYear: policy.maxDaysPerYear,
          requiresCertificate: policy.requiresCertificate,
          noticePeriodDays: policy.noticePeriodDays,
          eligibilityMonths: policy.eligibilityMonths,
          halfDayAllowed: policy.halfDayAllowed,
        }))

      return { leaveTypes: types, total: types.length }
    },
  }),

  get_company_holidays: tool({
    description: 'Get the company holiday list for a given year or all configured years.',
    inputSchema: z.object({
      year: z.number().optional().describe('Optional year filter like 2026'),
      includeAllYears: z.boolean().optional().default(false).describe('Set true only when the user explicitly asks for all configured years'),
    }),
    execute: async ({ year, includeAllYears }) => {
      const currentYear = new Date().getFullYear()
      const targetYear = includeAllYears ? null : (year ?? currentYear)
      const holidays = Object.entries(COMPANY_HOLIDAYS)
        .filter(([date]) => !targetYear || date.startsWith(`${targetYear}-`))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, name]) => ({ date, name }))

      return {
        holidays,
        total: holidays.length,
        year: targetYear ?? 'all',
      }
    },
  }),
}
