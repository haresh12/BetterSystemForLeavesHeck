'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface TrendCardProps {
  chartType: 'bar' | 'line'
  title: string
  data: any[]
  periodDays?: number
}

const PALETTE = [
  '#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6',
  '#ec4899', '#3b82f6', '#14b8a6', '#f97316', '#84cc16',
]

// ── Bar chart (department / approval-rate data) ───────────────────────────────
function BarRows({ data, valueKey, labelKey, colorFn }: {
  data: any[]
  valueKey: string
  labelKey: string
  colorFn: (entry: any, i: number) => string
}) {
  const max = Math.max(...data.map((d) => d[valueKey] ?? 0), 1)

  return (
    <div className="space-y-2.5">
      {data.map((entry, i) => {
        const val = entry[valueKey] ?? 0
        const pct = Math.round((val / max) * 100)
        const color = colorFn(entry, i)
        return (
          <div key={i}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground truncate max-w-[140px]">{entry[labelKey]}</span>
              <span className="text-xs font-semibold tabular-nums ml-2" style={{ color }}>{val}{valueKey === 'approvalRate' ? '%' : 'd'}</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, background: color }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Sparkline (weekly volume) ─────────────────────────────────────────────────
function Sparkline({ data }: { data: any[] }) {
  if (!data.length) return null

  const W = 480
  const H = 120
  const PAD = { top: 8, right: 8, bottom: 24, left: 28 }
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom

  const maxVal = Math.max(...data.flatMap((d) => [d.submitted ?? 0, d.approved ?? 0, d.rejected ?? 0]), 1)
  const xStep = innerW / Math.max(data.length - 1, 1)

  function points(key: string) {
    return data.map((d, i) => {
      const x = PAD.left + i * xStep
      const y = PAD.top + innerH - (((d[key] ?? 0) / maxVal) * innerH)
      return `${x},${y}`
    }).join(' ')
  }

  // X-axis labels (show first + last + every ~3rd)
  const labelIndices = new Set<number>([0, data.length - 1])
  for (let i = 0; i < data.length; i += 3) labelIndices.add(i)

  // Y-axis ticks
  const yTicks = [0, Math.round(maxVal / 2), maxVal]

  const LINES = [
    { key: 'submitted', color: '#6366f1', label: 'Submitted' },
    { key: 'approved',  color: '#10b981', label: 'Approved' },
    { key: 'rejected',  color: '#ef4444', label: 'Rejected' },
  ]

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 130 }}>
        {/* Y gridlines */}
        {yTicks.map((tick) => {
          const y = PAD.top + innerH - ((tick / maxVal) * innerH)
          return (
            <g key={tick}>
              <line x1={PAD.left} y1={y} x2={PAD.left + innerW} y2={y} stroke="var(--border)" strokeWidth="0.5" strokeDasharray="3 3" />
              <text x={PAD.left - 4} y={y + 3.5} textAnchor="end" fontSize={9} fill="var(--muted-foreground)">{tick}</text>
            </g>
          )
        })}

        {/* Lines */}
        {LINES.map(({ key, color }) => (
          <polyline
            key={key}
            points={points(key)}
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}

        {/* X-axis labels */}
        {data.map((d, i) => {
          if (!labelIndices.has(i)) return null
          const x = PAD.left + i * xStep
          const label = (d.week as string)?.slice(5) ?? ''
          return (
            <text key={i} x={x} y={H - 4} textAnchor="middle" fontSize={9} fill="var(--muted-foreground)">{label}</text>
          )
        })}
      </svg>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-1">
        {LINES.map(({ key, color, label }) => (
          <div key={key} className="flex items-center gap-1.5">
            <span className="h-2 w-4 rounded-full inline-block" style={{ background: color }} />
            <span className="text-xs text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────
export function TrendCard({ chartType, title, data, periodDays }: TrendCardProps) {
  const isDeptData = data[0]?.department !== undefined
  const isTypeData = data[0]?.leaveType !== undefined
  const isWeekData = data[0]?.week !== undefined

  return (
    <Card className="w-full max-w-lg border border-border/60 shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <p className="text-sm font-semibold">{title}</p>
          {periodDays && (
            <span className="text-[11px] text-muted-foreground">Last {periodDays}d</span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isWeekData ? (
          <Sparkline data={data} />
        ) : isDeptData ? (
          <BarRows
            data={data}
            valueKey="totalDays"
            labelKey="department"
            colorFn={(_, i) => PALETTE[i % PALETTE.length]}
          />
        ) : isTypeData ? (
          <BarRows
            data={data}
            valueKey="approvalRate"
            labelKey="leaveType"
            colorFn={(entry) =>
              entry.approvalRate >= 80 ? '#10b981' : entry.approvalRate >= 60 ? '#f59e0b' : '#ef4444'
            }
          />
        ) : null}
      </CardContent>
    </Card>
  )
}
