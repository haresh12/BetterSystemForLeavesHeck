'use client'

import { motion } from 'framer-motion'
import { CheckCircle2, XCircle, AlertTriangle, Calendar, Clock, UserCheck } from 'lucide-react'

interface CaseStatusCardProps {
  caseId: string
  leaveType: string
  startDate: string
  endDate: string
  days: number
  status: 'open' | 'pending_docs' | 'cancelled'
  docStatus?: string
  reason?: string
  reviewerName?: string
  message?: string
}

const TYPE_COLOR: Record<string, string> = {
  PTO: '#6366f1', Sick: '#f59e0b', Personal: '#10b981', Bereavement: '#8b5cf6',
  FMLA: '#ef4444', Maternity: '#ec4899', Paternity: '#3b82f6', CompOff: '#06b6d4',
  EmergencyLeave: '#e11d48', Unpaid: '#64748b', Intermittent: '#ea580c',
}

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function fmtDate(iso: string) {
  const d = new Date(iso + 'T00:00:00')
  return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`
}

function fmtFull(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

const STATE_CFG = {
  open: {
    bg: '#f0fdf4', border: '#86efac', iconBg: '#16a34a',
    Icon: CheckCircle2, title: 'Request Submitted', subtitle: 'Under review by HR',
    titleColor: '#14532d', subtitleColor: '#15803d',
  },
  pending_docs: {
    bg: '#fffbeb', border: '#fcd34d', iconBg: '#d97706',
    Icon: AlertTriangle, title: 'Request Submitted', subtitle: 'Upload your document to proceed',
    titleColor: '#78350f', subtitleColor: '#92400e',
  },
  cancelled: {
    bg: '#f8fafc', border: '#cbd5e1', iconBg: '#64748b',
    Icon: XCircle, title: 'Request Cancelled', subtitle: 'Balance has been restored',
    titleColor: '#1e293b', subtitleColor: '#64748b',
  },
}

export function CaseStatusCard({
  caseId, leaveType, startDate, endDate, days, status, docStatus, reason, reviewerName,
}: CaseStatusCardProps) {
  const color = TYPE_COLOR[leaveType] ?? '#6366f1'
  const isSameDay = startDate === endDate
  const cfg = STATE_CFG[status] ?? STATE_CFG.open
  const { Icon } = cfg

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="w-full rounded-2xl overflow-hidden"
      style={{ border: `2px solid ${cfg.border}`, boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}
    >
      {/* Header */}
      <div style={{ padding: '16px 20px', background: cfg.bg, borderBottom: `1px solid ${cfg.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              height: 40, width: 40, borderRadius: '50%', flexShrink: 0,
              background: cfg.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 4px 12px ${cfg.iconBg}40`,
            }}
          >
            <Icon className="h-5 w-5" style={{ color: '#fff' }} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{ fontSize: 15, fontWeight: 800, color: cfg.titleColor }}>{cfg.title}</p>
            <p style={{ fontSize: 12, fontWeight: 500, color: cfg.subtitleColor }}>{cfg.subtitle}</p>
          </div>
          <div style={{ textAlign: 'right' as const, flexShrink: 0 }}>
            <p style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '0.06em', fontWeight: 700 }}>Case</p>
            <p style={{ fontSize: 14, fontWeight: 800, fontFamily: 'monospace', color: '#1a1a2e' }}>#{caseId.slice(-6).toUpperCase()}</p>
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ background: '#fff', padding: '16px 20px' }}>
        {/* Type + days */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ height: 10, width: 10, borderRadius: '50%', background: color }} />
            <span style={{ fontSize: 15, fontWeight: 800, color: '#1a1a2e' }}>{leaveType}</span>
          </div>
          <div style={{ textAlign: 'right' as const }}>
            <span style={{ fontSize: 28, fontWeight: 900, color, lineHeight: 1 }}>{days}</span>
            <span style={{ fontSize: 14, fontWeight: 600, color, marginLeft: 2 }}>{days !== 1 ? 'days' : 'day'}</span>
          </div>
        </div>

        {/* Date */}
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 12px', borderRadius: 10, background: '#f8fafc',
            marginBottom: reason ? 10 : 0,
          }}
        >
          <Calendar className="h-3.5 w-3.5" style={{ color }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: '#1a1a2e' }}>
            {isSameDay ? fmtFull(startDate) : `${fmtDate(startDate)} → ${fmtDate(endDate)}`}
          </span>
        </div>

        {/* Reason */}
        {reason && (
          <p style={{ fontSize: 13, color: '#64748b', fontWeight: 500, marginTop: 4 }}>{reason}</p>
        )}

        {/* Reviewer */}
        {reviewerName && status === 'open' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, padding: '8px 12px', borderRadius: 10, background: '#f8fafc' }}>
            <UserCheck className="h-3.5 w-3.5 shrink-0" style={{ color: '#6366f1' }} />
            <span style={{ fontSize: 13, color: '#475569', fontWeight: 500 }}>
              Assigned to <span style={{ fontWeight: 700, color: '#1a1a2e' }}>{reviewerName}</span>
            </span>
          </div>
        )}

        {/* Status footer */}
        {status === 'open' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 12, color: '#64748b' }}>
            <Clock className="h-3.5 w-3.5" />
            <span style={{ fontWeight: 500 }}>Your request is in — you'll be notified on any updates</span>
          </div>
        )}
        {status === 'cancelled' && (
          <p style={{ fontSize: 12, color: '#64748b', textAlign: 'center' as const, marginTop: 12, fontWeight: 500 }}>
            Your leave balance has been fully restored
          </p>
        )}
      </div>
    </motion.div>
  )
}
