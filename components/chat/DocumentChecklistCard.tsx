'use client'

import { motion } from 'framer-motion'
import { CheckCircle2, XCircle, FileText, RotateCcw, X, Sparkles, ShieldCheck, ShieldAlert, ShieldX } from 'lucide-react'

export interface CheckItem {
  pass: boolean
  note: string
}

interface DocumentChecklistCardProps {
  fileName: string
  confidenceScore?: number | null
  documentType?: string | null
  isValid: boolean
  checks: Record<string, CheckItem>
  onReupload?: () => void
  onDismiss?: () => void
  onProceed?: () => void
  onCancel?: () => void
}

const CHECK_LABELS: Record<string, string> = {
  isOfficial:  'Official document',
  provider:    'Issuing authority',
  authorized:  'Authorized signature',
  dates:       'Required dates',
  content:     'Document content',
}

const DOC_TYPE_LABELS: Record<string, string> = {
  medical_certificate:   'Medical Certificate',
  hospital_discharge:    'Hospital Discharge',
  birth_certificate:     'Birth Certificate',
  death_certificate:     'Death Certificate',
  wh380_form:            'WH-380 Form',
  personal_letter:       'Personal Letter',
  other:                 'Document',
}

type Tier = 'high' | 'mid' | 'low'

function getTier(pct: number): Tier {
  if (pct >= 70) return 'high'
  if (pct >= 40) return 'mid'
  return 'low'
}

const TIER_STYLES: Record<Tier, {
  bg: string; border: string; headerBg: string
  badgeBg: string; badgeFg: string
  titleColor: string; subtitleColor: string
  ShieldIcon: typeof ShieldCheck
  divider: string
}> = {
  high: {
    bg: '#f0fdf4', border: '#86efac', headerBg: '#dcfce7',
    badgeBg: '#16a34a', badgeFg: '#ffffff',
    titleColor: '#14532d', subtitleColor: '#15803d',
    ShieldIcon: ShieldCheck, divider: '#bbf7d0',
  },
  mid: {
    bg: '#fffbeb', border: '#fcd34d', headerBg: '#fef3c7',
    badgeBg: '#d97706', badgeFg: '#ffffff',
    titleColor: '#78350f', subtitleColor: '#92400e',
    ShieldIcon: ShieldAlert, divider: '#fde68a',
  },
  low: {
    bg: '#fef2f2', border: '#fca5a5', headerBg: '#fee2e2',
    badgeBg: '#dc2626', badgeFg: '#ffffff',
    titleColor: '#7f1d1d', subtitleColor: '#991b1b',
    ShieldIcon: ShieldX, divider: '#fecaca',
  },
}

