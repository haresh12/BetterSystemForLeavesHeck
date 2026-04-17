'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, X, CheckCheck, Clock, CheckCircle2, XCircle, FileText, AlertTriangle } from 'lucide-react'
import type { NotificationDoc } from '@/lib/firebase/types'

const TYPE_CONFIG: Record<string, { icon: typeof Bell; color: string; bg: string }> = {
  case_approved:      { icon: CheckCircle2,  color: '#16a34a', bg: '#f0fdf4' },
  case_rejected:      { icon: XCircle,       color: '#dc2626', bg: '#fef2f2' },
  new_case:           { icon: Clock,         color: '#6366f1', bg: '#eef2ff' },
  document_reminder:  { icon: FileText,      color: '#d97706', bg: '#fffbeb' },
  fmla_expiry:        { icon: AlertTriangle, color: '#ef4444', bg: '#fef2f2' },
}

interface NotificationPanelProps {
  notifications: NotificationDoc[]
  unreadCount: number
  onMarkAllRead: () => void
}

export function NotificationBell({ notifications, unreadCount, onMarkAllRead }: NotificationPanelProps) {
  const [open, setOpen] = useState(false)

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          position: 'relative', height: 32, width: 32, borderRadius: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#64748b', background: 'none', border: 'none', cursor: 'pointer',
        }}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: -2, right: -2, height: 16, width: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#6366f1', color: '#fff', fontSize: 9, fontWeight: 800, borderRadius: '50%',
          }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              style={{ position: 'fixed', inset: 0, zIndex: 50 }}
            />
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              style={{
                position: 'absolute', top: 40, right: 0, width: 340, maxHeight: 420,
                background: '#fff', borderRadius: 14, zIndex: 51,
                border: '1px solid #e8e8f0', boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
                display: 'flex', flexDirection: 'column', overflow: 'hidden',
              }}
            >
              {/* Header */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 16px', borderBottom: '1px solid #f0f0f5',
              }}>
                <p style={{ fontSize: 14, fontWeight: 800, color: '#1a1a2e' }}>
                  Notifications {unreadCount > 0 && <span style={{ color: '#6366f1' }}>({unreadCount})</span>}
                </p>
                {unreadCount > 0 && (
                  <button
                    onClick={() => { onMarkAllRead(); }}
                    style={{
                      fontSize: 12, fontWeight: 600, color: '#6366f1', background: 'none',
                      border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                    }}
                  >
                    <CheckCheck className="h-3.5 w-3.5" /> Mark all read
                  </button>
                )}
              </div>

              {/* List */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
                {notifications.length === 0 ? (
                  <div style={{ padding: 32, textAlign: 'center' }}>
                    <Bell className="h-6 w-6 mx-auto" style={{ color: '#cbd5e1', marginBottom: 8 }} />
                    <p style={{ fontSize: 13, color: '#94a3b8' }}>No notifications</p>
                  </div>
                ) : (
                  notifications.slice(0, 20).map((n, i) => {
                    const cfg = TYPE_CONFIG[n.type] ?? TYPE_CONFIG.new_case
                    const Icon = cfg.icon
                    return (
                      <div
                        key={i}
                        style={{
                          display: 'flex', gap: 10, padding: '10px 16px',
                          borderBottom: i < notifications.length - 1 ? '1px solid #f8f8fc' : 'none',
                          background: n.read ? 'transparent' : '#fafaff',
                        }}
                      >
                        <div style={{
                          height: 28, width: 28, borderRadius: 8, flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: cfg.bg,
                        }}>
                          <Icon className="h-3.5 w-3.5" style={{ color: cfg.color }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 13, fontWeight: n.read ? 500 : 700, color: '#1a1a2e', lineHeight: 1.4 }}>
                            {n.message}
                          </p>
                          {n.createdAt && (
                            <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                              {formatTimeAgo(typeof n.createdAt === 'string' ? n.createdAt : n.createdAt?.toDate?.()?.toISOString?.() ?? '')}
                            </p>
                          )}
                        </div>
                        {!n.read && (
                          <div style={{ height: 8, width: 8, borderRadius: '50%', background: '#6366f1', flexShrink: 0, marginTop: 6 }} />
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

function formatTimeAgo(iso: string): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}
