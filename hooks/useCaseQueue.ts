'use client'

import { useState, useEffect } from 'react'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase/client'
import type { CaseDoc } from '@/lib/firebase/types'

interface QueueSummary {
  openCount: number
  pendingDocsCount: number
  underReviewCount: number
  totalActive: number
}

export function useCaseQueue(managedEmployeeIds: string[] | undefined) {
  const [cases, setCases] = useState<CaseDoc[]>([])
  const [summary, setSummary] = useState<QueueSummary>({
    openCount: 0,
    pendingDocsCount: 0,
    underReviewCount: 0,
    totalActive: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (managedEmployeeIds === undefined) {
      setLoading(false)
      return
    }

    const q = query(
      collection(db, 'cases'),
      where('status', 'in', ['open', 'pending_docs', 'under_review'])
    )

    const unsub = onSnapshot(q, (snap) => {
      let docs = snap.docs.map((d) => ({ caseId: d.id, ...d.data() } as CaseDoc & { caseId: string })  )

      // Filter by managed scope
      if (managedEmployeeIds.length > 0) {
        docs = docs.filter((c) => managedEmployeeIds.includes(c.employeeId))
      }

      setCases(docs)
      setSummary({
        openCount: docs.filter((c) => c.status === 'open').length,
        pendingDocsCount: docs.filter((c) => c.status === 'pending_docs').length,
        underReviewCount: docs.filter((c) => c.status === 'under_review').length,
        totalActive: docs.length,
      })
      setLoading(false)
    })

    return unsub
  }, [managedEmployeeIds?.join(',')])

  return { cases, summary, loading }
}
