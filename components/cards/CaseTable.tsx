'use client'

import { motion } from 'framer-motion'
import { formatDate } from '@/lib/utils'
import type { LeanCase, CaseStatus } from '@/lib/firebase/types'
import { Calendar, CheckCircle2, XCircle, Clock, FileText, Ban, AlertCircle } from 'lucide-react'

interface CaseTableProps {
  cases: LeanCase[]
  total?: number
  viewType?: 'default' | 'calendar'
  viewLabel?: string
}

const STATUS: Record<CaseStatus, {
  label: string
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  bg: string
  fg: string
  strip: string
}> = {
  open:         { label: 'Open',         icon: Clock,        bg: '#eef2ff', fg: '#4f46e5', strip: '#6366f1' },
  pending_docs: { label: 'Pending Docs', icon: FileText,     bg: '#fef9c3', fg: '#a16207', strip: '#f59e0b' },
  approved:     { label: 'Approved',     icon: CheckCircle2, bg: '#dcfce7', fg: '#15803d', strip: '#22c55e' },
  rejected:     { label: 'Rejected',     icon: XCircle,      bg: '#fee2e2', fg: '#b91c1c', strip: '#ef4444' },
  cancelled:    { label: 'Cancelled',    icon: Ban,          bg: '#f1f5f9', fg: '#64748b', strip: '#94a3b8' },
  under_review: { label: 'Under Review', icon: AlertCircle,  bg: '#dbeafe', fg: '#1d4ed8', strip: '#3b82f6' },
}

const TYPE_COLOR: Record<string, string> = {
  PTO: '#6366f1', Sick: '#f59e0b', Personal: '#10b981', Bereavement: '#8b5cf6',
  FMLA: '#ef4444', Maternity: '#ec4899', Paternity: '#3b82f6', Intermittent: '#f97316',
  Unpaid: '#94a3b8', CompOff: '#06b6d4', EmergencyLeave: '#f43f5e',
}

export function CaseTable({ cases, total, viewType = 'default', viewLabel }: CaseTableProps) {
  const isEmpty = !cases || cases.length === 0
  const title = viewLabel ?? (viewType === 'calendar' ? 'Team Calendar' : 'All Requests')

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="w-full rounded-2xl overflow-hidden"
      style={{ background: '#fff', border: '1px solid #e8e8f0', boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-3.5"
        style={{ borderBottom: '1px solid #f0f0f5', background: '#fafaff' }}
      >
        <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6366f1' }}>
          {title}
        </span>
        <span
          style={{
            fontSize: 12, fontWeight: 700, color: '#64748b',
            background: '#f1f5f9', borderRadius: 99, padding: '2px 10px',
          }}
        >
          {total ?? cases?.length ?? 0} request{(total ?? cases.length) !== 1 ? 's' : ''}
        </span>
      </div>

      {isEmpty ? (
        <div style={{ padding: '48px 24px', textAlign: 'center' }}>
          <Calendar className="h-8 w-8 mx-auto mb-3" style={{ color: '#cbd5e1' }} />
          <p style={{ fontSize: 14, fontWeight: 700, color: '#475569' }}>No leave requests</p>
          <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>Your submitted leaves will appear here</p>
        </div>
      ) : (
        <div>
          {cases.map((c, i) => {
            const st = STATUS[c.status] ?? STATUS.open
            const StatusIcon = st.icon
            const typeColor = TYPE_COLOR[c.leaveType] ?? '#6366f1'
            const isSameDay = c.startDate === c.endDate

            return (
              <motion.div
                key={c.caseId}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04, duration: 0.25 }}
                style={{ borderBottom: i < cases.length - 1 ? '1px solid #f0f0f5' : 'none', display: 'flex' }}
              >
                {/* Colour strip */}
                <div style={{ width: 3, background: st.strip, flexShrink: 0 }} />

                {/* Content */}
                <div style={{ flex: 1, padding: '14px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>

                    {/* Left */}
                    <div style={{ display: 'flex', gap: 12, minWidth: 0 }}>
                      {/* Type badge */}
                      <div
                        style={{
                          height: 38, width: 38, borderRadius: 10,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 12, fontWeight: 900, flexShrink: 0,
                          background: `${typeColor}15`, color: typeColor, border: `1.5px solid ${typeColor}25`,
                        }}
                      >
                        {c.leaveType.slice(0, 2).toUpperCase()}
                      </div>

                      <div style={{ minWidth: 0 }}>
                        {/* Type + days */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 15, fontWeight: 800, color: '#1a1a2e' }}>{c.leaveType}</span>
                          {viewType === 'calendar' && (
                            <span style={{ fontSize: 13, color: '#64748b' }}>{c.employeeName}</span>
                          )}
                          <span
                            style={{
                              fontSize: 12, fontWeight: 800, padding: '1px 8px', borderRadius: 99,
                              background: `${typeColor}15`, color: typeColor,
                            }}
                          >
                            {c.isHalfDay ? '½d' : `${c.days}d`}
                          </span>
                          {c.isHalfDay && c.halfDayPeriod && (
                            <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>
                              {c.halfDayPeriod === 'morning' ? 'AM' : 'PM'}
                            </span>
                          )}
                        </div>

                        {/* Date */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                          <Calendar className="h-3.5 w-3.5" style={{ color: '#94a3b8' }} />
                          <span style={{ fontSize: 13, color: '#475569', fontWeight: 500 }}>
                            {isSameDay
                              ? formatDate(c.startDate)
                              : `${formatDate(c.startDate)} → ${formatDate(c.endDate)}`}
                          </span>
                        </div>

                        {/* Reason */}
                        {c.reason && (
                          <p style={{ fontSize: 13, color: '#64748b', marginTop: 4, fontStyle: 'italic' }}>
                            {c.reason}
                          </p>
                        )}

                        {/* Rejection reason */}
                        {c.rejectionReason && (
                          <p style={{ fontSize: 13, color: '#ef4444', fontWeight: 600, marginTop: 4 }}>
                            ↳ {c.rejectionReason}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Right: status + case id */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                      <span
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 99,
                          background: st.bg, color: st.fg,
                        }}
                      >
                        <StatusIcon className="h-3.5 w-3.5" style={{ color: st.fg }} />
                        {st.label}
                      </span>
                      <span style={{ fontSize: 11, color: '#b0b0c0', fontFamily: 'monospace', letterSpacing: '0.04em' }}>
                        #{c.caseId.slice(-6).toUpperCase()}
                      </span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}
    </motion.div>
  )
}
