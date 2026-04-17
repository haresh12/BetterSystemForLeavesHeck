'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, CheckCircle2, Users } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import type { LeanCase } from '@/lib/firebase/types'

interface ConfirmCardProps {
  action: 'bulk_approve' | 'bulk_remind' | 'bulk_reject'
  candidates: LeanCase[]
  count: number
  message: string
}

export function ConfirmCard({ action, candidates, count, message }: ConfirmCardProps) {
  const actionConfig = {
    bulk_approve: {
      title: 'Ready to Approve',
      icon: <CheckCircle2 className="h-5 w-5 text-emerald-500" />,
      badgeVariant: 'success' as const,
      instruction: 'Reply "yes" to approve all',
    },
    bulk_remind: {
      title: 'Send Reminders',
      icon: <Users className="h-5 w-5 text-brand" />,
      badgeVariant: 'brand' as const,
      instruction: 'Reply "yes" to send all reminders',
    },
    bulk_reject: {
      title: 'Ready to Reject',
      icon: <AlertTriangle className="h-5 w-5 text-destructive" />,
      badgeVariant: 'destructive' as const,
      instruction: 'Reply "yes" to reject all',
    },
  }

  const config = actionConfig[action]

  return (
    <Card className="w-full max-w-lg border-dashed border-2">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          {config.icon}
          {config.title}
          <Badge variant={config.badgeVariant}>{count} case{count !== 1 ? 's' : ''}</Badge>
        </CardTitle>
        <p className="text-sm text-muted-foreground">{message}</p>
      </CardHeader>

      <CardContent className="space-y-2">
        {/* Case list */}
        <div className="space-y-1.5 max-h-48 overflow-y-auto">
          {candidates.slice(0, 10).map((c) => (
            <div
              key={c.caseId}
              className="flex items-center justify-between text-xs p-2 bg-muted/40 rounded-lg"
            >
              <div>
                <span className="font-medium">{c.employeeName}</span>
                <span className="text-muted-foreground ml-1">· {c.leaveType}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <span>{formatDate(c.startDate)}</span>
                <span>{c.isHalfDay ? '½d' : `${c.days}d`}</span>
                <span className="font-mono text-xs">#{c.caseId.slice(-6).toUpperCase()}</span>
              </div>
            </div>
          ))}
          {count > 10 && (
            <p className="text-xs text-muted-foreground text-center py-1">
              + {count - 10} more case{count - 10 !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        {/* Instruction */}
        <div className="flex items-center gap-2 pt-1 text-sm font-medium text-muted-foreground border-t">
          <span className="text-lg">💬</span>
          <span>{config.instruction}</span>
        </div>
      </CardContent>
    </Card>
  )
}