export function DocumentChecklistCard({
  fileName, confidenceScore, documentType, isValid, checks, onReupload, onDismiss, onProceed, onCancel,
}: DocumentChecklistCardProps) {
  const pct = confidenceScore != null ? Math.round(confidenceScore * 100) : 0
  const tier = getTier(pct)
  const s = TIER_STYLES[tier]
  const checkEntries = Object.entries(checks)
  const passCount = checkEntries.filter(([, v]) => v.pass).length
  const docLabel = DOC_TYPE_LABELS[documentType ?? ''] ?? 'Document'
  const allPass = passCount === checkEntries.length
  const ShieldIcon = s.ShieldIcon

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.25 }}
      style={{ overflow: 'hidden' }}
    >
      <div
        style={{
          background: s.bg,
          border: `2px solid ${s.border}`,
          borderRadius: 16,
          overflow: 'hidden',
        }}
      >
        {/* ── Header ── */}
        <div
          style={{
            padding: '14px 16px',
            background: s.headerBg,
            borderBottom: `1px solid ${s.divider}`,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            {/* Shield icon */}
            <div
              style={{
                height: 40, width: 40, borderRadius: 12,
                background: s.badgeBg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
                boxShadow: `0 4px 14px ${s.badgeBg}50`,
              }}
            >
              <ShieldIcon className="h-5 w-5" style={{ color: s.badgeFg }} />
            </div>

            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 15, fontWeight: 800, color: s.titleColor }}>{fileName}</span>
                {/* Confidence badge */}
                <span
                  style={{
                    fontSize: 12, fontWeight: 800, padding: '2px 10px', borderRadius: 99,
                    background: s.badgeBg, color: s.badgeFg,
                  }}
                >
                  {pct}%
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                <Sparkles className="h-3 w-3" style={{ color: s.subtitleColor }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: s.subtitleColor }}>
                  AI Vision · {docLabel} · {passCount}/{checkEntries.length} passed
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={onDismiss}
            style={{ color: s.subtitleColor, flexShrink: 0, marginTop: 2, cursor: 'pointer', background: 'none', border: 'none' }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Confidence bar ── */}
        <div style={{ padding: '10px 16px', borderBottom: `1px solid ${s.divider}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: s.subtitleColor }}>CONFIDENCE</span>
            <span style={{ fontSize: 11, fontWeight: 800, color: s.titleColor }}>{pct}%</span>
          </div>
          <div style={{ height: 6, borderRadius: 99, background: `${s.border}60`, overflow: 'hidden' }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ delay: 0.15, duration: 0.6, ease: [0.34, 1.3, 0.64, 1] }}
              style={{ height: '100%', borderRadius: 99, background: s.badgeBg }}
            />
          </div>
        </div>

        {/* ── Checklist ── */}
        <div style={{ padding: '12px 16px' }}>
          {checkEntries.map(([key, check], i) => {
            const isPass = check.pass
            return (
              <motion.div
                key={key}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.08 * i, duration: 0.2 }}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  padding: '8px 0',
                  borderBottom: i < checkEntries.length - 1 ? `1px solid ${s.divider}` : 'none',
                }}
              >
                {/* Icon */}
                <div
                  style={{
                    height: 22, width: 22, borderRadius: 6, flexShrink: 0, marginTop: 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: isPass ? '#dcfce7' : '#fee2e2',
                  }}
                >
                  {isPass
                    ? <CheckCircle2 className="h-3.5 w-3.5" style={{ color: '#16a34a' }} />
                    : <XCircle className="h-3.5 w-3.5" style={{ color: '#dc2626' }} />
                  }
                </div>

                {/* Text */}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: isPass ? '#14532d' : '#991b1b',
                    lineHeight: 1.3,
                  }}>
                    {CHECK_LABELS[key] ?? key}
                  </p>
                  {check.note && (
                    <p style={{
                      fontSize: 13,
                      color: isPass ? '#15803d' : '#b91c1c',
                      marginTop: 2,
                      lineHeight: 1.4,
                      fontWeight: 500,
                    }}>
                      {check.note}
                    </p>
                  )}
                </div>

                {/* Pass/Fail label */}
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    padding: '2px 8px',
                    borderRadius: 99,
                    flexShrink: 0,
                    marginTop: 2,
                    background: isPass ? '#dcfce7' : '#fee2e2',
                    color: isPass ? '#16a34a' : '#dc2626',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  {isPass ? 'PASS' : 'FAIL'}
                </span>
              </motion.div>
            )
          })}
        </div>

        {/* ── Footer ── */}
        {!allPass && (onReupload || onProceed || onCancel) && (
          <div style={{ padding: '12px 16px', borderTop: `1px solid ${s.divider}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Action buttons row */}
            {(onProceed || onCancel) && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {onProceed && (
                  <button
                    onClick={onProceed}
                    style={{
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      fontSize: 13, fontWeight: 700, color: '#fff',
                      background: '#6366f1', border: '1px solid #4f46e5',
                      borderRadius: 8, padding: '8px 14px', cursor: 'pointer',
                      boxShadow: '0 2px 8px rgba(99,102,241,0.3)',
                    }}
                  >
                    Proceed anyway — let HR review
                  </button>
                )}
                {onCancel && (
                  <button
                    onClick={onCancel}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      fontSize: 13, fontWeight: 700, color: '#64748b',
                      background: '#f8fafc', border: '1px solid #e2e8f0',
                      borderRadius: 8, padding: '8px 14px', cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            )}
            {/* Re-upload option */}
            {onReupload ? (
              <button
                onClick={onReupload}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  fontSize: 12, fontWeight: 600, color: '#dc2626',
                  background: 'none', border: 'none', padding: '2px 0',
                  cursor: 'pointer', width: 'fit-content',
                }}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Re-upload a better document
              </button>
            ) : (onProceed || onCancel) ? (
              <p style={{ fontSize: 12, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 5 }}>
                <RotateCcw className="h-3 w-3" style={{ flexShrink: 0 }} />
                Or use the attachment button below to upload a clearer document
              </p>
            ) : null}
          </div>
        )}
      </div>
    </motion.div>
  )
}
