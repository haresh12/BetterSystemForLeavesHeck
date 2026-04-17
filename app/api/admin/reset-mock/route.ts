import { NextResponse } from 'next/server'
import { getAdminDb, getAdminAuth } from '@/lib/firebase/admin'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST() {
  const cookieStore = await cookies()
  const token = cookieStore.get('session')?.value
  if (!token) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  try {
    const decoded = await getAdminAuth().verifyIdToken(token)
    const db = getAdminDb()
    const userSnap = await db.collection('users').doc(decoded.uid).get()
    if (!userSnap.exists || userSnap.data()!.role !== 'admin') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }
  } catch {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
  }

  const db = getAdminDb()
  const collections = ['cases', 'users', 'documents', 'notifications', 'audit_logs']
  let total = 0

  for (const col of collections) {
    const snap = await db.collection(col).where('isMockData', '==', true).get()
    if (snap.empty) continue
    // Firestore batch limit is 500
    const chunks = []
    for (let i = 0; i < snap.docs.length; i += 400) {
      chunks.push(snap.docs.slice(i, i + 400))
    }
    for (const chunk of chunks) {
      const batch = db.batch()
      chunk.forEach(d => batch.delete(d.ref))
      await batch.commit()
    }
    total += snap.size
  }

  return NextResponse.json({ success: true, deleted: total, message: `Deleted ${total} mock records. Run seed script to re-populate.` })
}
