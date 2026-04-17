'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Calendar, FileText, CheckCircle2, XCircle, ExternalLink,
  User, Building, ShieldCheck, ShieldAlert, ShieldX,
  AlertTriangle, TrendingUp, Clock, Sparkles, Users, Loader2,
} from 'lucide-react'
import type { CaseDoc } from '@/lib/firebase/types'

interface CaseSlideOverProps {
  caseData: (CaseDoc & { caseId: string }) | null
  onClose: () => void
  onApprove: (caseId: string) => void
  onReject: (caseId: string, reason: string) => void
}

const TYPE_COLOR: Record<string, string> = {
  PTO: '#6366f1', Sick: '#f59e0b', Personal: '#10b981', Bereavement: '#8b5cf6',
  FMLA: '#ef4444', Maternity: '#ec4899', Paternity: '#3b82f6', Intermittent: '#f97316',
}

const FACTOR_ICONS: Record<string, typeof ShieldCheck> = {
  doc: FileText, team: Users, history: TrendingUp, pattern: AlertTriangle,
  tenure: User, compliance: ShieldCheck, holiday: Calendar,
}

function formatDate(iso: string): string {
  if (!iso) return ''
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

interface Assessment {
  overallRisk: string
  riskScore: number
  recommendation: { action: string; text: string; color: string }
  factors: Array<{ factor: string; score: string; detail: string; icon: string }>
  teamOverlaps: Array<{ name: string; type: string; dates: string }>
  coveragePct: number
  deptSize: number
  tenure: number
  document: { fileName: string; fileUrl: string; confidence: number; doctorName: string; hospital: string } | null
  employeeHistory: { total: number; approved: number; rejected: number; cancelled: number }
}

export function CaseSlideOver({ caseData, onClose, onApprove, onReject }: CaseSlideOverProps) {
  const [rejectReason, setRejectReason] = useState('')
  const [showRejectInput, setShowRejectInput] = useState(false)
  const [assessment, setAssessment] = useState<Assessment | null>(null)
  const [assessing, setAssessing] = useState(false)

  useEffect(() => {
    if (!caseData) return
    setShowRejectInput(false)
    setRejectReason('')
    setAssessment(null)

    // Auto-trigger AI assessment
    if (caseData.status === 'open' || caseData.status === 'pending_docs') {
      setAssessing(true)
      fetch('/api/admin/assess-case', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseId: caseData.caseId }),
      })
        .then(r => r.json())
        .then(data => { setAssessment(data); setAssessing(false) })
        .catch(() => setAssessing(false))
    }
  }, [caseData?.caseId]) // eslint-disable-line

  if (!caseData) return null

  const c = caseData
  const typeColor = TYPE_COLOR[c.leaveType ?? ''] ?? '#6366f1'
  const riskColors: Record<string, string> = { low: '#16a34a', medium: '#f59e0b', high: '#ef4444' }

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', zIndex: 50 }}
      />

      <motion.div
        initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, width: 520, zIndex: 51,
          background: '#fff', boxShadow: '-8px 0 40px rgba(0,0,0,0.12)',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #ebebf0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ height: 36, width: 36, borderRadius: 10, background: `${typeColor}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 900, color: typeColor }}>{c.leaveType.slice(0, 2)}</span>
            </div>
            <div>
              <p style={{ fontSize: 15, fontWeight: 800, color: '#1a1a2e' }}>{c.employeeName}</p>
              <p style={{ fontSize: 12, color: '#64748b' }}>#{c.caseId.slice(-6).toUpperCase()} · {c.leaveType} · {c.isHalfDay ? '½d' : `${c.days}d`}{c.isHalfDay && c.halfDayPeriod ? ` (${c.halfDayPeriod === 'morning' ? 'AM' : 'PM'})` : ''}</p>
            </div>
          </div>
          <button onClick={onClose} style={{ height: 32, width: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', background: '#f1f5f9', border: 'none', cursor: 'pointer' }}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>

          {/* AI Assessment Section */}
          {(assessing || assessment) && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                <Sparkles className="h-4 w-4" style={{ color: '#6366f1' }} />
                <span style={{ fontSize: 12, fontWeight: 800, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.06em' }}>AI Risk Assessment</span>
                {assessing && <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: '#6366f1' }} />}
              </div>

              {assessing && !assessment && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  style={{ padding: '20px', borderRadius: 14, background: '#fafaff', border: '1px solid #e8e8f0', textAlign: 'center' }}
                >
                  <Loader2 className="h-6 w-6 animate-spin mx-auto" style={{ color: '#6366f1', marginBottom: 8 }} />
                  <p style={{ fontSize: 13, color: '#6366f1', fontWeight: 600 }}>Analyzing case...</p>
                  <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Checking documents, team coverage, patterns, compliance</p>
                </motion.div>
              )}

              {assessment && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                  {/* Risk Score + Recommendation */}
                  <div style={{
                    padding: '16px', borderRadius: 14,
                    background: assessment.overallRisk === 'high' ? '#fef2f2' : assessment.overallRisk === 'medium' ? '#fffbeb' : '#f0fdf4',
                    border: `1.5px solid ${riskColors[assessment.overallRisk as keyof typeof riskColors]}30`,
                    marginBottom: 12,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {assessment.overallRisk === 'low' ? <ShieldCheck className="h-5 w-5" style={{ color: '#16a34a' }} />
                          : assessment.overallRisk === 'medium' ? <ShieldAlert className="h-5 w-5" style={{ color: '#f59e0b' }} />
                          : <ShieldX className="h-5 w-5" style={{ color: '#ef4444' }} />}
                        <span style={{ fontSize: 15, fontWeight: 800, color: assessment.recommendation.color }}>{assessment.recommendation.action}</span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: 24, fontWeight: 900, color: riskColors[assessment.overallRisk as keyof typeof riskColors] }}>{assessment.riskScore}</span>
                        <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 2 }}>/100</span>
                      </div>
                    </div>
                    <p style={{ fontSize: 13, color: '#475569', fontWeight: 500 }}>{assessment.recommendation.text}</p>

                    {/* Score bar */}
                    <div style={{ marginTop: 10, height: 6, borderRadius: 99, background: '#e2e8f0', overflow: 'hidden' }}>
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${assessment.riskScore}%` }}
                        transition={{ delay: 0.3, duration: 0.8, ease: [0.34, 1.3, 0.64, 1] }}
                        style={{ height: '100%', borderRadius: 99, background: riskColors[assessment.overallRisk as keyof typeof riskColors] }}
                      />
                    </div>
                  </div>

                  {/* Risk Factors */}
                  <div style={{ marginBottom: 12 }}>
                    {assessment.factors.map((f, i) => {
                      const Icon = FACTOR_ICONS[f.icon] ?? ShieldCheck
                      const fColor = riskColors[f.score as keyof typeof riskColors]
                      return (
                        <motion.div
                          key={f.factor}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.1 + i * 0.06, duration: 0.2 }}
                          style={{
                            display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 10px',
                            borderRadius: 10, marginBottom: 4,
                            background: f.score === 'high' ? '#fef2f2' : 'transparent',
                          }}
                        >
                          <div style={{ height: 24, width: 24, borderRadius: 6, background: `${fColor}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                            <Icon className="h-3 w-3" style={{ color: fColor }} />
                          </div>
                          <div style={{ flex: 1 }}>
                            <p style={{ fontSize: 12, fontWeight: 700, color: '#1a1a2e' }}>{f.factor}</p>
                            <p style={{ fontSize: 12, color: '#64748b', marginTop: 1 }}>{f.detail}</p>
                          </div>
                          <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: `${fColor}15`, color: fColor, flexShrink: 0, marginTop: 2 }}>
                            {f.score.toUpperCase()}
                          </span>
                        </motion.div>
                      )
                    })}
                  </div>

                  {/* Team overlaps */}
                  {assessment.teamOverlaps.length > 0 && (
                    <div style={{ padding: '10px 12px', borderRadius: 10, background: '#fff7ed', border: '1px solid #fed7aa', marginBottom: 12 }}>
                      <p style={{ fontSize: 11, fontWeight: 800, color: '#c2410c', marginBottom: 6 }}>TEAM CONFLICTS ({assessment.teamOverlaps.length})</p>
                      {assessment.teamOverlaps.map((t, i) => (
                        <p key={i} style={{ fontSize: 12, color: '#9a3412', marginBottom: 2 }}>
                          {t.name} — {t.type} ({t.dates})
                        </p>
                      ))}
                    </div>
                  )}

                  {/* Employee history */}
                  {assessment.employeeHistory && (
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                      {[
                        { label: 'Total', value: assessment.employeeHistory.total, color: '#6366f1' },
                        { label: 'Approved', value: assessment.employeeHistory.approved, color: '#16a34a' },
                        { label: 'Rejected', value: assessment.employeeHistory.rejected, color: '#ef4444' },
                      ].map(s => (
                        <div key={s.label} style={{ flex: 1, padding: '8px', borderRadius: 8, background: '#f8f9fc', border: '1px solid #ebebf0', textAlign: 'center' }}>
                          <p style={{ fontSize: 18, fontWeight: 900, color: s.color }}>{s.value}</p>
                          <p style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>{s.label}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Document */}
                  {assessment.document && (
                    <div style={{ padding: '10px 12px', borderRadius: 10, background: '#f0fdf4', border: '1px solid #86efac', marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <FileText className="h-4 w-4" style={{ color: '#16a34a' }} />
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#14532d' }}>{assessment.document.fileName}</span>
                          {assessment.document.confidence && (
                            <span style={{ fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 99, background: '#dcfce7', color: '#16a34a' }}>
                              {Math.round(assessment.document.confidence * 100)}%
                            </span>
                          )}
                        </div>
                        {assessment.document.fileUrl && (
                          <a href={assessment.document.fileUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, fontWeight: 700, color: '#6366f1', textDecoration: 'none' }}>
                            <ExternalLink className="h-3 w-3" /> View PDF
                          </a>
                        )}
                      </div>
                      {(assessment.document.doctorName || assessment.document.hospital) && (
                        <p style={{ fontSize: 12, color: '#15803d', marginTop: 4 }}>
                          {[assessment.document.doctorName, assessment.document.hospital].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>
                  )}
                </motion.div>
              )}
            </div>
          )}

          {/* Leave details grid */}
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Leave Details</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { label: 'TYPE', value: c.leaveType, color: typeColor },
                { label: 'DAYS', value: c.isHalfDay ? '½ day' + (c.halfDayPeriod ? ` (${c.halfDayPeriod})` : '') : `${c.days} day${c.days > 1 ? 's' : ''}`, color: '#1a1a2e' },
                { label: 'START', value: formatDate(c.startDate), color: '#1a1a2e' },
                { label: 'END', value: formatDate(c.endDate), color: '#1a1a2e' },
              ].map(item => (
                <div key={item.label} style={{ padding: '8px 12px', borderRadius: 10, background: '#f8f9fc', border: '1px solid #ebebf0' }}>
                  <p style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>{item.label}</p>
                  <p style={{ fontSize: 13, fontWeight: 700, color: item.color, marginTop: 2 }}>{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Reason */}
          {c.reason && (
            <div style={{ marginBottom: 16, padding: '10px 12px', borderRadius: 10, background: '#f8f9fc', border: '1px solid #ebebf0' }}>
              <p style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>REASON</p>
              <p style={{ fontSize: 14, color: '#1a1a2e', fontWeight: 500, marginTop: 3 }}>{c.reason}</p>
            </div>
          )}

          {/* Notes */}
          {c.notes && c.notes.length > 0 && (
            <div>
              <p style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Activity</p>
              {c.notes.map((note, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: i < c.notes.length - 1 ? '1px solid #f5f5f8' : 'none' }}>
                  <div style={{ height: 20, width: 20, borderRadius: 5, background: note.actorRole === 'admin' ? '#eef2ff' : '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <User className="h-2.5 w-2.5" style={{ color: note.actorRole === 'admin' ? '#6366f1' : '#10b981' }} />
                  </div>
                  <div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#1a1a2e' }}>{note.actorName}</span>
                    <span style={{ fontSize: 10, color: '#c0c0d0', marginLeft: 6 }}>{note.timestamp ? new Date(note.timestamp).toLocaleDateString() : ''}</span>
                    <p style={{ fontSize: 12, color: '#64748b', marginTop: 1 }}>{note.text}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Action bar */}
        {(c.status === 'open' || c.status === 'pending_docs') && (
          <div style={{ padding: '14px 20px', borderTop: '1px solid #ebebf0', background: '#fafafc' }}>
            {showRejectInput ? (
              <div>
                <input
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Enter rejection reason..."
                  autoFocus
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e8e8f0', fontSize: 14, color: '#1a1a2e', marginBottom: 8, outline: 'none' }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && rejectReason.trim()) { onReject(c.caseId, rejectReason); onClose() } }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { if (rejectReason.trim()) { onReject(c.caseId, rejectReason); onClose() } }} disabled={!rejectReason.trim()} style={{ flex: 1, padding: '10px', borderRadius: 10, fontSize: 13, fontWeight: 700, background: rejectReason.trim() ? '#ef4444' : '#f1f5f9', color: rejectReason.trim() ? '#fff' : '#94a3b8', border: 'none', cursor: rejectReason.trim() ? 'pointer' : 'not-allowed' }}>Confirm Reject</button>
                  <button onClick={() => setShowRejectInput(false)} style={{ padding: '10px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700, background: '#f1f5f9', color: '#64748b', border: 'none', cursor: 'pointer' }}>Cancel</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => { onApprove(c.caseId); onClose() }}
                  style={{ flex: 1, padding: '12px', borderRadius: 10, fontSize: 14, fontWeight: 800, background: '#16a34a', color: '#fff', border: 'none', cursor: 'pointer', boxShadow: '0 2px 8px rgba(22,163,106,0.3)' }}
                >
                  Approve
                </button>
                <button
                  onClick={() => setShowRejectInput(true)}
                  style={{ flex: 1, padding: '12px', borderRadius: 10, fontSize: 14, fontWeight: 800, background: '#fee2e2', color: '#dc2626', border: 'none', cursor: 'pointer' }}
                >
                  Reject
                </button>
              </div>
            )}
          </div>
        )}
      </motion.div>
    </>
  )
}
