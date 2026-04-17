'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface BalanceChartProps {
  employeeName: string
  balances: Record<string, number>
}

const CFG: Record<string, { label: string; color: string; max: number; gradient: string }> = {
  pto:         { label: 'PTO',         color: '#818cf8', max: 15, gradient: 'linear-gradient(90deg, #818cf8, #6366f1)' },
  compoff:     { label: 'Comp Off',    color: '#22c55e', max: 15, gradient: 'linear-gradient(90deg, #22c55e, #16a34a)' },
  sick:        { label: 'Sick',        color: '#fbbf24', max: 10, gradient: 'linear-gradient(90deg, #fbbf24, #f59e0b)' },
  emergencyleave: { label: 'Emergency Leave', color: '#fb7185', max: 10, gradient: 'linear-gradient(90deg, #fb7185, #f43f5e)' },
  personal:    { label: 'Personal',    color: '#34d399', max: 5,  gradient: 'linear-gradient(90deg, #34d399, #10b981)' },
  bereavement: { label: 'Bereavement', color: '#c084fc', max: 10, gradient: 'linear-gradient(90deg, #c084fc, #a855f7)' },
  fmla:        { label: 'FMLA',        color: '#f87171', max: 60, gradient: 'linear-gradient(90deg, #f87171, #ef4444)' },
  intermittent:{ label: 'Intermittent', color: '#fb923c', max: 60, gradient: 'linear-gradient(90deg, #fb923c, #ea580c)' },
  maternity:   { label: 'Maternity',   color: '#f472b6', max: 84, gradient: 'linear-gradient(90deg, #f472b6, #ec4899)' },
  paternity:   { label: 'Paternity',   color: '#60a5fa', max: 10, gradient: 'linear-gradient(90deg, #60a5fa, #3b82f6)' },
  unpaid:      { label: 'Unpaid',      color: '#94a3b8', max: 30, gradient: 'linear-gradient(90deg, #94a3b8, #64748b)' },
}

