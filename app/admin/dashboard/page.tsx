'use client'

import { useState, useEffect, useRef } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '@/context/AuthContext'
import { useNotifications } from '@/hooks/useNotifications'
import { MessageBubble, TypingRow } from '@/components/chat/MessageBubble'
import { ChatInput, type PendingDoc } from '@/components/chat/ChatInput'
import { NotificationBell } from '@/components/ui/notification-panel'
import { KPICards } from '@/components/admin/KPICards'
import { CaseTableAdmin } from '@/components/admin/CaseTableAdmin'
import { CaseSlideOver } from '@/components/admin/CaseSlideOver'
import { DynamicTabs, type DynamicTab } from '@/components/admin/DynamicTabs'
import { QuickFilters } from '@/components/admin/QuickFilters'
import { AIReviewDialog } from '@/components/admin/AIReviewDialog'
import {
  Shield, LogOut, Plus, Users, RefreshCw, Sparkles,
  UserPlus, UserMinus, Search, X,
} from 'lucide-react'
import toast, { Toaster } from 'react-hot-toast'
import { useRouter } from 'next/navigation'
import { db } from '@/lib/firebase/client'
import { collection, query, where, onSnapshot, getDocs, doc, updateDoc } from 'firebase/firestore'
import type { CaseDoc } from '@/lib/firebase/types'

const adminTransport = new DefaultChatTransport({ api: '/api/admin-chat' })
const TYPE_COLORS: Record<string, string> = {
  PTO: '#6366f1', Sick: '#f59e0b', Personal: '#10b981', FMLA: '#ef4444',
  Maternity: '#ec4899', Paternity: '#3b82f6', Bereavement: '#8b5cf6',
  Intermittent: '#f97316', CompOff: '#06b6d4',
}

function toISO(ts: any): string {
  if (!ts) return new Date().toISOString()
  if (typeof ts === 'string') return ts
  if (ts?.toDate) return ts.toDate().toISOString()
  return new Date().toISOString()
}

