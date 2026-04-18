'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Bot, ShieldCheck, CheckCircle2, AlertTriangle, XCircle,
  Sparkles, Zap, Eye, ChevronDown, ChevronUp,
} from 'lucide-react'

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
  onAction: (action: string) => void
}

const VERDICT_CFG = {
  approve: {
    icon: CheckCircle2,
    color: '#16a34a', bg: '#f0fdf4', border: '#86efac',
    badgeBg: '#dcfce7', label: 'AI RECOMMENDS APPROVE',
    scoreColor: '#16a34a', stripColor: '#22c55e',
  },
  review: {
    icon: AlertTriangle,
    color: '#d97706', bg: '#fffbeb', border: '#fcd34d',
    badgeBg: '#fef9c3', label: 'NEEDS MANUAL REVIEW',
    scoreColor: '#d97706', stripColor: '#f59e0b',
  },
  flag: {
    icon: XCircle,
    color: '#dc2626', bg: '#fef2f2', border: '#fecaca',
    badgeBg: '#fee2e2', label: 'FLAGGED — DO NOT AUTO-APPROVE',
    scoreColor: '#dc2626', stripColor: '#ef4444',
  },
}

const TYPE_COLOR: Record<string, string> = {
  PTO: '#6366f1', Sick: '#f59e0b', Personal: '#10b981', Bereavement: '#8b5cf6',
  FMLA: '#ef4444', Maternity: '#ec4899', Paternity: '#3b82f6',
  EmergencyLeave: '#f43f5e', CompOff: '#06b6d4', Unpaid: '#94a3b8',
}

