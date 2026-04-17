'use client'

import { useState, useEffect, useRef } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, type UIMessage } from 'ai'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '@/context/AuthContext'
import { useNotifications } from '@/hooks/useNotifications'
import { MessageBubble, TypingRow } from '@/components/chat/MessageBubble'
import { ChatInput, type PendingDoc } from '@/components/chat/ChatInput'
import { BorderBeam } from '@/components/ui/border-beam'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Bell, LogOut, ChevronRight,
  Wallet, Calendar, FileText, HelpCircle, Sparkles,
  Menu, X, Plus,
} from 'lucide-react'
import toast, { Toaster } from 'react-hot-toast'
import { useRouter } from 'next/navigation'
import type { NotificationDoc } from '@/lib/firebase/types'

const employeeTransport = new DefaultChatTransport({ api: '/api/chat' })

const FEATURE_CARDS = [
  { icon: Wallet,     color: '#818cf8', label: 'Check Balance',  desc: 'Days remaining per type',  message: 'Show my leave balance',             hint: 'PTO, Sick, Personal…' },
  { icon: Calendar,   color: '#34d399', label: 'Apply Leave',    desc: 'Request time off instantly', message: 'I want to apply for leave',          hint: 'Any type, any date' },
  { icon: FileText,   color: '#fbbf24', label: 'My Requests',    desc: 'History & live status',     message: 'Show all my leave requests',          hint: 'Open · Approved · All' },
  { icon: HelpCircle, color: '#c084fc', label: 'Leave Policies', desc: 'Know your rights',          message: 'What leave types are available?',     hint: 'FMLA, Bereavement…' },
]

const SECONDARY_ACTIONS = [
  { label: 'Cancel a leave',    message: 'I want to cancel a leave request' },
  { label: 'Team calendar',     message: 'Show who is out in my department' },
  { label: 'FMLA eligibility',  message: 'Am I eligible for FMLA?' },
  { label: 'Company holidays',  message: 'Show company holidays' },
]

const TYPING_EXAMPLES = [
  "I have a wedding to attend this Friday, need a day off",
  "Feeling really sick today, won't be able to come in",
  "My parents are visiting next week, need Monday to Wednesday off",
  "Planning a trip to Goa, need 3 days PTO from next Monday",
  "My daughter has her annual day at school tomorrow",
  "Have a doctor appointment tomorrow morning, need the day off",
  "Going on a family vacation for 5 days starting April 28",
  "Not feeling great, headache since last night, need today off",
  "My sister is moving to a new apartment, need tomorrow off to help",
  "Taking the family out for a short trip this weekend, need Friday off",
]

function getGreeting(name: string) {
  const h = new Date().getHours()
  const first = name.split(' ')[0]
  if (h < 12) return { time: 'Good morning', name: first }
  if (h < 17) return { time: 'Good afternoon', name: first }
  return { time: 'Good evening', name: first }
}

// ── Dark sidebar token shorthand ─────────────────────────────────────────────
const S = {
  bg:          '#080811',        // base
  bgHover:     'rgba(255,255,255,0.05)',
  bgActive:    'rgba(129,140,248,0.15)',
  border:      'rgba(255,255,255,0.07)',
  text:        'rgba(255,255,255,0.90)',
  textMuted:   'rgba(255,255,255,0.42)',
  textDim:     'rgba(255,255,255,0.22)',
  brand:       '#818cf8',
}

function useTypewriter(texts: string[], typingSpeed = 45, pauseMs = 2000) {
  const [display, setDisplay] = useState('')
  const [idx, setIdx] = useState(0)
  const [charIdx, setCharIdx] = useState(0)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    const current = texts[idx % texts.length]
    let timer: ReturnType<typeof setTimeout>

    if (!isDeleting && charIdx < current.length) {
      timer = setTimeout(() => setCharIdx(c => c + 1), typingSpeed)
    } else if (!isDeleting && charIdx === current.length) {
      timer = setTimeout(() => setIsDeleting(true), pauseMs)
    } else if (isDeleting && charIdx > 0) {
      timer = setTimeout(() => setCharIdx(c => c - 1), typingSpeed / 2)
    } else {
      setIsDeleting(false)
      setIdx(i => (i + 1) % texts.length)
    }

    setDisplay(current.slice(0, charIdx))
    return () => clearTimeout(timer)
  }, [charIdx, isDeleting, idx, texts, typingSpeed, pauseMs])

  return display
}

