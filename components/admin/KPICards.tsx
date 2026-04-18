'use client'

import { motion } from 'framer-motion'
import { AlertTriangle, Users, ShieldAlert, FileText } from 'lucide-react'

interface KPIData {
  needsAction: number
  outToday: number
  complianceAlerts: number
  pendingDocs: number
}

interface KPICardsProps {
  data: KPIData
  activeFilter: string | null
  onFilter: (filter: string | null) => void
}

const CARDS = [
  { key: 'needsAction', label: 'Needs Action', icon: AlertTriangle, color: '#ef4444', gradient: 'linear-gradient(135deg, #ef4444, #f97316)', field: 'needsAction' as const },
  { key: 'outToday', label: 'Out Today', icon: Users, color: '#6366f1', gradient: 'linear-gradient(135deg, #6366f1, #8b5cf6)', field: 'outToday' as const },
  { key: 'complianceAlerts', label: 'Compliance', icon: ShieldAlert, color: '#f59e0b', gradient: 'linear-gradient(135deg, #f59e0b, #ef4444)', field: 'complianceAlerts' as const },
  { key: 'pendingDocs', label: 'Pending Docs', icon: FileText, color: '#d97706', gradient: 'linear-gradient(135deg, #d97706, #ea580c)', field: 'pendingDocs' as const },
]

export function KPICards({ data, activeFilter, onFilter }: KPICardsProps) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 18 }}>
      {CARDS.map(({ key, label, icon: Icon, color, gradient, field }, i) => {
        const isActive = activeFilter === key
        const value = data[field]
        const hasValue = value > 0

        return (
          <motion.button
            key={key}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, duration: 0.25 }}
            whileHover={{ y: -4, scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => onFilter(isActive ? null : key)}
            style={{
              position: 'relative',
              padding: '24px 22px',
              borderRadius: 20,
              border: isActive ? `2px solid ${color}` : '1px solid rgba(255,255,255,0.8)',
              background: '#fff',
              boxShadow: isActive
                ? `0 12px 32px ${color}25, 0 0 0 1px ${color}15`
                : '0 4px 16px rgba(0,0,0,0.06)',
              cursor: 'pointer',
              textAlign: 'left' as const,
              overflow: 'hidden',
              transition: 'all 0.2s',
            }}
          >
            {/* Accent bar at top */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: hasValue ? gradient : '#e2e8f0', borderRadius: '20px 20px 0 0' }} />

            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontSize: 44, fontWeight: 900, color: hasValue ? color : '#cbd5e1', lineHeight: 1, marginBottom: 8 }}>
                  {value}
                </p>
                <p style={{ fontSize: 14, fontWeight: 700, color: '#475569' }}>{label}</p>
              </div>
              <div style={{
                height: 48, width: 48, borderRadius: 14,
                background: hasValue ? gradient : '#f1f5f9',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: hasValue ? `0 6px 16px ${color}35` : 'none',
              }}>
                <Icon className="h-6 w-6" style={{ color: hasValue ? '#fff' : '#94a3b8' }} />
              </div>
            </div>
          </motion.button>
        )
      })}
    </div>
  )
}