function fmtDate(iso: string) {
  if (!iso) return ''
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Staggered reveal timing per case
const CASE_INTERVAL = 2200   // ms between each case starting
const A1_DELAY     = 500     // agent 1 appears after case header
const A2_DELAY     = 1100    // agent 2 appears after agent 1
const VERDICT_DELAY = 1700   // verdict appears last

export function AIReviewDialog({ open, onClose, caseIds, tabName, onAction }: AIReviewDialogProps) {
  const [reviews, setReviews] = useState<CaseReview[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Progressive reveal
  const [visibleCount, setVisibleCount] = useState(0)
  const [agent1Visible, setAgent1Visible] = useState<Set<number>>(new Set())
  const [agent2Visible, setAgent2Visible] = useState<Set<number>>(new Set())
  const [verdictVisible, setVerdictVisible] = useState<Set<number>>(new Set())

  // Expanded state for agent findings (collapsed by default for clean look)
  const [expandedFindings, setExpandedFindings] = useState<Set<number>>(new Set())

  // Manual actions (for 'review' and 'flag' cases)
  const [actedOn, setActedOn] = useState<Record<string, 'approved' | 'rejected'>>({})
  const [rejectInputId, setRejectInputId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  // Bulk action state
  const [bulkDone, setBulkDone] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    if (!open || caseIds.length === 0) return
    // Reset
    setLoading(true)
    setError('')
    setReviews([])
    setVisibleCount(0)
    setAgent1Visible(new Set())
    setAgent2Visible(new Set())
    setVerdictVisible(new Set())
    setExpandedFindings(new Set())
    setActedOn({})
    setRejectInputId(null)
    setRejectReason('')
    setBulkDone(false)
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []

    fetch('/api/admin/review-cases', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caseIds }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); setLoading(false); return }
        const revs: CaseReview[] = data.reviews ?? []
        setReviews(revs)
        setLoading(false)
        // Schedule staggered reveal
        revs.forEach((_, i) => {
          const base = i * CASE_INTERVAL
          timersRef.current.push(setTimeout(() => setVisibleCount(i + 1), base))
          timersRef.current.push(setTimeout(() => {
            setAgent1Visible(p => new Set([...p, i]))
          }, base + A1_DELAY))
          timersRef.current.push(setTimeout(() => {
            setAgent2Visible(p => new Set([...p, i]))
          }, base + A2_DELAY))
          timersRef.current.push(setTimeout(() => {
            setVerdictVisible(p => new Set([...p, i]))
            // Auto-scroll to latest case
            if (scrollRef.current) {
              scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
            }
          }, base + VERDICT_DELAY))
        })
      })
      .catch(() => { setError('Failed to load reviews'); setLoading(false) })

    return () => { timersRef.current.forEach(clearTimeout) }
  }, [open, caseIds])

  if (!open) return null

  const allRevealed = verdictVisible.size >= reviews.length && reviews.length > 0
  const progress = reviews.length > 0 ? Math.round((verdictVisible.size / reviews.length) * 100) : 0

  // Categorise after reveal
  const autoApproveIds = reviews.filter(r => r.finalVerdict === 'approve' && !actedOn[r.caseId]).map(r => r.caseId)
  const flaggedIds = reviews.filter(r => r.finalVerdict === 'flag' && !actedOn[r.caseId]).map(r => r.caseId)
  const manualReviewIds = reviews.filter(r => r.finalVerdict === 'review' && !actedOn[r.caseId]).map(r => r.caseId)

  const summary = {
    approve: reviews.filter(r => r.finalVerdict === 'approve').length,
    review: reviews.filter(r => r.finalVerdict === 'review').length,
    flag: reviews.filter(r => r.finalVerdict === 'flag').length,
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

  function handleApproveAll() {
    autoApproveIds.forEach(id => setActedOn(prev => ({ ...prev, [id]: 'approved' })))
    onAction(`bulk approve these ${autoApproveIds.length} AI-recommended cases: ${autoApproveIds.join(', ')}`)
    setBulkDone(true)
  }

  function handleRejectAll() {
    flaggedIds.forEach(id => setActedOn(prev => ({ ...prev, [id]: 'rejected' })))
    const rejectList = reviews
      .filter(r => r.finalVerdict === 'flag')
      .map(r => `${r.caseId} (reason: ${r.agent1Reason})`)
      .join(', ')
    onAction(`Reject these ${flaggedIds.length} flagged cases: ${rejectList}`)
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex' }}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'rgba(10,10,20,0.7)', backdropFilter: 'blur(10px)' }}
      />

      {/* Dialog panel */}
      <motion.div
        initial={{ x: -60, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -60, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 280, damping: 30 }}
        style={{
          position: 'relative', zIndex: 1,
          width: '68%', maxWidth: 960, height: '100%',
          background: '#fff', boxShadow: '12px 0 60px rgba(0,0,0,0.2)',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* ── Header ── */}
        <div style={{
          padding: '16px 24px', borderBottom: '1px solid #e8e8f0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'linear-gradient(135deg, rgba(99,102,241,0.06), rgba(139,92,246,0.03))',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              height: 40, width: 40, borderRadius: 12,
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(99,102,241,0.35)',
            }}>
              <Sparkles className="h-5 w-5" style={{ color: '#fff' }} />
            </div>
            <div>
              <p style={{ fontSize: 16, fontWeight: 900, color: '#1a1a2e' }}>AI Review — {tabName}</p>
              <p style={{ fontSize: 12, color: '#64748b', marginTop: 1 }}>
                {loading
                  ? `Analyzing ${caseIds.length} cases with two AI agents...`
                  : allRevealed
                    ? `${reviews.length} cases reviewed — ${summary.approve} approve · ${summary.review} manual · ${summary.flag} flagged`
                    : `Reviewing case ${Math.min(visibleCount, reviews.length)} of ${reviews.length}...`}
              </p>
            </div>
          </div>
          <button onClick={onClose} style={{ height: 34, width: 34, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', background: '#f1f5f9', border: '1px solid #e8e8f0', cursor: 'pointer' }}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Progress bar */}
        <div style={{ height: 5, background: '#f0f0f8', flexShrink: 0 }}>
          <motion.div
            animate={{ width: loading ? '10%' : `${progress}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            style={{ height: '100%', background: 'linear-gradient(90deg, #6366f1, #8b5cf6, #06b6d4)', borderRadius: 3 }}
          />
        </div>

        {/* ── Content ── */}
        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

          {/* Loading spinner */}
          {loading && (
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }}
                style={{ display: 'inline-block', marginBottom: 14 }}
              >
                <Sparkles className="h-8 w-8" style={{ color: '#6366f1' }} />
              </motion.div>
              <p style={{ fontSize: 16, fontWeight: 800, color: '#1a1a2e', marginBottom: 4 }}>
                Two AI agents analyzing {caseIds.length} cases...
              </p>
              <p style={{ fontSize: 13, color: '#64748b' }}>
                Agent 1 reviews leave data · Agent 2 validates patterns
              </p>
            </div>
          )}

          {error && (
            <div style={{ padding: '20px', borderRadius: 12, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: 14 }}>
              {error}
            </div>
          )}

          {/* Case cards */}
          {reviews.slice(0, visibleCount).map((review, i) => {
            const cfg = VERDICT_CFG[review.finalVerdict]
            const tc = TYPE_COLOR[review.leaveType] ?? '#6366f1'
            const showA1 = agent1Visible.has(i)
            const showA2 = agent2Visible.has(i)
            const showVerdict = verdictVisible.has(i)
            const action = actedOn[review.caseId]
            const isActed = !!action
            const isAutoApprove = review.finalVerdict === 'approve'
            const expanded = expandedFindings.has(i)
            const isCurrentlyReviewing = i === visibleCount - 1 && !showVerdict

            return (
              <motion.div
                key={review.caseId}
                initial={{ opacity: 0, y: 20, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.35, type: 'spring', stiffness: 300, damping: 28 }}
                style={{
                  position: 'relative',
                  marginBottom: 16, borderRadius: 16, overflow: 'hidden',
                  border: isActed
                    ? `2px solid ${action === 'approved' ? '#86efac' : '#fecaca'}`
                    : showVerdict ? `2px solid ${cfg.border}` : '1.5px solid #e8e8f0',
                  background: isActed
                    ? (action === 'approved' ? '#f0fdf4' : '#fef2f2')
                    : showVerdict ? cfg.bg : '#fff',
                  boxShadow: isCurrentlyReviewing ? '0 0 0 3px rgba(99,102,241,0.15), 0 8px 24px rgba(0,0,0,0.08)' : '0 2px 8px rgba(0,0,0,0.04)',
                  transition: 'all 0.4s ease',
                }}
              >
                {/* Left accent strip */}
                <div style={{
                  position: 'absolute', left: 0, top: 0, bottom: 0, width: 4,
                  background: isActed ? (action === 'approved' ? '#22c55e' : '#ef4444') : showVerdict ? cfg.stripColor : '#e2e8f0',
                  borderRadius: '16px 0 0 16px',
                }} />

                {/* Case header */}
                <div style={{ padding: '14px 18px 12px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: showA1 ? '1px solid #f0f0f8' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ height: 36, width: 36, borderRadius: 10, background: `${tc}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 900, color: tc, flexShrink: 0 }}>
                      {review.leaveType.slice(0, 2)}
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 15, fontWeight: 800, color: isActed && action === 'rejected' ? '#94a3b8' : '#1a1a2e', textDecoration: isActed && action === 'rejected' ? 'line-through' : 'none' }}>
                          {review.employeeName}
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: tc }}>{review.leaveType}</span>
                        <span style={{ fontSize: 12, color: '#64748b' }}>
                          {review.isHalfDay ? `½d (${review.halfDayPeriod})` : `${review.days}d`}
                        </span>
                        {isActed && (
                          <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 99, background: action === 'approved' ? '#dcfce7' : '#fee2e2', color: action === 'approved' ? '#16a34a' : '#dc2626' }}>
                            {action === 'approved' ? '✓ APPROVED' : '✕ REJECTED'}
                          </span>
                        )}
                        {isCurrentlyReviewing && (
                          <motion.span
                            animate={{ opacity: [1, 0.4, 1] }} transition={{ repeat: Infinity, duration: 1 }}
                            style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: '#eef2ff', color: '#6366f1' }}
                          >
                            Analyzing...
                          </motion.span>
                        )}
                      </div>
                      <p style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                        {fmtDate(review.startDate)} → {fmtDate(review.endDate)} · {review.department} · <span style={{ fontStyle: 'italic' }}>{review.reason}</span>
                      </p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#b0b0c0' }}>
                      {i + 1}/{reviews.length}
                    </span>
                    {showA1 && (
                      <button
                        onClick={() => setExpandedFindings(p => { const n = new Set(p); n.has(i) ? n.delete(i) : n.add(i); return n })}
                        style={{ height: 26, width: 26, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', border: 'none', cursor: 'pointer', color: '#64748b' }}
                      >
                        {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </button>
                    )}
                  </div>
                </div>

                {/* Agent findings — expandable */}
                <AnimatePresence>
                  {(showA1 && (expanded || isCurrentlyReviewing)) && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.25 }}
                    >
                      {/* Agent 1 */}
                      <div style={{ padding: '10px 18px 8px 22px', borderBottom: showA2 ? '1px solid #f0f0f8' : 'none', background: 'rgba(99,102,241,0.02)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                          <Bot className="h-3.5 w-3.5" style={{ color: '#6366f1' }} />
                          <span style={{ fontSize: 11, fontWeight: 800, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Agent 1 — Reviewer</span>
                        </div>
                        {review.agent1Findings.map((f, fi) => (
                          <motion.p key={fi}
                            initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: fi * 0.08, duration: 0.2 }}
                            style={{ fontSize: 12, color: '#475569', marginBottom: 3, paddingLeft: 10, borderLeft: '2px solid #c7d2fe', lineHeight: 1.5 }}
                          >{f}</motion.p>
                        ))}
                        <p style={{ fontSize: 11, fontWeight: 700, color: VERDICT_CFG[review.agent1Verdict].color, marginTop: 6 }}>
                          → {review.agent1Reason}
                        </p>
                      </div>

                      {/* Agent 2 */}
                      {showA2 && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                          transition={{ duration: 0.22 }}
                          style={{ padding: '10px 18px 8px 22px', borderBottom: '1px solid #f0f0f8', background: 'rgba(16,185,129,0.02)' }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                            <ShieldCheck className="h-3.5 w-3.5" style={{ color: '#10b981' }} />
                            <span style={{ fontSize: 11, fontWeight: 800, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Agent 2 — Validator</span>
                          </div>
                          {review.agent2Findings.map((f, fi) => (
                            <motion.p key={fi}
                              initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: fi * 0.08, duration: 0.2 }}
                              style={{ fontSize: 12, color: '#475569', marginBottom: 3, paddingLeft: 10, borderLeft: '2px solid #a7f3d0', lineHeight: 1.5 }}
                            >{f}</motion.p>
                          ))}
                          <p style={{ fontSize: 11, fontWeight: 700, color: VERDICT_CFG[review.agent2Verdict].color, marginTop: 6 }}>
                            → {review.agent2Reason}
                          </p>
                        </motion.div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Verdict bar */}
                <AnimatePresence>
                  {showVerdict && !isActed && (
                    <motion.div
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}
                      style={{
                        padding: '12px 18px 12px 22px',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        background: isAutoApprove ? 'linear-gradient(135deg, #f0fdf4, #dcfce7)' : `${cfg.color}06`,
                        borderTop: `1px solid ${cfg.border}`,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {/* Score ring */}
                        <div style={{
                          height: 46, width: 46, borderRadius: '50%', flexShrink: 0,
                          background: `${cfg.bg}`, border: `3px solid ${cfg.border}`,
                          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <span style={{ fontSize: 14, fontWeight: 900, color: cfg.scoreColor, lineHeight: 1 }}>{review.riskScore}</span>
                          <span style={{ fontSize: 8, color: cfg.scoreColor, opacity: 0.7 }}>/100</span>
                        </div>

                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                            <span style={{
                              fontSize: 11, fontWeight: 900, padding: '3px 10px', borderRadius: 99,
                              background: cfg.badgeBg, color: cfg.color, letterSpacing: '0.04em',
                            }}>
                              {cfg.label}
                            </span>
                            {isAutoApprove && (
                              <span style={{ fontSize: 10, fontWeight: 700, color: '#15803d' }}>
                                Will be included in bulk approval
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            {review.hasDocIssue && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: '#fef9c3', color: '#a16207' }}>MISSING DOC</span>}
                            {review.hasTeamOverlap && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: '#fff7ed', color: '#c2410c' }}>TEAM OVERLAP</span>}
                            {review.hasPatternFlag && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: '#fef2f2', color: '#dc2626' }}>PATTERN FLAG</span>}
                          </div>
                        </div>
                      </div>

                      {/* Manual action buttons — only for review/flag cases */}
                      {!isAutoApprove && (
                        rejectInputId === review.caseId ? (
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <input
                              value={rejectReason}
                              onChange={e => setRejectReason(e.target.value)}
                              placeholder="Rejection reason..."
                              autoFocus
                              onKeyDown={e => { if (e.key === 'Enter') handleReject(review.caseId) }}
                              style={{ fontSize: 12, padding: '6px 10px', borderRadius: 8, border: '1px solid #fecaca', width: 200, outline: 'none', background: '#fff' }}
                            />
                            <button
                              onClick={() => handleReject(review.caseId)}
                              disabled={!rejectReason.trim()}
                              style={{ fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 8, background: rejectReason.trim() ? '#ef4444' : '#f1f5f9', color: rejectReason.trim() ? '#fff' : '#94a3b8', border: 'none', cursor: rejectReason.trim() ? 'pointer' : 'not-allowed' }}
                            >Reject</button>
                            <button
                              onClick={() => { setRejectInputId(null); setRejectReason('') }}
                              style={{ fontSize: 12, fontWeight: 600, padding: '6px 10px', borderRadius: 8, background: '#f1f5f9', color: '#64748b', border: 'none', cursor: 'pointer' }}
                            >Cancel</button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              onClick={() => handleApprove(review.caseId)}
                              style={{ fontSize: 12, fontWeight: 700, padding: '7px 16px', borderRadius: 9, background: '#16a34a', color: '#fff', border: 'none', cursor: 'pointer', boxShadow: '0 2px 8px rgba(22,163,74,0.25)' }}
                            >Approve</button>
                            <button
                              onClick={() => { setRejectInputId(review.caseId); setRejectReason(review.agent1Reason) }}
                              style={{ fontSize: 12, fontWeight: 700, padding: '7px 16px', borderRadius: 9, background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca', cursor: 'pointer' }}
                            >Reject</button>
                          </div>
                        )
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Acted-on overlay */}
                {isActed && (
                  <div style={{ padding: '10px 18px 10px 22px', background: action === 'approved' ? '#f0fdf4' : '#fef2f2', borderTop: `1px solid ${action === 'approved' ? '#86efac' : '#fecaca'}`, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {action === 'approved'
                      ? <CheckCircle2 className="h-4 w-4" style={{ color: '#16a34a' }} />
                      : <XCircle className="h-4 w-4" style={{ color: '#dc2626' }} />}
                    <span style={{ fontSize: 12, fontWeight: 700, color: action === 'approved' ? '#15803d' : '#dc2626' }}>
                      {action === 'approved' ? 'Approved and employee notified' : 'Rejected and employee notified'}
                    </span>
                  </div>
                )}
              </motion.div>
            )
          })}

          {/* "Still analyzing" indicator between cases */}
          {!loading && visibleCount < reviews.length && (
            <motion.div
              animate={{ opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 1.5 }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 0', color: '#6366f1' }}
            >
              <Bot className="h-4 w-4" />
              <span style={{ fontSize: 13, fontWeight: 600 }}>
                Analyzing case {visibleCount + 1} of {reviews.length}...
              </span>
            </motion.div>
          )}
        </div>

        {/* ── Footer — shows after all cases reviewed ── */}
        <AnimatePresence>
          {allRevealed && !bulkDone && (
            <motion.div
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              style={{ padding: '16px 24px', borderTop: '1px solid #e8e8f0', background: '#fafafc', flexShrink: 0 }}
            >
              {/* Summary row */}
              <div style={{ display: 'flex', gap: 16, marginBottom: 14, alignItems: 'center' }}>
                <span style={{ fontSize: 14, fontWeight: 900, color: '#1a1a2e' }}>Review complete —</span>
                {summary.approve > 0 && (
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#16a34a' }}>
                    ✅ {summary.approve} safe to approve
                  </span>
                )}
                {summary.review > 0 && (
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#d97706' }}>
                    ⚠️ {summary.review} need review
                  </span>
                )}
                {summary.flag > 0 && (
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#dc2626' }}>
                    ❌ {summary.flag} flagged
                  </span>
                )}
                {summary.acted > 0 && (
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>· {summary.acted} already handled</span>
                )}
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 10 }}>
                {/* Approve all AI-recommended */}
                {autoApproveIds.length > 0 && (
                  <motion.button
                    whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    onClick={handleApproveAll}
                    style={{
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      padding: '14px', borderRadius: 12, border: 'none', cursor: 'pointer',
                      background: 'linear-gradient(135deg, #16a34a, #15803d)',
                      color: '#fff', fontSize: 14, fontWeight: 800,
                      boxShadow: '0 4px 16px rgba(22,163,74,0.4)',
                    }}
                  >
                    <CheckCircle2 className="h-5 w-5" />
                    Approve {autoApproveIds.length} AI-Recommended Cases
                  </motion.button>
                )}

                {/* Reject all flagged */}
                {flaggedIds.length > 0 && (
                  <motion.button
                    whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    onClick={handleRejectAll}
                    style={{
                      flex: flaggedIds.length > 0 && autoApproveIds.length === 0 ? 1 : undefined,
                      padding: '14px 20px', borderRadius: 12, border: 'none', cursor: 'pointer',
                      background: '#ef4444', color: '#fff', fontSize: 14, fontWeight: 800,
                      boxShadow: '0 4px 12px rgba(239,68,68,0.3)',
                      display: 'flex', alignItems: 'center', gap: 7,
                    }}
                  >
                    <XCircle className="h-5 w-5" />
                    Reject {flaggedIds.length} Flagged
                  </motion.button>
                )}

                {/* Manual review — close dialog */}
                {manualReviewIds.length > 0 && (
                  <motion.button
                    whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    onClick={onClose}
                    style={{
                      padding: '14px 20px', borderRadius: 12, cursor: 'pointer',
                      background: '#f1f5f9', color: '#475569', fontSize: 14, fontWeight: 700,
                      border: '1px solid #e2e8f0',
                      display: 'flex', alignItems: 'center', gap: 7,
                    }}
                  >
                    <Eye className="h-5 w-5" />
                    Manual Review {manualReviewIds.length}
                  </motion.button>
                )}

                {/* Done */}
                {manualReviewIds.length === 0 && flaggedIds.length === 0 && (
                  <button
                    onClick={onClose}
                    style={{ padding: '14px 24px', borderRadius: 12, background: '#f1f5f9', color: '#475569', fontSize: 14, fontWeight: 700, border: '1px solid #e2e8f0', cursor: 'pointer' }}
                  >
                    Done
                  </button>
                )}
              </div>

              {/* Hint text */}
              {(autoApproveIds.length > 0 || flaggedIds.length > 0) && (
                <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 10, textAlign: 'center' }}>
                  {manualReviewIds.length > 0
                    ? `${manualReviewIds.length} case${manualReviewIds.length > 1 ? 's' : ''} need human judgment — "Manual Review" closes this dialog and they remain in the tab for your decision.`
                    : 'One-click to action all AI recommendations.'}
                </p>
              )}
            </motion.div>
          )}

          {/* Post-bulk-action state */}
          {bulkDone && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              style={{ padding: '20px 24px', borderTop: '1px solid #e8e8f0', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <CheckCircle2 className="h-6 w-6" style={{ color: '#16a34a' }} />
                <div>
                  <p style={{ fontSize: 15, fontWeight: 800, color: '#14532d' }}>
                    {summary.approve} cases approved — employees notified
                  </p>
                  <p style={{ fontSize: 12, color: '#15803d' }}>All AI-recommended approvals processed successfully</p>
                </div>
              </div>
              <button onClick={onClose} style={{ padding: '10px 20px', borderRadius: 10, background: '#16a34a', color: '#fff', fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
                Done
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Right side panel — score legend */}
      {allRevealed && (
        <motion.div
          initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
          style={{
            position: 'relative', zIndex: 1, width: 220, background: 'rgba(255,255,255,0.95)',
            backdropFilter: 'blur(12px)', borderLeft: '1px solid rgba(255,255,255,0.2)',
            padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 16,
            boxShadow: '4px 0 20px rgba(0,0,0,0.1)',
          }}
        >
          <div>
            <p style={{ fontSize: 12, fontWeight: 800, color: '#1a1a2e', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Score Guide</p>
            {[
              { range: '75–100', label: 'Auto-Approve', color: '#16a34a', bg: '#f0fdf4', border: '#86efac' },
              { range: '50–74', label: 'Manual Review', color: '#d97706', bg: '#fffbeb', border: '#fcd34d' },
              { range: '0–49', label: 'Flagged', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
            ].map(s => (
              <div key={s.range} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, padding: '8px 10px', borderRadius: 8, background: s.bg, border: `1px solid ${s.border}` }}>
                <span style={{ fontSize: 14, fontWeight: 900, color: s.color, minWidth: 44 }}>{s.range}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: s.color }}>{s.label}</span>
              </div>
            ))}
          </div>

          <div>
            <p style={{ fontSize: 12, fontWeight: 800, color: '#1a1a2e', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>This Review</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderRadius: 8, background: '#f0fdf4', border: '1px solid #86efac' }}>
                <span style={{ fontSize: 13, color: '#16a34a' }}>✅ Approve</span>
                <span style={{ fontSize: 20, fontWeight: 900, color: '#16a34a' }}>{summary.approve}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderRadius: 8, background: '#fffbeb', border: '1px solid #fcd34d' }}>
                <span style={{ fontSize: 13, color: '#d97706' }}>⚠️ Review</span>
                <span style={{ fontSize: 20, fontWeight: 900, color: '#d97706' }}>{summary.review}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca' }}>
                <span style={{ fontSize: 13, color: '#dc2626' }}>❌ Flagged</span>
                <span style={{ fontSize: 20, fontWeight: 900, color: '#dc2626' }}>{summary.flag}</span>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderRadius: 8, background: '#f8f9fc', border: '1px solid #e8e8f0' }}>
              <Zap className="h-3.5 w-3.5" style={{ color: '#6366f1' }} />
              <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Powered by two-agent AI</span>
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>
  )
}