export default function AdminDashboardPage() {
  const router = useRouter()
  const { profile, signOut } = useAuth()
  const { notifications: notifList, unreadCount, markAllRead } = useNotifications(profile?.uid)

  const [input, setInput] = useState('')
  const [pendingFile, setPendingFile] = useState<PendingDoc | null>(null)
  const chatScrollRef = useRef<HTMLDivElement>(null)

  // Real-time cases
  const [allCases, setAllCases] = useState<(CaseDoc & { caseId: string })[]>([])
  const [casesLoading, setCasesLoading] = useState(true)

  // Dynamic tabs
  const [tabs, setTabs] = useState<DynamicTab[]>([
    { id: 'all', label: 'All Cases', caseIds: [], color: '#6366f1', createdByAI: false, pinned: true },
  ])
  const [activeTabId, setActiveTabId] = useState('all')

  // AI Review Dialog
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false)
  const [reviewCaseIds, setReviewCaseIds] = useState<string[]>([])
  const [reviewTabName, setReviewTabName] = useState('')

  // AI verdicts per case
  const [aiVerdicts, setAiVerdicts] = useState<Record<string, 'safe' | 'review' | 'flag'>>({})
  const [reviewingCaseIds, setReviewingCaseIds] = useState<Set<string>>(new Set())

  // UI
  const [selectedCase, setSelectedCase] = useState<(CaseDoc & { caseId: string }) | null>(null)
  const [empPanelOpen, setEmpPanelOpen] = useState(false)
  const [allEmployees, setAllEmployees] = useState<Array<{ uid: string; name: string; email: string; department: string }>>([])
  const [managedIds, setManagedIds] = useState<string[]>([])
  const [empSearch, setEmpSearch] = useState('')
  const [empLoading, setEmpLoading] = useState(false)
  const [resetting, setResetting] = useState(false)

  // Chat
  const { messages, sendMessage, status, setMessages } = useChat({
    transport: adminTransport,
    onError: (err) => toast.error(err.message ?? 'Something went wrong'),
  })
  const isLoading = status === 'streaming' || status === 'submitted'
  const visibleMessages = messages.filter(
    (m) => !(m.role === 'user' && m.parts.some((p) => p.type === 'text' && (p as any).text === '__PROACTIVE_SCAN__')),
  )

  useEffect(() => {
    if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
  }, [messages])

  // Real-time Firestore
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'cases'), (snap) => {
      const seen = new Set<string>()
      const cases = snap.docs
        .map(d => ({ caseId: d.id, ...d.data() } as CaseDoc & { caseId: string }))
        .filter(c => { if (seen.has(c.caseId)) return false; seen.add(c.caseId); return true })
        .sort((a, b) => toISO(b.createdAt).localeCompare(toISO(a.createdAt)))
      setAllCases(cases)
      setCasesLoading(false)
      setTabs(prev => prev.map(t => t.id === 'all' ? { ...t, caseIds: cases.filter(c => c.status === 'open' || c.status === 'pending_docs').map(c => c.caseId) } : t))
    })
    return unsub
  }, [])

  // Watch for AI tool outputs → create dynamic tabs
  const processedToolCallIds = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (messages.length === 0) return
    for (const msg of messages) {
      if (msg.role !== 'assistant') continue
      for (const part of (msg.parts ?? [])) {
        const p = part as any
        if (!p.type || !p.toolCallId) continue
        if (processedToolCallIds.current.has(p.toolCallId)) continue
        const isToolPart = p.type === 'dynamic-tool' || (typeof p.type === 'string' && p.type.startsWith('tool-'))
        if (!isToolPart) continue
        if (p.state !== 'output-available' || !p.output) continue
        processedToolCallIds.current.add(p.toolCallId)
        const uiType = p.output.ui_component

        // Handle ReviewTrigger → open dialog
        if (uiType === 'ReviewTrigger') {
          const ids = (p.output.caseIds as string[]) ?? []
          const name = (p.output.tabName as string) ?? 'Review'
          console.log('[REVIEW] Trigger detected:', name, 'cases:', ids.length)
          if (ids.length > 0) {
            setReviewCaseIds(ids)
            setReviewTabName(name)
            setReviewDialogOpen(true)
          }
          continue
        }

        if (uiType !== 'CaseTable') continue
        const cases = (p.output.cases as any[]) ?? []
        if (cases.length === 0) continue

        const caseIds = cases.map((c: any) => c.caseId)
        const filters = p.output.filters ?? {}
        const lt = filters.leaveType
        const ds = filters.docStatus
        const pr = filters.priority
        const dp = filters.department

        // Tab name: AI provides it, or we derive from filters
        let tabLabel = (p.output.tabName as string) || 'Filtered'
        let tabColor = '#6366f1'
        if (lt && lt !== 'all') tabColor = TYPE_COLORS[lt] ?? '#6366f1'
        else if (ds === 'missing') tabColor = '#f59e0b'
        else if (pr === 'high') tabColor = '#ef4444'
        else if (dp) tabColor = '#8b5cf6'

        console.log('[TAB] Creating:', tabLabel, 'cases:', caseIds.length)
        const existing = tabs.find(t => t.label === tabLabel && t.id !== 'all')
        if (existing) {
          setTabs(prev => prev.map(t => t.id === existing.id ? { ...t, caseIds } : t))
          setActiveTabId(existing.id)
        } else {
          const newTab: DynamicTab = { id: `ai-${Date.now()}`, label: tabLabel, caseIds, color: tabColor, createdByAI: true }
          setTabs(prev => [...prev, newTab])
          setActiveTabId(newTab.id)
          toast.success(`✨ ${tabLabel} — ${caseIds.length} cases`, { duration: 3000 })
        }
      }
    }
  }, [messages, status])

  // Parse AI review text for verdicts (✅/⚠️/❌ patterns)
  useEffect(() => {
    if (messages.length === 0) return
    const lastMsg = messages[messages.length - 1]
    if (lastMsg.role !== 'assistant') return

    const textParts = (lastMsg.parts ?? []).filter((p: any) => p.type === 'text').map((p: any) => p.text).join('')
    if (!textParts) return

    const newVerdicts: Record<string, 'safe' | 'review' | 'flag'> = {}
    const lines = textParts.split('\n')

    for (const line of lines) {
      // Match employee names with verdicts
      for (const c of allCases) {
        if (!c.employeeName) continue
        const nameInLine = line.includes(c.employeeName)
        if (!nameInLine) continue

        if (line.includes('✅') || line.toLowerCase().includes('approve') && !line.toLowerCase().includes('not')) {
          newVerdicts[c.caseId] = 'safe'
        } else if (line.includes('⚠️') || line.toLowerCase().includes('review') || line.toLowerCase().includes('overlap') || line.toLowerCase().includes('needs your')) {
          newVerdicts[c.caseId] = 'review'
        } else if (line.includes('❌') || line.toLowerCase().includes('reject') || line.toLowerCase().includes('flag') || line.toLowerCase().includes('suspicious')) {
          newVerdicts[c.caseId] = 'flag'
        }
      }
    }

    if (Object.keys(newVerdicts).length > 0) {
      setAiVerdicts(prev => ({ ...prev, ...newVerdicts }))
      setReviewingCaseIds(new Set())
    }
  }, [messages, allCases])

  // Active tab cases
  const activeTab = tabs.find(t => t.id === activeTabId) ?? tabs[0]
  const displayCases = activeTab.id === 'all'
    ? allCases.filter(c => c.status === 'open' || c.status === 'pending_docs')
    : allCases.filter(c => activeTab.caseIds.includes(c.caseId))

  // KPIs
  const today = new Date().toISOString().split('T')[0]
  const openCases = allCases.filter(c => c.status === 'open' || c.status === 'pending_docs')
  const kpi = {
    needsAction: openCases.length,
    outToday: allCases.filter(c => ['approved', 'open'].includes(c.status) && c.startDate <= today && c.endDate >= today).length,
    complianceAlerts: allCases.filter(c => c.fmlaExpiry && !['cancelled', 'rejected'].includes(c.status)).length,
    pendingDocs: allCases.filter(c => c.docStatus === 'missing').length,
  }

  // ── Actions (all go through chat → AI → MCP) ──
  function sendChatMessage(msg: string) {
    // Add active tab context so AI knows what we're talking about
    const tab = tabs.find(t => t.id === activeTabId)
    const context = tab && tab.id !== 'all' ? `[Context: viewing "${tab.label}" tab with ${tab.caseIds.length} cases] ` : ''
    sendMessage({ text: context + msg })
  }

  function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim()) return
    sendChatMessage(input)
    setInput('')
  }

  function handleApproveViaChat(caseId: string) {
    sendChatMessage(`Approve case ${caseId}`)
  }

  function handleRejectViaChat(caseId: string, reason: string) {
    sendChatMessage(`Reject case ${caseId}, reason: ${reason}`)
  }

  function handleAIReview(tabId: string) {
    const tab = tabs.find(t => t.id === tabId)
    if (!tab || tab.caseIds.length === 0) return
    setReviewCaseIds(tab.caseIds)
    setReviewTabName(tab.label)
    setReviewDialogOpen(true)
    sendChatMessage(`Reviewing ${tab.caseIds.length} cases from "${tab.label}" tab. Results shown in the review panel.`)
  }

  function handleApproveAllSafe(tabId: string) {
    const tab = tabs.find(t => t.id === tabId)
    if (!tab) return
    const safeCaseIds = tab.caseIds.filter(id => aiVerdicts[id] === 'safe')
    if (safeCaseIds.length === 0) return
    sendChatMessage(`Approve these ${safeCaseIds.length} safe cases: ${safeCaseIds.join(', ')}`)
  }


  function handleFilterByType(msg: string) {
    sendChatMessage(msg)
  }

  function handleNewChat() {
    setMessages([])
    setInput('')
    setAiVerdicts({})
    setReviewingCaseIds(new Set())
  }

  const hasMockCases = allCases.some(c => (c as any).isMockData)

  async function handleResetDemo() {
    setResetting(true)
    try {
      await fetch('/api/admin/reset-mock', { method: 'POST', credentials: 'include' })
      toast.success('Mock data cleared.')
      handleNewChat()
      setTabs([{ id: 'all', label: 'All Cases', caseIds: [], color: '#6366f1', createdByAI: false, pinned: true }])
      setActiveTabId('all')
      setAiVerdicts({})
    } catch { toast.error('Reset failed') }
    setResetting(false)
  }

  async function handleSeedDemo() {
    setResetting(true)
    try {
      const res = await fetch('/api/admin/seed-mock', { method: 'POST', credentials: 'include' })
      const data = await res.json()
      if (res.ok) toast.success('Demo cases loaded!')
      else toast.error(data.error ?? 'Seed failed')
    } catch { toast.error('Seed failed') }
    setResetting(false)
  }

  // Employee management
  async function loadEmployees() {
    if (!profile?.uid) return
    setEmpLoading(true)
    try {
      const empSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'employee')))
      setAllEmployees(empSnap.docs.map(d => ({ uid: d.id, name: d.data().name, email: d.data().email, department: d.data().department })).sort((a, b) => a.name.localeCompare(b.name)))
      const adminSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'admin')))
      const me = adminSnap.docs.find(d => d.id === profile.uid)
      setManagedIds(me?.data().managedEmployeeIds ?? [])
    } catch {} // eslint-disable-line
    setEmpLoading(false)
  }

  async function toggleEmployee(empId: string) {
    if (!profile?.uid) return
    const isManaged = managedIds.includes(empId)
    const updated = isManaged ? managedIds.filter(id => id !== empId) : [...managedIds, empId]
    setManagedIds(updated)
    try { await updateDoc(doc(db, 'users', profile.uid), { managedEmployeeIds: updated }); toast.success(isManaged ? 'Removed' : 'Added') }
    catch { toast.error('Failed'); setManagedIds(managedIds) } // eslint-disable-line
  }

  async function handleSignOut() { await signOut(); router.push('/login') }
  const firstName = profile?.name?.split(' ')[0] ?? 'Admin'

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#f0f1f5' }}>
      <Toaster position="top-right" toastOptions={{ style: { borderRadius: 12, border: '1px solid #e8e8f0', background: '#fff', color: '#1a1a2e' } }} />

      {/* ═══ LEFT: DASHBOARD ═══ */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Header */}
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', background: '#fff', borderBottom: '1px solid #e8e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ height: 34, width: 34, borderRadius: 10, background: 'linear-gradient(135deg, #ef4444, #f97316)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 12px rgba(239,68,68,0.3)' }}>
              <Shield className="h-4 w-4" style={{ color: '#fff' }} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 15, fontWeight: 900, color: '#1a1a2e' }}>ConvoWork</span>
                <span style={{ fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 99, background: '#fef2f2', color: '#ef4444' }}>ADMIN</span>
              </div>
              <p style={{ fontSize: 11, color: '#94a3b8' }}>{firstName} · {openCases.length} open cases</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <button onClick={() => { setEmpPanelOpen(true); loadEmployees() }} style={{ height: 30, padding: '0 10px', borderRadius: 7, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, background: '#eef2ff', color: '#4f46e5', border: '1px solid #c7d2fe', cursor: 'pointer' }}>
              <Users className="h-3 w-3" /> Team
            </button>
            {hasMockCases ? (
              <button onClick={handleResetDemo} disabled={resetting} style={{ height: 30, padding: '0 10px', borderRadius: 7, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', cursor: 'pointer', opacity: resetting ? 0.5 : 1 }}>
                <RefreshCw className={`h-3 w-3 ${resetting ? 'animate-spin' : ''}`} /> {resetting ? 'Resetting...' : 'Reset Demo'}
              </button>
            ) : (
              <button onClick={handleSeedDemo} disabled={resetting} style={{ height: 30, padding: '0 10px', borderRadius: 7, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, background: '#f0fdf4', color: '#16a34a', border: '1px solid #86efac', cursor: 'pointer', opacity: resetting ? 0.5 : 1 }}>
                <Plus className={`h-3 w-3 ${resetting ? 'animate-spin' : ''}`} /> {resetting ? 'Loading...' : 'Load Demo Cases'}
              </button>
            )}
            <NotificationBell notifications={notifList} unreadCount={unreadCount} onMarkAllRead={markAllRead} />
            <button onClick={handleSignOut} style={{ height: 30, width: 30, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer' }}>
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </header>

        {/* Dashboard content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px' }}>
          <KPICards data={kpi} activeFilter={null} onFilter={() => {}} />

          {/* Quick filters — each sends chat message */}
          <div style={{ marginTop: 12 }}>
            <QuickFilters onFilter={sendChatMessage} />
          </div>

          {/* Table container with dynamic tabs */}
          <div style={{ marginTop: 12, background: '#fff', borderRadius: 14, border: '1px solid #e8e8f0', overflow: 'hidden', boxShadow: '0 1px 8px rgba(0,0,0,0.03)' }}>
            <DynamicTabs
              tabs={tabs}
              activeTabId={activeTabId}
              onTabClick={setActiveTabId}
              onTabClose={(id) => { setTabs(prev => prev.filter(t => t.id !== id)); if (activeTabId === id) setActiveTabId('all') }}
              onAIReview={handleAIReview}
              onApproveAllSafe={handleApproveAllSafe}
              aiVerdicts={aiVerdicts}
            />
            {casesLoading ? (
              <div style={{ padding: 48, textAlign: 'center' }}><p style={{ fontSize: 14, color: '#94a3b8' }}>Loading...</p></div>
            ) : (
              <CaseTableAdmin
                cases={displayCases}
                onCaseClick={setSelectedCase}
                onApprove={handleApproveViaChat}
                onFilterByType={sendChatMessage}
                aiVerdicts={aiVerdicts}
                reviewingCaseIds={reviewingCaseIds}
              />
            )}
            <div style={{ padding: '8px 16px', borderTop: '1px solid #f0f0f5', background: '#fafafc' }}>
              <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>
                {displayCases.length} cases · Click type/dept to filter · Click row for AI analysis
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ RIGHT: AI CHAT ═══ */}
      <div style={{ width: 440, flexShrink: 0, display: 'flex', flexDirection: 'column', background: '#fafaff', borderLeft: '1px solid #e8e8f0' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid #e8e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'linear-gradient(135deg, rgba(99,102,241,0.04), rgba(139,92,246,0.02))' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ height: 24, width: 24, borderRadius: 6, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Sparkles className="h-3 w-3" style={{ color: '#fff' }} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 800, color: '#1a1a2e' }}>AI Command</span>
            {isLoading && <motion.div style={{ height: 5, width: 5, borderRadius: '50%', background: '#ef4444' }} animate={{ scale: [1, 1.3, 1] }} transition={{ repeat: Infinity, duration: 1 }} />}
          </div>
          <button onClick={handleNewChat} style={{ height: 24, width: 24, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', background: '#f1f5f9', border: 'none', cursor: 'pointer' }}>
            <Plus className="h-3 w-3" />
          </button>
        </div>

        <div ref={chatScrollRef} style={{ flex: 1, overflowY: 'auto' }}>
          {visibleMessages.length === 0 ? (
            <div style={{ padding: '28px 14px', textAlign: 'center' }}>
              <Sparkles className="h-6 w-6 mx-auto" style={{ color: '#c7d2fe', marginBottom: 6 }} />
              <p style={{ fontSize: 13, fontWeight: 700, color: '#475569' }}>AI Ready</p>
              <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>Type a filter, review, or approve command</p>
            </div>
          ) : (
            <div style={{ padding: '4px 0' }}>
              {visibleMessages.map((msg, i) => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  isStreaming={isLoading && i === visibleMessages.length - 1 && msg.role === 'assistant'}
                  onSend={(text) => sendChatMessage(text)}
                  suppressCards={['CaseTable', 'ProactiveAlertCard', 'TrendCard', 'ReviewTrigger', 'CaseCard', 'CaseStatusCard', 'ConfirmCard']}
                />
              ))}
              <AnimatePresence>
                {isLoading && visibleMessages.length > 0 && visibleMessages[visibleMessages.length - 1].role === 'user' && (
                  <TypingRow key="typing" isAdmin />
                )}
              </AnimatePresence>
              <div style={{ height: 6 }} />
            </div>
          )}
        </div>

        {/* Quick action chips */}
        <div style={{ padding: '5px 10px', display: 'flex', gap: 4, flexWrap: 'wrap', borderTop: '1px solid #f0f0f5' }}>
          {[
            { label: 'Review PTO', msg: 'Show all PTO cases' },
            { label: 'Personal', msg: 'Show all Personal leave cases' },
            { label: 'Missing docs', msg: 'Show cases with missing documents' },
            { label: 'Starting tomorrow', msg: 'Show cases where leave starts tomorrow' },
            { label: 'Patterns', msg: 'Check for suspicious leave patterns' },
            { label: 'Coverage', msg: 'Show team coverage for next week' },
            { label: 'Triage', msg: 'What needs my attention today?' },
          ].map(a => (
            <button key={a.label} onClick={() => sendChatMessage(a.msg)} style={{ fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 99, border: '1px solid #e8e8f0', background: '#fff', color: '#6366f1', cursor: 'pointer' }}>
              {a.label}
            </button>
          ))}
        </div>

        <div style={{ padding: '6px 10px 10px' }}>
          <ChatInput input={input} isLoading={isLoading} onInputChange={(e) => setInput(e.target.value)} onSubmit={handleSend} placeholder="Filter, review, approve..." pendingFile={pendingFile} onFileAttach={setPendingFile} hideUpload />
        </div>
      </div>

      {/* Slide-over */}
      <AnimatePresence>
        {selectedCase && (
          <CaseSlideOver caseData={selectedCase} onClose={() => setSelectedCase(null)} onApprove={(id) => handleApproveViaChat(id)} onReject={(id, reason) => handleRejectViaChat(id, reason)} />
        )}
      </AnimatePresence>

      {/* AI Review Dialog */}
      <AnimatePresence>
        {reviewDialogOpen && (
          <AIReviewDialog
            open={reviewDialogOpen}
            onClose={() => setReviewDialogOpen(false)}
            caseIds={reviewCaseIds}
            tabName={reviewTabName}
            onAction={sendChatMessage}
          />
        )}
      </AnimatePresence>

      {/* Employee panel */}
      <AnimatePresence>
        {empPanelOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setEmpPanelOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 60 }} />
            <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', stiffness: 300, damping: 30 }} style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 360, zIndex: 70, background: '#fff', boxShadow: '-8px 0 32px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #ebebf0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ fontSize: 14, fontWeight: 800, color: '#1a1a2e' }}>Manage Team</p>
                <button onClick={() => setEmpPanelOpen(false)} style={{ height: 26, width: 26, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', background: '#f1f5f9', border: 'none', cursor: 'pointer' }}><X className="h-3.5 w-3.5" /></button>
              </div>
              <div style={{ padding: '6px 16px', borderBottom: '1px solid #f0f0f5' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: 7, background: '#f8f9fc', border: '1px solid #e8e8f0' }}>
                  <Search className="h-3 w-3" style={{ color: '#94a3b8' }} />
                  <input value={empSearch} onChange={(e) => setEmpSearch(e.target.value)} placeholder="Search..." style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: '#1a1a2e' }} />
                </div>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '4px 8px' }}>
                {empLoading ? <p style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>Loading...</p> : (
                  allEmployees.filter(e => !empSearch || e.name.toLowerCase().includes(empSearch.toLowerCase())).map(emp => {
                    const managed = managedIds.length === 0 || managedIds.includes(emp.uid)
                    return (
                      <div key={emp.uid} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 7, marginBottom: 2, background: managed ? '#f0fdf4' : '#fff', border: managed ? '1px solid #86efac' : '1px solid #f0f0f5' }}>
                        <div style={{ height: 26, width: 26, borderRadius: 6, background: managed ? '#dcfce7' : '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: managed ? '#16a34a' : '#64748b', flexShrink: 0 }}>{emp.name.split(' ').map(n => n[0]).join('').slice(0, 2)}</div>
                        <div style={{ flex: 1, minWidth: 0 }}><p style={{ fontSize: 12, fontWeight: 700, color: '#1a1a2e' }}>{emp.name}</p><p style={{ fontSize: 10, color: '#94a3b8' }}>{emp.department}</p></div>
                        <button onClick={() => toggleEmployee(emp.uid)} style={{ height: 24, padding: '0 8px', borderRadius: 5, fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 2, border: 'none', cursor: 'pointer', background: managed ? '#fee2e2' : '#dcfce7', color: managed ? '#dc2626' : '#16a34a' }}>
                          {managed ? <><UserMinus className="h-2.5 w-2.5" />Remove</> : <><UserPlus className="h-2.5 w-2.5" />Add</>}
                        </button>
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
