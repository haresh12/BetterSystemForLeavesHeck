'use client'

import { motion } from 'framer-motion'
import { ChevronRight, Sparkles } from 'lucide-react'

const TYPE_META: Record<string, { label: string; desc: string; maxDays: number; cert: string | false; color: string }> = {
  PTO:           { label: 'Paid Time Off',     desc: 'Vacation, travel, personal time',     maxDays: 15, cert: false,     color: '#6366f1' },
  Sick:          { label: 'Sick Leave',         desc: 'Illness or medical appointment',      maxDays: 10, cert: '3+ days', color: '#f59e0b' },
  FMLA:          { label: 'FMLA',              desc: 'Serious or chronic medical condition', maxDays: 60, cert: 'Always',  color: '#ef4444' },
  Personal:      { label: 'Personal Leave',     desc: 'Personal event or day off',           maxDays: 5,  cert: false,     color: '#10b981' },
  EmergencyLeave:{ label: 'Emergency Leave',    desc: 'Urgent unforeseen emergency',         maxDays: 3,  cert: false,     color: '#e11d48' },
  Maternity:     { label: 'Maternity',          desc: 'Childbirth — birthing parent',        maxDays: 84, cert: 'Always',  color: '#ec4899' },
  Paternity:     { label: 'Paternity',          desc: 'Childbirth — non-birthing parent',    maxDays: 10, cert: 'Always',  color: '#3b82f6' },
  Bereavement:   { label: 'Bereavement',        desc: 'Loss of a family member',             maxDays: 10, cert: '5+ days', color: '#8b5cf6' },
  CompOff:       { label: 'Comp Off',           desc: 'Time off in lieu of overtime worked',  maxDays: 10, cert: false,     color: '#06b6d4' },
  Unpaid:        { label: 'Unpaid Leave',       desc: 'Unpaid extended leave',               maxDays: 30, cert: false,     color: '#64748b' },
  Intermittent:  { label: 'Intermittent FMLA',  desc: 'Recurring medical condition',         maxDays: 60, cert: 'Always',  color: '#ea580c' },
}

interface Option {
  type: string
  balance?: number
  [key: string]: any
}

interface Props {
  options: Option[]
  onSelect?: (message: string) => void
}

export function LeaveTypePickerCard({ options, onSelect }: Props) {
  return (
    <div
      className="w-full rounded-2xl overflow-hidden"
      style={{ background: '#fff', border: '1px solid #e8e8f0', boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}
    >
      {/* Header */}
      <div
        style={{
          padding: '14px 16px',
          borderBottom: '1px solid #f0f0f5',
          background: '#fafaff',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Sparkles className="h-3.5 w-3.5" style={{ color: '#6366f1' }} />
          <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#6366f1' }}>
            Select Leave Type
          </span>
        </div>
        <p style={{ fontSize: 13, color: '#64748b', marginTop: 3, fontWeight: 500 }}>
          Tap the type that fits your situation
        </p>
      </div>

      {/* Options */}
      <div>
        {options.map((opt, i) => {
          const meta = TYPE_META[opt.type]
          if (!meta) return null
          const bal = opt.balance
          const isLow = bal != null && bal <= 2 && bal > 0
          const isZero = bal != null && bal === 0

          return (
            <motion.button
              key={opt.type}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06, duration: 0.2 }}
              onClick={() => onSelect?.(`${opt.type}`)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '14px 16px',
                textAlign: 'left' as const,
                cursor: 'pointer',
                background: 'transparent',
                border: 'none',
                borderBottom: i < options.length - 1 ? '1px solid #f0f0f5' : 'none',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = `${meta.color}08` }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
            >
              {/* Color badge */}
              <div
                style={{
                  height: 42, width: 42, borderRadius: 12,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, color: '#fff', fontSize: 12, fontWeight: 900,
                  background: `linear-gradient(135deg, ${meta.color}, ${meta.color}cc)`,
                  boxShadow: `0 4px 14px ${meta.color}40`,
                }}
              >
                {opt.type.slice(0, 2).toUpperCase()}
              </div>

              {/* Text */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 800, color: '#1a1a2e' }}>{meta.label}</span>
                  {/* Balance badge */}
                  {bal != null && (
                    <span
                      style={{
                        fontSize: 11, fontWeight: 800, padding: '1px 8px', borderRadius: 99,
                        background: isZero ? '#fee2e2' : isLow ? '#fef3c7' : `${meta.color}15`,
                        color: isZero ? '#dc2626' : isLow ? '#d97706' : meta.color,
                      }}
                    >
                      {bal}d left
                    </span>
                  )}
                </div>
                <p style={{ fontSize: 12, color: '#64748b', marginTop: 2, fontWeight: 500 }}>
                  {meta.desc}
                  <span style={{ color: '#cbd5e1', margin: '0 6px' }}>·</span>
                  max {meta.maxDays}d
                </p>
              </div>

              {/* Right: cert badge + arrow */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                {meta.cert === false ? (
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: '#dcfce7', color: '#16a34a' }}>
                    No cert
                  </span>
                ) : (
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: '#fef3c7', color: '#d97706' }}>
                    Cert req
                  </span>
                )}
                <ChevronRight className="h-4 w-4" style={{ color: '#cbd5e1' }} />
              </div>
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}
