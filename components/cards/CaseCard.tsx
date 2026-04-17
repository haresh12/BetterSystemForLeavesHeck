'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { formatDate } from '@/lib/utils'
import type { LeanCase, CaseStatus } from '@/lib/firebase/types'
import {
  Calendar, User, Briefcase, FileCheck, FileX, FileText,
  CheckCircle2, XCircle, Clock, AlertCircle, MessageSquare
} from 'lucide-react'

interface CaseCardProps {
  case: LeanCase
  documents?: any[]
  auditLogs?: any[]
  message?: string
}

function StatusIcon({ status }: { status: CaseStatus }) {
  const icons: Record<CaseStatus, React.ReactNode> = {
    open: <Clock className="h-4 w-4 text-brand" />,
    pending_docs: <FileText className="h-4 w-4 text-amber-500" />,
    approved: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
    rejected: <XCircle className="h-4 w-4 text-destructive" />,
    cancelled: <XCircle className="h-4 w-4 text-muted-foreground" />,
    under_review: <AlertCircle className="h-4 w-4 text-blue-500" />,
  }
  return icons[status] ?? null
}

export function CaseCard({ case: c, documents, auditLogs, message }: CaseCardProps) {
  const totalDocs = documents?.length ?? 0
  const validDocs = documents?.filter((d: any) => d.status === 'valid').length ?? 0

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <StatusIcon status={c.status} />
              {c.leaveType} Leave
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Case #{c.caseId.slice(-6).toUpperCase()}
            </p>
          </div>
          <Badge
            variant={
              c.status === 'approved' ? 'success' :
              c.status === 'rejected' ? 'destructive' :
              c.status === 'pending_docs' ? 'warning' :
              c.status === 'cancelled' ? 'secondary' : 'brand'
            }
          >
            {c.status.replace('_', ' ')}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Core details */}
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <User className="h-3.5 w-3.5" />
            <span>{c.employeeName}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Briefcase className="h-3.5 w-3.5" />
            <span>{c.employeeDepartment}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground col-span-2">
            <Calendar className="h-3.5 w-3.5" />
            <span>
              {formatDate(c.startDate)} — {formatDate(c.endDate)}{' '}
              <span className="font-medium text-foreground">({c.days} day{c.days !== 1 ? 's' : ''})</span>
            </span>
          </div>
        </div>

        {c.reason && (
          <div className="text-sm bg-muted/40 rounded-lg px-3 py-2">
            <p className="text-xs text-muted-foreground mb-0.5">Reason</p>
            <p>{c.reason}</p>
          </div>
        )}

        {/* Document status + link */}
        {c.certificateRequired && (
          <div style={{ borderRadius: 10, padding: '10px 12px', background: c.docStatus === 'uploaded' ? '#f0fdf4' : c.docStatus === 'invalid' ? '#fef2f2' : '#fffbeb', border: `1px solid ${c.docStatus === 'uploaded' ? '#86efac' : c.docStatus === 'invalid' ? '#fecaca' : '#fcd34d'}` }}>
            <div className="flex items-center gap-2 text-sm">
              {c.docStatus === 'uploaded' ? (
                <><FileCheck className="h-4 w-4" style={{ color: '#16a34a' }} /><span style={{ fontWeight: 700, color: '#14532d', fontSize: 13 }}>Document verified</span></>
              ) : c.docStatus === 'invalid' ? (
                <><FileX className="h-4 w-4" style={{ color: '#dc2626' }} /><span style={{ fontWeight: 700, color: '#991b1b', fontSize: 13 }}>Document invalid — re-upload needed</span></>
              ) : (
                <><FileText className="h-4 w-4" style={{ color: '#d97706' }} /><span style={{ fontWeight: 700, color: '#92400e', fontSize: 13 }}>Document pending</span></>
              )}
            </div>
            {/* Show document details if available */}
            {documents && documents.length > 0 && (
              <div style={{ marginTop: 8 }}>
                {documents.map((doc: any, i: number) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginTop: i > 0 ? 6 : 0 }}>
                    <FileText className="h-3.5 w-3.5" style={{ color: '#64748b' }} />
                    <span style={{ color: '#475569', fontWeight: 600 }}>{doc.fileName ?? 'Document'}</span>
                    {doc.extractedFields?.confidenceScore != null && (
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: doc.extractedFields.confidenceScore >= 0.7 ? '#dcfce7' : '#fef3c7', color: doc.extractedFields.confidenceScore >= 0.7 ? '#16a34a' : '#d97706' }}>
                        {Math.round(doc.extractedFields.confidenceScore * 100)}%
                      </span>
                    )}
                    {doc.fileUrl && (
                      <a
                        href={doc.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: 12, fontWeight: 700, color: '#6366f1', textDecoration: 'none' }}
                      >
                        View →
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* FMLA expiry warning */}
        {c.fmlaExpiry && (
          <div className="flex items-center gap-2 text-sm bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
            <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
            <span className="text-amber-700 dark:text-amber-300">
              FMLA certification expires {formatDate(c.fmlaExpiry)}
            </span>
          </div>
        )}

        {/* Rejection reason */}
        {c.rejectionReason && (
          <div className="text-sm bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
            <p className="text-xs text-destructive mb-0.5 font-medium">Rejection reason</p>
            <p>{c.rejectionReason}</p>
          </div>
        )}

        {/* Notes / audit trail */}
        {c.notes && c.notes.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <MessageSquare className="h-3.5 w-3.5" /> Activity
              </p>
              {c.notes.slice(-5).map((note, i) => (
                <div key={i} className="text-xs">
                  <span className="font-medium">{note.actorName}</span>
                  <span className="text-muted-foreground"> · {note.timestamp ? new Date(note.timestamp).toLocaleDateString() : ''}</span>
                  <p className="text-muted-foreground mt-0.5">{note.text}</p>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Audit logs if available */}
        {auditLogs && auditLogs.length > 0 && (
          <>
            <Separator />
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Full Audit Trail</p>
              {auditLogs.map((log: any, i: number) => (
                <div key={i} className="text-xs flex items-start gap-2">
                  <span className="text-muted-foreground w-20 shrink-0">
                    {new Date(log.timestamp).toLocaleDateString()}
                  </span>
                  <span><span className="font-medium">{log.action}</span> — {log.detail}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {message && (
          <p className="text-xs text-muted-foreground border-t pt-2">{message}</p>
        )}
      </CardContent>
    </Card>
  )
}
