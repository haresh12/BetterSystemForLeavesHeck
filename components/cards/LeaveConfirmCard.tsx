'use client'

import { Calendar, FileText, CheckCircle2, AlertTriangle, ChevronRight, Briefcase, UserCheck } from 'lucide-react'
import { motion } from 'framer-motion'

interface LeaveConfirmCardProps {
  leaveType: string
  startDate: string
  endDate: string
  days: number
  deductedDays?: number
  reason: string
  certificateRequired: boolean
  currentBalance: number
  remainingAfter: number
  weekendDays?: number
  holidays?: Array<{ date: string; name: string }>
  reviewerName?: string
  isHalfDay?: boolean
  halfDayPeriod?: 'morning' | 'afternoon'
  message?: string
}

const TYPE_CONFIG: Record<string, { accent: string; soft: string; border: string; label: string }> = {
  PTO:           { accent: '#4f46e5', soft: '#eef2ff', border: '#c7d2fe', label: 'Paid Time Off' },
  Sick:          { accent: '#d97706', soft: '#fffbeb', border: '#fde68a', label: 'Sick Leave' },
  Personal:      { accent: '#059669', soft: '#ecfdf5', border: '#a7f3d0', label: 'Personal Leave' },
  Bereavement:   { accent: '#7c3aed', soft: '#f5f3ff', border: '#ddd6fe', label: 'Bereavement' },
  FMLA:          { accent: '#dc2626', soft: '#fef2f2', border: '#fecaca', label: 'FMLA' },
  Maternity:     { accent: '#db2777', soft: '#fdf2f8', border: '#fbcfe8', label: 'Maternity' },
  Paternity:     { accent: '#2563eb', soft: '#eff6ff', border: '#bfdbfe', label: 'Paternity' },
  CompOff:       { accent: '#0891b2', soft: '#ecfeff', border: '#a5f3fc', label: 'Comp Off' },
  EmergencyLeave:{ accent: '#e11d48', soft: '#fff1f2', border: '#fecdd3', label: 'Emergency' },
  Unpaid:        { accent: '#64748b', soft: '#f8fafc', border: '#e2e8f0', label: 'Unpaid' },
  Intermittent:  { accent: '#ea580c', soft: '#fff7ed', border: '#fed7aa', label: 'Intermittent' },
}

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function fmtDate(iso: string) {
  const d = new Date(iso + 'T00:00:00')
  return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`
}

function fmtFull(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

export function LeaveConfirmCard({
  leaveType, startDate, endDate, days, deductedDays, reason,
  certificateRequired, currentBalance, remainingAfter,
  weekendDays, holidays, reviewerName, isHalfDay, halfDayPeriod,
}: LeaveConfirmCardProps) {
  const actualDeducted = deductedDays ?? days
  const cfg = TYPE_CONFIG[leaveType] ?? TYPE_CONFIG.PTO
  const isSameDay = startDate === endDate
  const balanceDrop = currentBalance - remainingAfter
  const lowBalance = remainingAfter <= 2 && remainingAfter >= 0
  const pctBefore = currentBalance > 0 ? Math.min(100, Math.round((currentBalance / Math.max(currentBalance, 15)) * 100)) : 0
  const pctAfter  = currentBalance > 0 ? Math.min(100, Math.round((remainingAfter  / Math.max(currentBalance, 15)) * 100)) : 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="w-full rounded-2xl overflow-hidden shadow-lg"
      style={{ border: `1.5px solid ${cfg.border}` }}
    >
      {/* ── Hero header ── */}
      <div className="relative px-5 pt-5 pb-5" style={{ background: cfg.soft }}>
        {/* Top row */}
        <div className="flex items-center justify-between mb-4">
          <span
            className="text-xs font-bold px-3 py-1 rounded-full text-white"
            style={{ background: cfg.accent }}
          >
            {cfg.label}
          </span>
          <span className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground">
            CONFIRM LEAVE
          </span>
        </div>

        {/* Big day count */}
        <div className="flex items-end gap-3 mb-4">
          <span className="text-6xl font-black leading-none tabular-nums" style={{ color: cfg.accent }}>
            {isHalfDay ? '½' : actualDeducted}
          </span>
          <div className="pb-1">
            <p className="text-lg font-bold leading-none" style={{ color: cfg.accent }}>
              {isHalfDay ? 'day deducted' : `day${actualDeducted !== 1 ? 's' : ''} deducted`}
            </p>
            {isHalfDay && halfDayPeriod && (
              <p className="text-xs font-semibold mt-0.5" style={{ color: cfg.accent, opacity: 0.8 }}>
                {halfDayPeriod === 'morning' ? 'Morning — first half' : 'Afternoon — second half'}
              </p>
            )}
            {!isHalfDay && days !== actualDeducted && (
              <p className="text-xs text-muted-foreground mt-0.5">{days} calendar days total</p>
            )}
          </div>
        </div>

        {/* Weekend / holiday breakdown */}
        {((weekendDays && weekendDays > 0) || (holidays && holidays.length > 0)) && (
          <div
            className="rounded-xl px-4 py-2.5 mb-3 space-y-1"
            style={{ background: 'rgba(255,255,255,0.7)', border: `1px solid ${cfg.border}` }}
          >
            {weekendDays != null && weekendDays > 0 && (
              <div className="flex items-center gap-2 text-xs">
                <span style={{ color: cfg.accent, fontWeight: 700 }}>🗓</span>
                <span style={{ color: '#475569', fontWeight: 600 }}>{weekendDays} weekend day{weekendDays > 1 ? 's' : ''} excluded</span>
              </div>
            )}
            {holidays && holidays.map((h) => (
              <div key={h.date} className="flex items-center gap-2 text-xs">
                <span style={{ color: cfg.accent, fontWeight: 700 }}>🎉</span>
                <span style={{ color: '#475569', fontWeight: 600 }}>{h.name} ({h.date}) — company holiday, excluded</span>
              </div>
            ))}
          </div>
        )}

        {/* Date range */}
        <div
          className="rounded-xl px-4 py-3 flex items-center gap-3"
          style={{ background: 'rgba(255,255,255,0.7)', border: `1px solid ${cfg.border}` }}
        >
          <Calendar className="h-4 w-4 shrink-0" style={{ color: cfg.accent }} />
          {isSameDay ? (
            <div>
              <p className="text-sm font-bold">{fmtFull(startDate)}</p>
              <p className="text-xs text-muted-foreground">
                {isHalfDay
                  ? `Half day — ${halfDayPeriod === 'morning' ? 'morning' : 'afternoon'}`
                  : 'Single day'}
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-3 w-full">
              <div>
                <p className="text-sm font-bold">{fmtDate(startDate)}</p>
                <p className="text-xs text-muted-foreground">Start</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground mx-auto" />
              <div>
                <p className="text-sm font-bold">{fmtDate(endDate)}</p>
                <p className="text-xs text-muted-foreground">End</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ background: '#fff', padding: '16px 20px', borderTop: `1px solid ${cfg.border}` }}>
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 14 }}>

        {/* Reason */}
        {reason && (
          <div
            style={{ display: 'flex', alignItems: 'flex-start', gap: 12, borderRadius: 12, padding: '10px 14px', background: cfg.soft, border: `1px solid ${cfg.border}` }}
          >
            <Briefcase className="h-4 w-4 shrink-0 mt-0.5" style={{ color: cfg.accent }} />
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: '#94a3b8', marginBottom: 2 }}>Reason</p>
              <p style={{ fontSize: 14, fontWeight: 600, color: '#1a1a2e' }}>{reason}</p>
            </div>
          </div>
        )}

        {/* Balance impact */}
        {currentBalance > 0 && (
          <div className="rounded-xl px-3.5 py-3 bg-muted/40 border border-border/50">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Balance impact</p>
            <div className="space-y-1.5">
              {/* Before bar */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-12">Before</span>
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-muted-foreground/40" style={{ width: `${pctBefore}%` }} />
                </div>
                <span className="text-xs font-semibold tabular-nums w-8 text-right">{currentBalance}d</span>
              </div>
              {/* After bar */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-12">After</span>
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${pctAfter}%`,
                      background: lowBalance ? '#ef4444' : cfg.accent,
                    }}
                  />
                </div>
                <span
                  className="text-xs font-bold tabular-nums w-8 text-right"
                  style={{ color: lowBalance ? '#ef4444' : cfg.accent }}
                >
                  {remainingAfter}d
                </span>
              </div>
            </div>
            {lowBalance && (
              <div className="flex items-center gap-1.5 mt-2 text-xs text-red-500 font-semibold">
                <AlertTriangle className="h-3.5 w-3.5" />
                Low balance after this request
              </div>
            )}
          </div>
        )}

        {/* Reviewer */}
        {reviewerName && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderRadius: 12, padding: '10px 14px', background: cfg.soft, border: `1px solid ${cfg.border}` }}>
            <UserCheck className="h-4 w-4 shrink-0" style={{ color: cfg.accent }} />
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: '#94a3b8', marginBottom: 2 }}>Reviewing manager</p>
              <p style={{ fontSize: 14, fontWeight: 700, color: '#1a1a2e' }}>{reviewerName}</p>
            </div>
          </div>
        )}

        {/* Doc requirement */}
        {certificateRequired ? (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, borderRadius: 12, padding: '10px 14px', background: '#fffbeb', border: '1px solid #fcd34d' }}>
            <FileText className="h-4 w-4 shrink-0 mt-0.5" style={{ color: '#d97706' }} />
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#92400e' }}>Certificate required</p>
              <p style={{ fontSize: 12, fontWeight: 500, color: '#b45309', marginTop: 2 }}>Upload document before submission</p>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderRadius: 12, padding: '10px 14px', background: '#f0fdf4', border: '1px solid #86efac' }}>
            <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: '#16a34a' }} />
            <p style={{ fontSize: 13, fontWeight: 700, color: '#14532d' }}>No document needed</p>
          </div>
        )}
        </div>
      </div>

      {/* ── Action bar ── */}
      <div
        className="px-4 py-3.5 flex gap-2"
        style={{ background: cfg.soft, borderTop: `1px solid ${cfg.border}` }}
      >
        {/* YES button-style */}
        <div
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl cursor-default"
          style={{ background: cfg.accent }}
        >
          <CheckCircle2 className="h-3.5 w-3.5 text-white" />
          <span className="text-xs font-bold text-white tracking-wide">Type YES</span>
        </div>
        {/* EDIT */}
        <div
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl cursor-default border"
          style={{ background: 'var(--background)', borderColor: cfg.border, color: cfg.accent }}
        >
          <span className="text-xs font-bold tracking-wide">Type EDIT</span>
        </div>
        {/* CANCEL */}
        <div className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl cursor-default border border-border bg-background">
          <span className="text-xs font-semibold text-muted-foreground tracking-wide">Type CANCEL</span>
        </div>
      </div>
    </motion.div>
  )
}