function extractPlainText(message: UIMessage): string {
  return (message.parts ?? [])
    .filter((part): part is Extract<UIMessage['parts'][number], { type: 'text' }> => (
      part.type === 'text' && typeof part.text === 'string'
    ))
    .map((part) => {
      const idx = part.text.lastIndexOf('\n\n[DOC_VERIFIED:')
      return (idx !== -1 ? part.text.slice(0, idx) : part.text).trim()
    })
    .filter(Boolean)
    .join('\n')
}

function extractCardOutputs(message: UIMessage): Array<Record<string, unknown>> {
  return (message.parts ?? [])
    .filter((part): part is Extract<UIMessage['parts'][number], { type: string }> => (
      typeof part?.type === 'string' &&
      (part.type === 'dynamic-tool' || part.type.startsWith('tool-')) &&
      (part as { state?: string }).state === 'output-available' &&
      part.output != null &&
      typeof part.output === 'object' &&
      'ui_component' in part.output
    ))
    .map((part) => part.output as Record<string, unknown>)
}

type StoredDisplayMessage = {
  role: UIMessage['role']
  text: string
  cards: Array<Record<string, unknown>>
}

type StoredChatHistory = {
  version: 2
  messages: StoredDisplayMessage[]
}

function toStoredHistory(messages: UIMessage[], maxStored: number): StoredChatHistory {
  const storedMessages = messages
    .slice(-maxStored)
    .map((message) => {
      const text = extractPlainText(message)
      const cards = extractCardOutputs(message)
      if (!text && cards.length === 0) return null

      return {
        role: message.role,
        text,
        cards,
      } satisfies StoredDisplayMessage
    })
    .filter((message): message is StoredDisplayMessage => message !== null)

  return {
    version: 2,
    messages: storedMessages,
  }
}

function mergeStoredCards(
  nextMessages: StoredDisplayMessage[],
  previousMessages: StoredDisplayMessage[],
): StoredDisplayMessage[] {
  return nextMessages.map((message, index) => {
    if (message.cards.length > 0) return message

    const previous = previousMessages[index]
    if (!previous) return message
    if (previous.role !== message.role || previous.text !== message.text || previous.cards.length === 0) {
      return message
    }

    return {
      ...message,
      cards: previous.cards,
    }
  })
}

function toSafeMessages(messages: StoredDisplayMessage[]): UIMessage[] {
  return messages.flatMap((message) => {
    if (!message.text) return []

    return [{
      id: crypto.randomUUID(),
      role: message.role,
      parts: [{ type: 'text', text: message.text }],
    } satisfies UIMessage]
  })
}

function fromStoredMessages(value: unknown): StoredDisplayMessage[] {
  const rawMessages = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && Array.isArray((value as StoredChatHistory).messages)
      ? (value as StoredChatHistory).messages
      : null

  if (!rawMessages) return []

  return rawMessages.flatMap((item) => {
    if (!item || typeof item !== 'object') return []

    const maybeMessage = item as Partial<StoredDisplayMessage> & Partial<UIMessage> & { content?: unknown }
    const role = maybeMessage.role
    if (role !== 'user' && role !== 'assistant' && role !== 'system') return []

    const text = typeof maybeMessage.text === 'string'
      ? maybeMessage.text.trim()
      : typeof maybeMessage.content === 'string'
        ? maybeMessage.content.trim()
        : Array.isArray(maybeMessage.parts)
        ? maybeMessage.parts
          .filter((part): part is Extract<UIMessage['parts'][number], { type: 'text' }> => (
            part.type === 'text' && typeof part.text === 'string'
          ))
          .map((part) => part.text.trim())
          .filter(Boolean)
          .join('\n')
        : ''

    const cards = Array.isArray(maybeMessage.cards)
      ? maybeMessage.cards.filter((card): card is Record<string, unknown> => (
        !!card &&
        typeof card === 'object' &&
        'ui_component' in card
      ))
      : []

    if (!text && cards.length === 0) return []

    return [{
      role,
      text,
      cards,
    } satisfies StoredDisplayMessage]
  })
}

