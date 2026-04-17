'use client'

import { useState, useEffect, useCallback } from 'react'
import { collection, query, where, onSnapshot, writeBatch, doc } from 'firebase/firestore'
import { db } from '@/lib/firebase/client'
import type { NotificationDoc } from '@/lib/firebase/types'

export function useNotifications(userId: string | undefined) {
  const [notifications, setNotifications] = useState<NotificationDoc[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) {
      setLoading(false)
      return
    }

    const q = query(
      collection(db, 'notifications'),
      where('targetUserId', '==', userId),
      where('dismissed', '==', false)
    )

    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs
        .map((d) => ({ notificationId: d.id, ...d.data() } as NotificationDoc))
        .sort((a, b) => {
          const aTime = (a.createdAt as any)?.toMillis?.() ?? 0
          const bTime = (b.createdAt as any)?.toMillis?.() ?? 0
          return bTime - aTime
        })
      setNotifications(docs)
      setUnreadCount(docs.filter((n) => !n.read).length)
      setLoading(false)
    })

    return unsub
  }, [userId])

  const markAllRead = useCallback(async () => {
    if (!userId) return
    const unread = notifications.filter(n => !n.read)
    if (unread.length === 0) return
    const batch = writeBatch(db)
    unread.forEach(n => batch.update(doc(db, 'notifications', n.notificationId!), { read: true }))
    await batch.commit()
  }, [userId, notifications])

  return { notifications, unreadCount, loading, markAllRead }
}
