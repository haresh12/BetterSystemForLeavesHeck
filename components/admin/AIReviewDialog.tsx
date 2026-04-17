'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Bot, ShieldCheck, CheckCircle2, AlertTriangle, XCircle, Sparkles } from 'lucide-react'

interface CaseReview {
  caseId: string
  employeeName: string
  department: string
  leaveType: string
  days: number
  isHalfDay?: boolean
  halfDayPeriod?: string
  startDate: string
  endDate: string
  reason: string
  agent1Findings: string[]
  agent1Verdict: 'approve' | 'review' | 'flag'
  agent1Reason: string
  agent2Findings: string[]
  agent2Verdict: 'approve' | 'review' | 'flag'
  agent2Reason: string
  finalVerdict: 'approve' | 'review' | 'flag'
  riskScore: number
  hasDocIssue: boolean
  hasTeamOverlap: boolean
  hasPatternFlag: boolean
}

interface AIReviewDialogProps {
  open: boolean
  onClose: () => void
  caseIds: string[]
  tabName: string
  onAction: (action: string) => void  // sends ONE message to chat
}

const VERDICT = {
  approve: { icon: CheckCircle2, color: '#16a34a', bg: '#f0fdf4', border: '#86efac', label: 'APPROVE' },
  review:  { icon: AlertTriangle, color: '#f59e0b', bg: '#fffbeb', border: '#fcd34d', label: 'NEEDS REVIEW' },
  flag:    { icon: XCircle, color: '#ef4444', bg: '#fef2f2', border: '#fecaca', label: 'FLAGGED' },
}

const TYPE_COLOR: Record<string, string> = {
  PTO: '#6366f1', Sick: '#f59e0b', Personal: '#10b981', Bereavement: '#8b5cf6',
  FMLA: '#ef4444', Maternity: '#ec4899', Paternity: '#3b82f6',
}