export function BalanceChart({ employeeName, balances }: BalanceChartProps) {
  const [hovered, setHovered] = useState<string | null>(null)

  // Sort by daily-use importance, not by highest number
  const SORT_ORDER: Record<string, number> = {
    pto: 1, compoff: 2, sick: 3, emergencyleave: 4, personal: 5, bereavement: 6, paternity: 7,
    maternity: 8, fmla: 9, intermittent: 10, unpaid: 11,
  }
  const entries = Object.entries(balances)
    .filter(([k, v]) => typeof v === 'number' && CFG[k])
    .sort(([a], [b]) => (SORT_ORDER[a] ?? 99) - (SORT_ORDER[b] ?? 99))

  const USABLE_KEYS = ['pto', 'sick', 'personal', 'bereavement']
  const usableDays = entries.filter(([k]) => USABLE_KEYS.includes(k)).reduce((s, [, v]) => s + (v as number), 0)
  const totalDays = entries.reduce((s, [, v]) => s + (v as number), 0)
  const firstName = employeeName?.split(' ')[0] ?? employeeName

  if (entries.length === 0) {
    return (
      <div className="w-full rounded-2xl p-8 text-center" style={{ border: '1px solid #e8e8f0', background: '#fff' }}>
        <p style={{ fontSize: 14, color: '#94a3b8' }}>No balance data available.</p>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="w-full rounded-2xl overflow-hidden"
      style={{
        background: '#ffffff',
        border: '1px solid #e8e8f0',
        boxShadow: '0 4px 32px rgba(0,0,0,0.07)',
      }}
    >
      {/* Header */}
      <div
        className="px-5 pt-5 pb-4 flex items-start justify-between"
        style={{ borderBottom: '1px solid #f0f0f5' }}
      >
        <div>
          <p style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94a3b8' }}>
            Leave Balance
          </p>
          <p style={{ fontSize: 18, fontWeight: 900, color: '#1a1a2e', marginTop: 2 }}>{firstName}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: 32, fontWeight: 900, color: '#6366f1', lineHeight: 1 }}>
            {totalDays}
          </p>
          <p style={{ fontSize: 12, color: '#64748b', marginTop: 4, fontWeight: 600 }}>total days</p>
        </div>
      </div>

      {/* Tiles */}
      <div
        style={{
          padding: '16px 20px',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 10,
        }}
      >
        {entries.map(([key, rawDays], i) => {
          const days = rawDays as number
          const c = CFG[key]
          const pct = Math.min(100, Math.round((days / c.max) * 100))
          const isLow = pct < 30
          const isEmpty = days === 0
          const isActive = hovered === key

          return (
            <motion.div
              key={key}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.06 + i * 0.05, duration: 0.3, ease: 'easeOut' }}
              onMouseEnter={() => setHovered(key)}
              onMouseLeave={() => setHovered(null)}
              style={{
                padding: '12px',
                borderRadius: 12,
                cursor: 'default',
                transition: 'background 0.15s, box-shadow 0.15s, transform 0.15s',
                background: isActive ? `${c.color}08` : 'transparent',
                boxShadow: isActive ? `0 0 0 1px ${c.color}20, 0 4px 12px ${c.color}12` : 'none',
                transform: isActive ? 'scale(1.01)' : 'scale(1)',
                border: `1px solid ${isActive ? `${c.color}25` : '#eef2f7'}`,
              }}
            >
              {/* Label row */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10, gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <div
                    style={{
                      height: 12,
                      width: 12,
                      borderRadius: 4,
                      background: c.color,
                      boxShadow: isActive ? `0 2px 10px ${c.color}60` : `0 2px 6px ${c.color}35`,
                      transition: 'box-shadow 0.15s',
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#1a1a2e', lineHeight: 1.2 }}>{c.label}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, flexShrink: 0 }}>
                  <span
                    style={{
                      fontSize: 20,
                      fontWeight: 900,
                      fontVariantNumeric: 'tabular-nums',
                      color: isEmpty ? '#cbd5e1' : isLow ? '#ef4444' : c.color,
                    }}
                  >
                    {days}
                  </span>
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>/ {c.max}d</span>
                </div>
              </div>

              {/* Bar */}
              <div
                style={{
                  height: isActive ? 14 : 10,
                  borderRadius: 99,
                  width: '100%',
                  overflow: 'hidden',
                  background: `${c.color}12`,
                  transition: 'height 0.2s',
                }}
              >
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max(pct, 2)}%` }}
                  transition={{
                    delay: 0.15 + i * 0.06,
                    duration: 0.8,
                    ease: [0.34, 1.3, 0.64, 1],
                  }}
                  style={{
                    height: '100%',
                    borderRadius: 99,
                    background: isEmpty ? '#e2e8f0' : isLow ? 'linear-gradient(90deg, #f87171, #ef4444)' : c.gradient,
                    boxShadow: isEmpty ? 'none' : isActive ? `0 2px 12px ${c.color}50` : `0 2px 6px ${c.color}30`,
                    transition: 'box-shadow 0.15s',
                  }}
                />
              </div>

              {/* Expanded detail on hover */}
              <AnimatePresence>
                {isActive && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.15 }}
                    style={{ overflow: 'hidden' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10, fontSize: 13, color: '#475569' }}>
                      <span style={{ fontWeight: 500 }}>Used: <strong style={{ color: '#1a1a2e', fontWeight: 800, fontSize: 14 }}>{c.max - days}d</strong></span>
                      <span style={{ fontWeight: 500 }}>Remaining: <strong style={{ color: c.color, fontWeight: 800, fontSize: 14 }}>{days}d</strong></span>
                      <span style={{ fontWeight: 500 }}>Max: <strong style={{ color: '#1a1a2e', fontWeight: 800, fontSize: 14 }}>{c.max}d</strong></span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div style={{ paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>{pct}%</span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '2px 7px',
                    borderRadius: 99,
                    background: isEmpty ? '#f1f5f9' : isLow ? '#fef2f2' : `${c.color}15`,
                    color: isEmpty ? '#94a3b8' : isLow ? '#ef4444' : c.color,
                  }}
                >
                  {isEmpty ? 'Empty' : isLow ? 'Low' : 'Available'}
                </span>
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* Footer */}
      <div style={{ padding: '10px 20px', borderTop: '1px solid #f0f0f5' }}>
        <p style={{ fontSize: 10, color: '#c0c0d0', textAlign: 'center' }}>
          Hover rows for details · Each bar shows remaining vs. max · Resets annually
        </p>
      </div>
    </motion.div>
  )
}
