'use client'

import { motion } from 'framer-motion'
import type { CaseDoc } from '@/lib/firebase/types'
import { CheckCircle2, AlertTriangle, XCircle, Loader2 } from 'lucide-react'

interface CaseTableAdminProps {
  cases: (CaseDoc & { caseId: string })[]
  onCaseClick: (c: CaseDoc & { caseId: string }) => void
  onApprove: (caseId: string, employeeName: string) => void
  onFilterByType: (message: string) => void
  aiVerdicts: Record<string, 'safe' | 'review' | 'flag'>
  reviewingCaseIds: Set<string>  // cases currently being reviewed by AI
}

const TYPE_COLOR: Record<string, string> = {
  PTO: '#6366f1', Sick: '#f59e0b', Personal: '#10b981', Bereavement: '#8b5cf6',
  FMLA: '#ef4444', Maternity: '#ec4899', Paternity: '#3b82f6', Intermittent: '#f97316',
  Unpaid: '#94a3b8', CompOff: '#06b6d4', EmergencyLeave: '#f43f5e',
}

const VERDICT_CFG = {
  safe:   { icon: CheckCircle2,  color: '#16a34a', bg: '#f0fdf4', border: '#86efac', label: 'Safe to approve', strip: '#22c55e' },
  review: { icon: AlertTriangle, color: '#f59e0b', bg: '#fffbeb', border: '#fcd34d', label: 'Needs review',    strip: '#f59e0b' },
  flag:   { icon: XCircle,       color: '#ef4444', bg: '#fef2f2', border: '#fecaca', label: 'Flagged',         strip: '#ef4444' },
}

function fmtDate(iso: string): string {
  if (!iso) return ''
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso + 'T00:00:00').getTime() - Date.now()) / 86400000)
}

export function CaseTableAdmin({ cases, onCaseClick, onApprove, onFilterByType, aiVerdicts, reviewingCaseIds }: CaseTableAdminProps) {
  return (
    <div style={{ maxHeight: 'calc(100vh - 300px)', overflowY: 'auto' }}>
      {cases.length === 0 ? (
        <div style={{ padding: 48, textAlign: 'center' }}>
          <p style={{ fontSize: 15, color: '#94a3b8', fontWeight: 600 }}>No cases in this view</p>
        </div>
      ) : (
        cases.map((c, i) => {
          const typeColor = TYPE_COLOR[c.leaveType ?? ''] ?? '#6366f1'
          const verdict = aiVerdicts[c.caseId]
          const isReviewing = reviewingCaseIds.has(c.caseId)
          const vCfg = verdict ? VERDICT_CFG[verdict] : null
          const urgent = daysUntil(c.startDate) <= 1
          const needsDoc = c.docStatus === 'missing'
          const stripColor = vCfg ? vCfg.strip : (c.status === 'pending_docs' ? '#f59e0b' : '#6366f1')

          return (
            <motion.div
              key={c.caseId}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: Math.min(i * 0.01, 0.3) }}
              onClick={() => onCaseClick(c)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '11px 16px',
                borderBottom: '1px solid #f5f5f8',
                cursor: 'pointer',
                borderLeft: `4px solid ${stripColor}`,
                background: vCfg ? `${vCfg.bg}` : 'transparent',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => { if (!vCfg) (e.currentTarget as HTMLElement).style.background = '#fafaff' }}
              onMouseLeave={(e) => { if (!vCfg) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >
              {/* Type badge — CLICKABLE to filter */}
              <div
                onClick={(e) => { e.stopPropagation(); onFilterByType(`Show all ${c.leaveType} cases`) }}
                style={{
                  height: 36, width: 36, borderRadius: 9, flexShrink: 0,
                  background: `${typeColor}10`, border: `1.5px solid ${typeColor}20`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 900, color: typeColor,
                  cursor: 'pointer', transition: 'all 0.1s',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = `${typeColor}25` }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = `${typeColor}10` }}
                title={`Filter to ${c.leaveType}`}
              >
                {(c.leaveType ?? '??').slice(0, 2)}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: '#1a1a2e' }}>{c.employeeName}</span>
                  <span
                    style={{ fontSize: 11, fontWeight: 700, color: typeColor, cursor: 'pointer' }}
                    onClick={(e) => { e.stopPropagation(); onFilterByType(`Show all ${c.leaveType} cases`) }}
                  >
                    {c.leaveType}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#1a1a2e' }}>{c.isHalfDay ? '½d' : `${c.days}d`}</span>
                  {c.isHalfDay && c.halfDayPeriod && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: '#f0f4ff', color: '#6366f1' }}>
                      {c.halfDayPeriod === 'morning' ? 'AM' : 'PM'}
                    </span>
                  )}
                  {urgent && <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 4, background: '#fef2f2', color: '#dc2626' }}>URGENT</span>}
                  {needsDoc && <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 4, background: '#fef9c3', color: '#a16207' }}>DOCS</span>}
                  {c.priority === 'high' && <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 4, background: '#fee2e2', color: '#dc2626' }}>HIGH</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                  <span style={{ fontSize: 12, color: '#64748b' }}>{fmtDate(c.startDate)} - {fmtDate(c.endDate)}</span>
                  <span
                    style={{ fontSize: 11, color: '#94a3b8', cursor: 'pointer' }}
                    onClick={(e) => { e.stopPropagation(); onFilterByType(`Show cases from ${c.employeeDepartment} department`) }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#4f46e5' }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = '#94a3b8' }}
                  >
                    {c.employeeDepartment}
                  </span>
                  <span style={{ fontSize: 11, color: '#c0c0d0', fontStyle: 'italic' }}>{c.reason?.slice(0, 28)}{(c.reason?.length ?? 0) > 28 ? '...' : ''}</span>
                </div>
              </div>

              {/* AI Verdict */}
              <div style={{ width: 120, flexShrink: 0, textAlign: 'center' }}>
                {isReviewing ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: '#6366f1' }} />
                    <span style={{ fontSize: 11, color: '#6366f1', fontWeight: 600 }}>Analyzing...</span>
                  </div>
                ) : vCfg ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                      padding: '4px 8px', borderRadius: 6,
                      background: vCfg.bg, border: `1px solid ${vCfg.border}`,
                    }}
                  >
                    <vCfg.icon className="h-3 w-3" style={{ color: vCfg.color }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: vCfg.color }}>{vCfg.label}</span>
                  </motion.div>
                ) : null}
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                {c.status === 'open' && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onApprove(c.caseId, c.employeeName) }}
                    style={{
                      fontSize: 11, fontWeight: 700, padding: '6px 10px', borderRadius: 7,
                      background: '#16a34a', color: '#fff', border: 'none', cursor: 'pointer',
                      boxShadow: '0 2px 6px rgba(22,163,106,0.2)',
                    }}
                  >
                    Approve
                  </button>
                )}
              </div>
            </motion.div>
          )
        })
      )}
    </div>
  )
}
