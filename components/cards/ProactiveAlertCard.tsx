'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, CheckCircle2, Clock, FileText, Zap } from 'lucide-react'

interface Alert {
  type: string
  severity: 'critical' | 'high' | 'medium'
  caseId: string
  employeeName: string
  message: string
  daysRemaining?: number
}

interface ProactiveAlertCardProps {
  alerts: Alert[]
  summary: {
    openCount: number
    pendingDocsCount: number
    underReviewCount: number
    totalManagedCases: number
    criticalAlerts: number
  }
  message: string
}

const ALERT_ICONS: Record<string, React.ReactNode> = {
  fmla_expiry: <AlertTriangle className="h-4 w-4 text-amber-500" />,
  sla_breach: <Clock className="h-4 w-4 text-orange-500" />,
  document_missing: <FileText className="h-4 w-4 text-red-500" />,
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800',
  high: 'bg-orange-50 border-orange-200 dark:bg-orange-900/20 dark:border-orange-800',
  medium: 'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800',
}

export function ProactiveAlertCard({ alerts, summary, message }: ProactiveAlertCardProps) {
  const hasAlerts = alerts.length > 0

  return (
    <Card className={`w-full max-w-lg ${hasAlerts ? 'border-amber-200 dark:border-amber-800' : 'border-emerald-200 dark:border-emerald-800'}`}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          {hasAlerts
            ? <AlertTriangle className="h-5 w-5 text-amber-500" />
            : <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          }
          <span>Morning Intelligence</span>
          {summary.criticalAlerts > 0 && (
            <Badge variant="destructive">{summary.criticalAlerts} critical</Badge>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Open', count: summary.openCount, icon: <Clock className="h-3.5 w-3.5 text-brand" /> },
            { label: 'Pending Docs', count: summary.pendingDocsCount, icon: <FileText className="h-3.5 w-3.5 text-amber-500" /> },
            { label: 'Total', count: summary.totalManagedCases, icon: <Zap className="h-3.5 w-3.5 text-muted-foreground" /> },
          ].map(({ label, count, icon }) => (
            <div key={label} className="bg-muted/40 rounded-lg p-2 text-center">
              <div className="flex items-center justify-center mb-1">{icon}</div>
              <p className="text-lg font-bold leading-none">{count}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Alerts */}
        {alerts.length > 0 && (
          <div className="space-y-2">
            {alerts.map((alert, i) => (
              <div
                key={i}
                className={`flex items-start gap-3 p-3 rounded-lg border text-sm ${SEVERITY_COLORS[alert.severity]}`}
              >
                <div className="mt-0.5 shrink-0">
                  {ALERT_ICONS[alert.type] ?? <AlertTriangle className="h-4 w-4" />}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-medium text-xs">{alert.employeeName}</span>
                    <Badge
                      variant={alert.severity === 'critical' ? 'destructive' : 'warning'}
                      className="text-xs px-1.5 py-0"
                    >
                      {alert.severity}
                    </Badge>
                    {alert.daysRemaining !== undefined && (
                      <span className="text-xs font-mono">#{alert.caseId.slice(-6).toUpperCase()}</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground leading-snug">{alert.message}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {!hasAlerts && (
          <p className="text-sm text-muted-foreground text-center py-2">{message}</p>
        )}
      </CardContent>
    </Card>
  )
}
