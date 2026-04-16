'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User as FirebaseUser,
} from 'firebase/auth'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase/client'
import type { UserDoc, LeaveBalances } from '@/lib/firebase/types'

interface AuthContextValue {
  user: FirebaseUser | null
  profile: UserDoc | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (data: SignUpData) => Promise<void>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

export interface SignUpData {
  name: string
  email: string
  password: string
  role: 'employee' | 'admin'
  department: string
  jobTitle: string
  tenureYears: number
  managedEmployeeIds?: string[]
}

const DEFAULT_BALANCES: LeaveBalances = {
  pto: 15,
  sick: 10,
  personal: 5,
  bereavement: 5,
  maternity: 84,    // 12 weeks
  paternity: 10,
  fmla: 60,         // 12 weeks in working days
  unpaid: 30,
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null)
  const [profile, setProfile] = useState<UserDoc | null>(null)
  const [loading, setLoading] = useState(true)

  async function fetchProfile(uid: string): Promise<UserDoc | null> {
    const snap = await getDoc(doc(db, 'users', uid))
    if (!snap.exists()) return null
    return snap.data() as UserDoc
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser)
      if (firebaseUser) {
        const prof = await fetchProfile(firebaseUser.uid)
        setProfile(prof)
        // Set session cookie for middleware
        const token = await firebaseUser.getIdToken()
        await fetch('/api/auth/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, role: prof?.role }),
        })
      } else {
        setProfile(null)
        await fetch('/api/auth/session', { method: 'DELETE' })
      }
      setLoading(false)
    })
    return unsub
  }, [])

  async function signIn(email: string, password: string) {
    const cred = await signInWithEmailAndPassword(auth, email, password)
    const prof = await fetchProfile(cred.user.uid)
    setProfile(prof)
  }

  async function signUp(data: SignUpData) {
    const cred = await createUserWithEmailAndPassword(auth, data.email, data.password)
    const uid = cred.user.uid

    const userDoc: UserDoc = {
      uid,
      name: data.name,
      email: data.email,
      role: data.role,
      department: data.department,
      jobTitle: data.jobTitle,
      tenureYears: data.tenureYears,
      createdAt: serverTimestamp() as any,
      ...(data.role === 'employee' && { balances: DEFAULT_BALANCES }),
      ...(data.role === 'admin' && { managedEmployeeIds: data.managedEmployeeIds ?? [] }),
    }

    await setDoc(doc(db, 'users', uid), userDoc)
    setProfile(userDoc)
  }

  async function signOut() {
    await firebaseSignOut(auth)
    // Clear session cookie
    try { await fetch('/api/auth/session', { method: 'DELETE', credentials: 'include' }) } catch {}
    // Clear local chat history
    try { localStorage.removeItem('convowork_chat_history') } catch {}
    setUser(null)
    setProfile(null)
  }

  async function refreshProfile() {
    if (user) {
      const prof = await fetchProfile(user.uid)
      setProfile(prof)
    }
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signUp, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