function fmtDate(iso: string) {
  if (!iso) return ''
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function AIReviewDialog({ open, onClose, caseIds, tabName, onAction }: AIReviewDialogProps) {
  const [reviews, setReviews] = useState<CaseReview[]>([])
  const [loading, setLoading] = useState(false)
  const [visibleCount, setVisibleCount] = useState(0)
  const [agent1Visible, setAgent1Visible] = useState<Set<number>>(new Set())
  const [agent2Visible, setAgent2Visible] = useState<Set<number>>(new Set())
  const [verdictVisible, setVerdictVisible] = useState<Set<number>>(new Set())
  const [actedOn, setActedOn] = useState<Record<string, 'approved' | 'rejected'>>({})
  const [rejectInputId, setRejectInputId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  useEffect(() => {
    if (!open || caseIds.length === 0) return
    setLoading(true)
    setReviews([])
    setVisibleCount(0)
    setAgent1Visible(new Set())
    setAgent2Visible(new Set())
    setVerdictVisible(new Set())
    setActedOn({})
    setRejectInputId(null)
    setRejectReason('')

    fetch('/api/admin/review-cases', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caseIds }),
    })
      .then(r => r.json())
      .then(data => {
        setReviews(data.reviews ?? [])
        setLoading(false)
        const total = data.reviews?.length ?? 0
        for (let i = 0; i < total; i++) {
          setTimeout(() => setVisibleCount(i + 1), i * 1800)
          setTimeout(() => setAgent1Visible(prev => new Set([...prev, i])), i * 1800 + 400)
          setTimeout(() => setAgent2Visible(prev => new Set([...prev, i])), i * 1800 + 900)
          setTimeout(() => setVerdictVisible(prev => new Set([...prev, i])), i * 1800 + 1400)
        }
      })
      .catch(() => setLoading(false))
  }, [open, caseIds])

  if (!open) return null

  const allRevealed = verdictVisible.size >= reviews.length && reviews.length > 0
  const progress = reviews.length > 0 ? Math.round((verdictVisible.size / reviews.length) * 100) : 0
  const approvedIds = reviews.filter(r => r.finalVerdict === 'approve' && !actedOn[r.caseId]).map(r => r.caseId)
  const summary = {
    safe: reviews.filter(r => r.finalVerdict === 'approve').length,
    review: reviews.filter(r => r.finalVerdict === 'review').length,
    flagged: reviews.filter(r => r.finalVerdict === 'flag').length,
    acted: Object.keys(actedOn).length,
  }

  function handleApprove(caseId: string) {
    setActedOn(prev => ({ ...prev, [caseId]: 'approved' }))
    onAction(`Approve case ${caseId}`)
  }

  function handleReject(caseId: string) {
    if (!rejectReason.trim()) return
    setActedOn(prev => ({ ...prev, [caseId]: 'rejected' }))
    onAction(`Reject case ${caseId}, reason: ${rejectReason}`)
    setRejectInputId(null)
    setRejectReason('')
  }

  function handleApproveAllSafe() {
    approvedIds.forEach(id => { setActedOn(prev => ({ ...prev, [id]: 'approved' })) })
    // ONE grouped message instead of N separate ones
    onAction(`Bulk approve these ${approvedIds.length} safe cases: ${approvedIds.join(', ')}`)
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }} />

      <motion.div
        initial={{ x: -40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -40, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        style={{ position: 'relative', zIndex: 1, width: '65%', maxWidth: 900, height: '100%', background: '#fff', boxShadow: '8px 0 40px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column' }}
      >
        {/* Header */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #e8e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'linear-gradient(135deg, rgba(99,102,241,0.04), rgba(139,92,246,0.02))' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ height: 34, width: 34, borderRadius: 10, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 10px rgba(99,102,241,0.3)' }}>
              <Sparkles className="h-4 w-4" style={{ color: '#fff' }} />
            </div>
            <div>
              <p style={{ fontSize: 15, fontWeight: 900, color: '#1a1a2e' }}>AI Review — {tabName}</p>
              <p style={{ fontSize: 12, color: '#64748b' }}>{loading ? 'Analyzing...' : `${caseIds.length} cases · ${summary.acted} acted on`}</p>
            </div>
          </div>
          <button onClick={onClose} style={{ height: 30, width: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', background: '#f1f5f9', border: 'none', cursor: 'pointer' }}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Progress */}
        <div style={{ height: 4, background: '#f0f0f5' }}>
          <motion.div animate={{ width: `${progress}%` }} transition={{ duration: 0.3 }} style={{ height: '100%', background: 'linear-gradient(90deg, #6366f1, #8b5cf6)', borderRadius: 2 }} />
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }} style={{ display: 'inline-block', marginBottom: 10 }}>
                <Sparkles className="h-7 w-7" style={{ color: '#6366f1' }} />
              </motion.div>
              <p style={{ fontSize: 14, fontWeight: 700, color: '#1a1a2e' }}>Two AI agents analyzing {caseIds.length} cases...</p>
            </div>
          )}

          {reviews.slice(0, visibleCount).map((review, i) => {
            const v = VERDICT[review.finalVerdict]
            const tc = TYPE_COLOR[review.leaveType] ?? '#6366f1'
            const showA1 = agent1Visible.has(i)
            const showA2 = agent2Visible.has(i)
            const showVerdict = verdictVisible.has(i)
            const action = actedOn[review.caseId]
            const isActed = !!action

            return (
              <motion.div
                key={review.caseId}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: isActed ? 0.6 : 1, y: 0 }}
                transition={{ duration: 0.3 }}
                style={{
                  marginBottom: 14, borderRadius: 12, overflow: 'hidden',
                  border: isActed ? `2px solid ${action === 'approved' ? '#86efac' : '#fecaca'}` : showVerdict ? `2px solid ${v.border}` : '1px solid #e8e8f0',
                  background: isActed ? (action === 'approved' ? '#f0fdf4' : '#fef2f2') : showVerdict ? v.bg : '#fff',
                  transition: 'all 0.3s',
                }}
              >
                {/* Case header */}
                <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f0f0f5' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ height: 28, width: 28, borderRadius: 7, background: `${tc}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 900, color: tc }}>{review.leaveType.slice(0, 2)}</div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 14, fontWeight: 800, color: '#1a1a2e', textDecoration: action === 'rejected' ? 'line-through' : 'none' }}>{review.employeeName}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: tc }}>{review.leaveType}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>{review.isHalfDay ? '½d' : `${review.days}d`}</span>
                        {isActed && <span style={{ fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 4, background: action === 'approved' ? '#dcfce7' : '#fee2e2', color: action === 'approved' ? '#16a34a' : '#dc2626' }}>{action.toUpperCase()}</span>}
                      </div>
                      <p style={{ fontSize: 11, color: '#64748b' }}>{fmtDate(review.startDate)} - {fmtDate(review.endDate)} · {review.department} · {review.reason}</p>
                    </div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#b0b0c0' }}>Case {i + 1}/{reviews.length}</span>
                </div>

                {/* Agent 1 */}
                <AnimatePresence>
                  {showA1 && !isActed && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} transition={{ duration: 0.25 }} style={{ padding: '10px 16px', borderBottom: '1px solid #f0f0f5' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                        <Bot className="h-3.5 w-3.5" style={{ color: '#6366f1' }} />
                        <span style={{ fontSize: 11, fontWeight: 800, color: '#6366f1' }}>Agent 1 — Reviewer</span>
                      </div>
                      {review.agent1Findings.map((f, fi) => (
                        <motion.p key={fi} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: fi * 0.1 }}
                          style={{ fontSize: 12, color: '#475569', marginBottom: 2, paddingLeft: 8, borderLeft: '2px solid #e0e0ea' }}>{f}</motion.p>
                      ))}
                      <p style={{ fontSize: 11, fontWeight: 700, color: VERDICT[review.agent1Verdict].color, marginTop: 4 }}>→ {review.agent1Reason}</p>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Agent 2 */}
                <AnimatePresence>
                  {showA2 && !isActed && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} transition={{ duration: 0.25 }} style={{ padding: '10px 16px', borderBottom: '1px solid #f0f0f5' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                        <ShieldCheck className="h-3.5 w-3.5" style={{ color: '#10b981' }} />
                        <span style={{ fontSize: 11, fontWeight: 800, color: '#10b981' }}>Agent 2 — Validator</span>
                      </div>
                      {review.agent2Findings.map((f, fi) => (
                        <motion.p key={fi} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: fi * 0.1 }}
                          style={{ fontSize: 12, color: '#475569', marginBottom: 2, paddingLeft: 8, borderLeft: '2px solid #d1fae5' }}>{f}</motion.p>
                      ))}
                      <p style={{ fontSize: 11, fontWeight: 700, color: VERDICT[review.agent2Verdict].color, marginTop: 4 }}>→ {review.agent2Reason}</p>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Verdict + Actions */}
                <AnimatePresence>
                  {showVerdict && !isActed && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}
                      style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: `${v.color}06` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <v.icon className="h-3.5 w-3.5" style={{ color: v.color }} />
                        <span style={{ fontSize: 12, fontWeight: 800, color: v.color }}>{v.label}</span>
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>Score: {review.riskScore}/100</span>
                        {review.hasDocIssue && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: '#fef9c3', color: '#a16207' }}>DOC</span>}
                        {review.hasTeamOverlap && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: '#fee2e2', color: '#dc2626' }}>OVERLAP</span>}
                        {review.hasPatternFlag && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: '#fef2f2', color: '#ef4444' }}>PATTERN</span>}
                      </div>

                      {/* Per-case action buttons */}
                      {rejectInputId === review.caseId ? (
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <input value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Rejection reason..."
                            autoFocus onKeyDown={e => { if (e.key === 'Enter') handleReject(review.caseId) }}
                            style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid #fecaca', width: 180, outline: 'none' }} />
                          <button onClick={() => handleReject(review.caseId)} disabled={!rejectReason.trim()}
                            style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6, background: rejectReason.trim() ? '#ef4444' : '#f1f5f9', color: rejectReason.trim() ? '#fff' : '#94a3b8', border: 'none', cursor: rejectReason.trim() ? 'pointer' : 'not-allowed' }}>Reject</button>
                          <button onClick={() => { setRejectInputId(null); setRejectReason('') }}
                            style={{ fontSize: 11, fontWeight: 700, padding: '4px 8px', borderRadius: 6, background: '#f1f5f9', color: '#64748b', border: 'none', cursor: 'pointer' }}>Cancel</button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={() => handleApprove(review.caseId)}
                            style={{ fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 6, background: '#16a34a', color: '#fff', border: 'none', cursor: 'pointer' }}>Approve</button>
                          <button onClick={() => { setRejectInputId(review.caseId); setRejectReason(review.agent1Reason) }}
                            style={{ fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 6, background: '#fee2e2', color: '#dc2626', border: 'none', cursor: 'pointer' }}>Reject</button>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </div>

        {/* Footer */}
        {allRevealed && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            style={{ padding: '12px 20px', borderTop: '1px solid #e8e8f0', background: '#fafafc' }}>
            {/* Summary */}
            <div style={{ display: 'flex', gap: 10, fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
              <span style={{ color: '#16a34a' }}>✅ {summary.safe} safe to approve</span>
              <span style={{ color: '#f59e0b' }}>⚠️ {summary.review} need review</span>
              <span style={{ color: '#ef4444' }}>❌ {summary.flagged} flagged</span>
              {summary.acted > 0 && <span style={{ color: '#6366f1' }}>· {summary.acted} handled</span>}
            </div>
            {/* Bulk action buttons */}
            <div style={{ display: 'flex', gap: 8 }}>
              {approvedIds.length > 0 && (
                <button onClick={handleApproveAllSafe}
                  style={{ fontSize: 13, fontWeight: 800, padding: '10px 20px', borderRadius: 10, background: '#16a34a', color: '#fff', border: 'none', cursor: 'pointer', boxShadow: '0 3px 10px rgba(22,163,106,0.3)', flex: 1 }}>
                  ✅ Approve {approvedIds.length} Safe Cases
                </button>
              )}
              {reviews.filter(r => r.finalVerdict === 'flag' && !actedOn[r.caseId]).length > 0 && (
                <button onClick={() => {
                  const flagged = reviews.filter(r => r.finalVerdict === 'flag' && !actedOn[r.caseId])
                  flagged.forEach(r => { setActedOn(prev => ({ ...prev, [r.caseId]: 'rejected' })) })
                  // ONE grouped message
                  const rejectList = flagged.map(r => `${r.caseId} (reason: ${r.agent1Reason})`).join(', ')
                  onAction(`Reject these ${flagged.length} flagged cases: ${rejectList}`)
                }}
                  style={{ fontSize: 13, fontWeight: 800, padding: '10px 20px', borderRadius: 10, background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer', flex: 1 }}>
                  ❌ Reject {reviews.filter(r => r.finalVerdict === 'flag' && !actedOn[r.caseId]).length} Flagged
                </button>
              )}
              <button onClick={onClose}
                style={{ fontSize: 13, fontWeight: 700, padding: '10px 20px', borderRadius: 10, background: '#f1f5f9', color: '#64748b', border: 'none', cursor: 'pointer' }}>
                Done
              </button>
            </div>
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  )
}