function createDisplayMessages(messages: UIMessage[], storedMessages: StoredDisplayMessage[]): UIMessage[] {
  return messages.map((message, index) => {
    const stored = storedMessages[index]
    const text = extractPlainText(message)
    const liveCards = extractCardOutputs(message)

    if (!stored || stored.role !== message.role || stored.text !== text || liveCards.length > 0 || stored.cards.length === 0) {
      return message
    }

    return {
      ...message,
      parts: [
        ...(message.parts ?? []),
        ...stored.cards.map((card, cardIndex) => ({
          type: 'dynamic-tool',
          toolCallId: `restored-${index}-${cardIndex}`,
          state: 'output-available',
          output: card,
        })),
      ],
    } as UIMessage
  })
}

function getInitialStoredDisplayMessages(storageKey: string): StoredDisplayMessage[] {
  if (typeof window === 'undefined') return []

  try {
    const saved = window.localStorage.getItem(storageKey)
    return saved ? fromStoredMessages(JSON.parse(saved)) : []
  } catch {
    return []
  }
}

export default function EmployeeChatPage() {
  const router = useRouter()
  const { profile, signOut } = useAuth()
  const typedText = useTypewriter(TYPING_EXAMPLES, 40, 2200)
  const { notifications, unreadCount } = useNotifications(profile?.uid)
  const [input, setInput] = useState('')
  const [pendingFile, setPendingFile] = useState<PendingDoc | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  const STORAGE_KEY = 'convowork_chat_history'
  const MAX_STORED = 15
  const [storedDisplayMessages, setStoredDisplayMessages] = useState<StoredDisplayMessage[]>(
    () => getInitialStoredDisplayMessages(STORAGE_KEY)
  )

  const { messages, sendMessage, status, setMessages } = useChat({
    transport: employeeTransport,
    onError: (err) => toast.error(err.message ?? 'Something went wrong', { duration: 4000 }),
  })

  const isLoading = status === 'streaming' || status === 'submitted'
  const showTypingRow =
    isLoading && messages.length > 0 && messages[messages.length - 1].role === 'user'

  // Restore from localStorage on mount
  const restoredRef = useRef(false)
  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true
    try {
      if (storedDisplayMessages.length > 0) {
        const safeMessages = toSafeMessages(storedDisplayMessages)
        if (safeMessages.length > 0) {
          setMessages(safeMessages)
        }
      } else {
        localStorage.removeItem(STORAGE_KEY)
      }
    } catch { /* ignore corrupt localStorage */ }
  }, [setMessages, storedDisplayMessages, STORAGE_KEY])

  // Save to localStorage — only after streaming completes, debounced 500ms
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (messages.length === 0 || isLoading) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      try {
        const safeHistory = toStoredHistory(messages, MAX_STORED)
        const mergedMessages = mergeStoredCards(safeHistory.messages, storedDisplayMessages)
        if (safeHistory.messages.length > 0) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({
            ...safeHistory,
            messages: mergedMessages,
          }))
          setStoredDisplayMessages(mergedMessages)
        } else {
          localStorage.removeItem(STORAGE_KEY)
          setStoredDisplayMessages([])
        }
      } catch { /* storage full */ }
    }, 500)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [messages, isLoading, storedDisplayMessages])

  function handleNewChat() {
    setMessages([])
    localStorage.removeItem(STORAGE_KEY)
    setStoredDisplayMessages([])
    setInput('')
    setPendingFile(null)
  }

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, showTypingRow])

  useEffect(() => {
    const unread = notifications.filter((n: NotificationDoc) => !n.read && !n.dismissed)
    if (unread.length > 0) {
      const latest = unread[0]
      if (latest.type === 'case_approved') toast.success(latest.message, { duration: 5000 })
      else if (latest.type === 'case_rejected') toast.error(latest.message, { duration: 5000 })
    }
  }, [notifications.length]) // eslint-disable-line

  function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (pendingFile?.state === 'processing') return
    if (!input.trim() && !pendingFile) return

    if (pendingFile && pendingFile.result) {
      const r = pendingFile.result
      const compact = JSON.stringify({
        isValid: r.isValid,
        fileName: pendingFile.name,
        patientName: r.patientName ?? null,
        doctorName: r.doctorName ?? null,
        hospital: r.hospital ?? null,
        recommendedRestStart: r.recommendedRestStart ?? null,
        recommendedRestEnd: r.recommendedRestEnd ?? null,
        diagnosisType: r.diagnosisType ?? null,
        signatureDetected: r.signatureDetected ?? false,
        confidenceScore: r.confidenceScore ?? 0,
        documentType: r.documentType ?? 'other',
        invalidReason: r.invalidReason ?? null,
        checks: r.checks ?? {},
        failureReasons: r.failureReasons ?? [],
        fileUrl: r.fileUrl ?? null,
      })
      sendMessage({ text: `${input || 'Here is my document.'}\n\n[DOC_VERIFIED: ${compact}]` })
      setPendingFile(null)
    } else {
      sendMessage({ text: input })
    }
    setInput('')
  }

  function handleChip(msg: string) {
    sendMessage({ text: msg })
    setMobileSidebarOpen(false)
  }

  async function handleSignOut() { await signOut(); router.push('/login') }

  const firstName = profile?.name?.split(' ')[0] ?? 'there'
  const initials = profile?.name?.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() ?? 'U'
  const g = profile?.name ? getGreeting(profile.name) : { time: 'Hey', name: firstName }
  const displayMessages = createDisplayMessages(messages, storedDisplayMessages)

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Toaster
        position="top-right"
        toastOptions={{
          className: 'text-sm font-medium',
          style: { borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)' },
        }}
      />

      {/* ── Mobile overlay ── */}
      <AnimatePresence>
        {mobileSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setMobileSidebarOpen(false)}
            className="fixed inset-0 z-40 lg:hidden"
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          />
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════
          DARK SIDEBAR
      ═══════════════════════════════════════════ */}
      <aside
        className={`
          fixed lg:relative inset-y-0 left-0 z-50 lg:z-auto
          flex flex-col w-64 shrink-0
          transition-transform duration-300 ease-in-out
          ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
        style={{ background: S.bg, borderRight: `1px solid ${S.border}` }}
      >
        {/* Brand */}
        <div
          className="px-5 py-5 flex items-center justify-between"
          style={{
            borderBottom: `1px solid ${S.border}`,
            background: 'linear-gradient(135deg, rgba(129,140,248,0.12) 0%, rgba(192,132,252,0.06) 100%)',
          }}
        >
          <div className="flex items-center gap-3">
            <div className="relative shrink-0">
              <div
                className="h-9 w-9 rounded-[11px] flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  boxShadow: '0 4px 20px rgba(99,102,241,0.45)',
                }}
              >
                <Sparkles className="h-[17px] w-[17px] text-white" />
              </div>
              <span
                className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2"
                style={{ background: '#34d399', borderColor: S.bg }}
              />
            </div>
            <div>
              <p className="text-sm font-black tracking-tight" style={{ color: S.text }}>ConvoWork</p>
              <p className="text-[11px]" style={{ color: S.textMuted }}>AI Leave Assistant</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {/* New Chat */}
            <button
              onClick={handleNewChat}
              title="New Chat"
              className="h-7 w-7 rounded-lg flex items-center justify-center transition-all"
              style={{ color: S.textMuted, background: S.bgHover }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#818cf830'; (e.currentTarget as HTMLButtonElement).style.color = '#818cf8' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = S.bgHover; (e.currentTarget as HTMLButtonElement).style.color = S.textMuted }}
            >
              <Plus className="h-4 w-4" />
            </button>
            {/* Mobile close */}
            <button
              onClick={() => setMobileSidebarOpen(false)}
              className="lg:hidden h-7 w-7 rounded-lg flex items-center justify-center transition-colors"
              style={{ color: S.textMuted }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Nav */}
        <div className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
          {/* Quick Actions */}
          <div>
            <p
              className="text-[10px] font-bold uppercase tracking-widest px-3 mb-2"
              style={{ color: S.textDim }}
            >
              Quick Actions
            </p>
            <div className="space-y-0.5">
              {FEATURE_CARDS.map(({ icon: Icon, color, label, desc, message }) => (
                <button
                  key={label}
                  onClick={() => handleChip(message)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left group transition-all active:scale-[0.98]"
                  style={{ color: S.text }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = S.bgHover }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                >
                  <div
                    className="h-8 w-8 rounded-[9px] flex items-center justify-center shrink-0"
                    style={{ background: `${color}20`, border: `1px solid ${color}35` }}
                  >
                    <Icon className="h-[14px] w-[14px]" style={{ color }} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold leading-tight truncate">{label}</p>
                    <p className="text-[11px] leading-tight truncate" style={{ color: S.textMuted }}>{desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* More */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest px-3 mb-2" style={{ color: S.textDim }}>
              More
            </p>
            <div className="space-y-0.5">
              {SECONDARY_ACTIONS.map(({ label, message }) => (
                <button
                  key={label}
                  onClick={() => handleChip(message)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-left transition-all"
                  style={{ color: S.textMuted }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = S.bgHover; (e.currentTarget as HTMLButtonElement).style.color = S.text }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = S.textMuted }}
                >
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-30" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Profile */}
        <div className="p-3" style={{ borderTop: `1px solid ${S.border}` }}>
          <div
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-default"
          >
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarFallback
                className="text-xs font-bold"
                style={{ background: 'rgba(129,140,248,0.2)', color: S.brand }}
              >
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate leading-tight" style={{ color: S.text }}>
                {profile?.name ?? 'Employee'}
              </p>
              <p className="text-[11px] truncate" style={{ color: S.textMuted }}>
                {profile?.jobTitle ?? profile?.department ?? 'Employee'}
              </p>
            </div>
            <button
              onClick={handleSignOut}
              title="Sign out"
              className="h-7 w-7 rounded-lg flex items-center justify-center transition-colors shrink-0"
              style={{ color: S.textMuted }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#f87171' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = S.textMuted }}
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* ═══════════════════════════════════════════
          MAIN AREA
      ═══════════════════════════════════════════ */}
      <div className="flex flex-col flex-1 min-w-0 relative overflow-hidden">

        {/* Subtle gradient background */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(180deg, rgba(99,102,241,0.03) 0%, transparent 40%, rgba(139,92,246,0.02) 100%)',
          }}
        />

        {/* ── Header ── */}
        <header
          className="relative z-20 flex items-center justify-between px-4 lg:px-6 py-3 sticky top-0"
          style={{
            background: 'rgba(255,255,255,0.92)',
            backdropFilter: 'blur(16px) saturate(1.2)',
            borderBottom: '1px solid #ebebf0',
          }}
        >
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileSidebarOpen(true)}
              className="lg:hidden h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="hidden lg:flex items-center gap-2">
              {isLoading ? (
                <>
                  <motion.div
                    className="h-2 w-2 rounded-full"
                    style={{ background: '#818cf8' }}
                    animate={{ scale: [1, 1.4, 1], opacity: [0.7, 1, 0.7] }}
                    transition={{ repeat: Infinity, duration: 1.2 }}
                  />
                  <span className="text-sm text-muted-foreground font-medium">Thinking…</span>
                </>
              ) : messages.length === 0 ? (
                <>
                  <div className="h-2 w-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/60" />
                  <span className="text-sm font-semibold text-muted-foreground">
                    {g.time}, <span className="text-foreground">{g.name}</span>
                  </span>
                </>
              ) : (
                <>
                  <div className="h-2 w-2 rounded-full bg-emerald-400" />
                  <span className="text-sm text-muted-foreground font-medium">Ready</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button className="relative h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors">
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span
                  className="absolute -top-0.5 -right-0.5 h-4 w-4 flex items-center justify-center text-white text-[9px] font-bold rounded-full"
                  style={{ background: '#6366f1' }}
                >
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            <div className="lg:hidden">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="text-[10px] font-bold bg-brand/15 text-brand">{initials}</AvatarFallback>
              </Avatar>
            </div>
          </div>
        </header>

        {/* ── Chat / Empty ── */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto relative z-10">
          <div className="max-w-5xl mx-auto w-full px-4 lg:px-6">

            {/* ─── EMPTY STATE ─── */}
            <AnimatePresence>
              {messages.length === 0 && (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3 }}
                  className="flex flex-col items-center justify-center min-h-[calc(100vh-130px)] py-12 select-none"
                >
                  {/* Logo + rings */}
                  <motion.div
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.04, type: 'spring', stiffness: 200, damping: 16 }}
                    className="relative mb-8"
                  >
                    {/* Pulsing glow rings */}
                    {[1, 1.55, 2.1].map((scale, i) => (
                      <motion.div
                        key={i}
                        className="absolute rounded-[32px]"
                        style={{
                          inset: `${-12 - i * 10}px`,
                          background: 'radial-gradient(circle, rgba(99,102,241,0.18) 0%, transparent 70%)',
                        }}
                        animate={{ scale: [1, scale, 1], opacity: [0.5, 0, 0.5] }}
                        transition={{ repeat: Infinity, duration: 3 + i * 0.5, ease: 'easeInOut', delay: i * 0.3 }}
                      />
                    ))}

                    <div
                      className="relative h-[84px] w-[84px] rounded-[26px] flex items-center justify-center overflow-hidden"
                      style={{
                        background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a78bfa 100%)',
                        boxShadow: '0 20px 60px rgba(99,102,241,0.45), 0 4px 16px rgba(99,102,241,0.3)',
                      }}
                    >
                      <Sparkles className="h-9 w-9 text-white relative z-10" />
                      <BorderBeam size={60} duration={3} colorFrom="#fff" colorTo="rgba(255,255,255,0.3)" borderWidth={2} />
                    </div>

                    <motion.div
                      className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full border-[3px] border-background"
                      style={{ background: '#34d399', boxShadow: '0 0 12px rgba(52,211,153,0.6)' }}
                      animate={{ scale: [1, 1.25, 1] }}
                      transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut' }}
                    />
                  </motion.div>

                  {/* Heading */}
                  <motion.div
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1, duration: 0.45 }}
                    className="text-center mb-9"
                  >
                    <h1 className="text-[34px] lg:text-[42px] font-black tracking-tight leading-[1.1] mb-3">
                      {g.time},{' '}
                      <span
                        style={{
                          background: 'linear-gradient(135deg, #6366f1 0%, #a78bfa 50%, #c084fc 100%)',
                          WebkitBackgroundClip: 'text',
                          WebkitTextFillColor: 'transparent',
                          backgroundClip: 'text',
                        }}
                      >
                        {g.name}
                      </span>{' '}
                      👋
                    </h1>
                    <p style={{ fontSize: 16, color: '#64748b', maxWidth: 360, margin: '0 auto', lineHeight: 1.6, fontWeight: 500 }}>
                      Your AI-powered leave assistant — ask anything, I'll handle it instantly.
                    </p>
                  </motion.div>

                  {/* Feature cards */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.18, duration: 0.4 }}
                    className="w-full grid grid-cols-2 lg:grid-cols-4 gap-3 mb-7"
                  >
                    {FEATURE_CARDS.map(({ icon: Icon, color, label, desc, hint, message }, idx) => (
                      <motion.button
                        key={label}
                        initial={{ opacity: 0, y: 18 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.22 + idx * 0.06, type: 'spring', stiffness: 250, damping: 22 }}
                        whileHover={{ y: -5, scale: 1.03 }}
                        whileTap={{ scale: 0.96 }}
                        onClick={() => handleChip(message)}
                        className="relative flex flex-col gap-3 p-4 rounded-2xl text-left overflow-hidden cursor-pointer"
                        style={{
                          background: 'rgba(255,255,255,0.82)',
                          border: `1.5px solid ${color}28`,
                          borderTop: `2.5px solid ${color}`,
                          boxShadow: `0 8px 32px -6px ${color}30, 0 2px 8px rgba(0,0,0,0.05)`,
                          backdropFilter: 'blur(8px)',
                        }}
                      >
                        {/* Corner glow */}
                        <div
                          className="absolute -top-6 -right-6 h-24 w-24 rounded-full blur-2xl opacity-50 pointer-events-none"
                          style={{ background: color }}
                        />
                        {/* Icon */}
                        <div
                          className="relative z-10 h-11 w-11 rounded-xl flex items-center justify-center"
                          style={{
                            background: `linear-gradient(135deg, ${color}, ${color}cc)`,
                            boxShadow: `0 4px 14px ${color}40`,
                          }}
                        >
                          <Icon className="h-5 w-5" style={{ color: '#fff' }} />
                        </div>
                        {/* Text */}
                        <div className="relative z-10">
                          <p style={{ fontSize: 14, fontWeight: 800, color: '#1a1a2e', lineHeight: 1.3 }}>{label}</p>
                          <p style={{ fontSize: 12, color: '#64748b', marginTop: 4, lineHeight: 1.4, fontWeight: 500 }}>{desc}</p>
                          <p style={{ fontSize: 11, fontWeight: 700, marginTop: 8, color }}>{hint}</p>
                        </div>
                      </motion.button>
                    ))}
                  </motion.div>

                  {/* Typewriter example */}
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.35, duration: 0.4 }}
                    className="w-full"
                    style={{ maxWidth: 560, margin: '0 auto' }}
                  >
                    <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#b0b0c0', marginBottom: 10, textAlign: 'center' }}>
                      Just type what you need
                    </p>
                    <div
                      style={{
                        background: '#fff',
                        border: '1.5px solid #e0e0ea',
                        borderRadius: 16,
                        padding: '16px 20px',
                        minHeight: 54,
                        boxShadow: '0 2px 16px rgba(0,0,0,0.06)',
                        display: 'flex',
                        alignItems: 'center',
                        cursor: 'text',
                      }}
                      onClick={() => {
                        const el = document.querySelector<HTMLTextAreaElement>('textarea')
                        if (el) el.focus()
                      }}
                    >
                      <span style={{ fontSize: 18, color: '#1a1a2e', fontWeight: 500, lineHeight: 1.5 }}>
                        {typedText}
                      </span>
                      <span
                        style={{
                          display: 'inline-block',
                          width: 2.5,
                          height: 24,
                          background: '#6366f1',
                          marginLeft: 1,
                          borderRadius: 1,
                          animation: 'blink 1s step-end infinite',
                        }}
                      />
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ─── MESSAGES ─── */}
            {displayMessages.length > 0 && (
              <div className="py-6 space-y-0.5">
                {displayMessages.map((message, i) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    isStreaming={isLoading && i === messages.length - 1 && message.role === 'assistant'}
                    onSend={(text) => sendMessage({ text })}
                  />
                ))}
                <AnimatePresence>
                  {showTypingRow && <TypingRow key="typing" />}
                </AnimatePresence>
                <div className="h-6" />
              </div>
            )}
          </div>
        </div>

        {/* ── Input bar ── */}
        <div
          className="relative z-20"
          style={{
            background: 'rgba(255,255,255,0.95)',
            backdropFilter: 'blur(16px) saturate(1.2)',
            borderTop: '1px solid #ebebf0',
          }}
        >
          <div className="max-w-5xl mx-auto px-4 lg:px-6 pb-5 pt-3">
            <ChatInput
              input={input}
              isLoading={isLoading}
              onInputChange={(e) => setInput(e.target.value)}
              onSubmit={handleSend}
              placeholder="Ask anything — leave, balance, policies…"
              pendingFile={pendingFile}
              onFileAttach={setPendingFile}
            />
            <p style={{ fontSize: 11, color: '#c0c0d0', textAlign: 'center' as const, marginTop: 8, userSelect: 'none' as const }}>
              <kbd style={{ fontSize: 10, padding: '2px 6px', background: '#f8f8fc', borderRadius: 4, border: '1px solid #e8e8f0', color: '#94a3b8' }}>Enter</kbd> send ·{' '}
              <kbd style={{ fontSize: 10, padding: '2px 6px', background: '#f8f8fc', borderRadius: 4, border: '1px solid #e8e8f0', color: '#94a3b8' }}>Shift+Enter</kbd> new line · drag image or PDF to attach
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
