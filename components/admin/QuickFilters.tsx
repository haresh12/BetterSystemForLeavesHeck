'use client'

import { motion } from 'framer-motion'
import { AlertTriangle, FileText, Zap, Building } from 'lucide-react'

interface QuickFiltersProps {
  onFilter: (message: string) => void
}

const FILTERS = [
  { label: 'Starting Tomorrow', icon: AlertTriangle, color: '#ef4444', message: 'Show cases where leave starts tomorrow' },
  { label: 'Missing Docs', icon: FileText, color: '#f59e0b', message: 'Show cases with missing documents' },
  { label: 'High Priority', icon: Zap, color: '#ef4444', message: 'Show high priority cases' },
]

const DEPTS = ['Engineering', 'Product', 'Sales', 'Design']

export function QuickFilters({ onFilter }: QuickFiltersProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 24px', overflowX: 'auto', flexWrap: 'wrap', background: '#fff', borderRadius: 16, border: '1px solid #e8e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }} className="no-scrollbar">
      <span style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0, marginRight: 4 }}>Quick</span>
      {FILTERS.map((f, i) => {
        const Icon = f.icon
        return (
          <motion.button
            key={f.label}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            onClick={() => onFilter(f.message)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 13, fontWeight: 700, padding: '8px 16px', borderRadius: 10,
              background: '#fff', color: f.color, border: `1.5px solid ${f.color}30`,
              cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0,
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = `${f.color}08`; (e.currentTarget as HTMLButtonElement).style.borderColor = f.color }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#fff'; (e.currentTarget as HTMLButtonElement).style.borderColor = `${f.color}30` }}
          >
            <Icon className="h-3.5 w-3.5" />
            {f.label}
          </motion.button>
        )
      })}

      <div style={{ width: 1, height: 20, background: '#e8e8f0', flexShrink: 0, margin: '0 4px' }} />

      {/* Department filters */}
      {DEPTS.map((dept, i) => (
        <motion.button
          key={dept}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 + i * 0.04 }}
          onClick={() => onFilter(`Show cases from ${dept} department`)}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 13, fontWeight: 600, padding: '8px 16px', borderRadius: 10,
            background: '#f8f9fc', color: '#64748b', border: '1px solid #e8e8f0',
            cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0,
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#eef2ff'; (e.currentTarget as HTMLButtonElement).style.color = '#4f46e5'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#c7d2fe' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#f8f9fc'; (e.currentTarget as HTMLButtonElement).style.color = '#64748b'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#e8e8f0' }}
        >
          <Building className="h-3.5 w-3.5" />
          {dept}
        </motion.button>
      ))}
    </div>
  )
}
