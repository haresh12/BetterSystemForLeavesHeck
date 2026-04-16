'use client'

import { useState, useEffect, useRef } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '@/context/AuthContext'
import { useNotifications } from '@/hooks/useNotifications'
import { useCaseQueue } from '@/hooks/useCaseQueue'
import { MessageBubble, TypingRow } from '@/components/chat/MessageBubble'
import { ChatInput, type PendingDoc } from '@/components/chat/ChatInput'
import { ADMIN_QUICK_ACTIONS } from '@/components/chat/QuickActions'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  MessageSquare, Bell, LogOut, ChevronDown,
  Clock, FileText, Zap, Settings,
} from 'lucide-react'
import toast, { Toaster } from 'react-hot-toast'
import { useRouter } from 'next/navigation'

const adminTransport = new DefaultChatTransport({ api: '/api/admin-chat' })

export default function AdminDashboardPage() {
  const router = useRouter()
  const { profile, signOut } = useAuth()
  const { notifications: _n, unreadCount } = useNotifications(profile?.uid)
  const { summary, loading: queueLoading } = useCaseQueue(profile?.managedEmployeeIds)
  const [input, setInput] = useState('')
  const [pendingFile, setPendingFile] = useState<PendingDoc | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showQuickActions, setShowQuickActions] = useState(false)
  const [triageDone, setTriageDone] = useState(false)
  const [userHasSentMessage, setUserHasSentMessage] = useState(false)

  const { messages, sendMessage, status } = useChat({
    transport: adminTransport,
    onError: (err) => toast.error(err.message ?? 'Something went wrong'),
  })

  const isLoading = status === 'streaming' || status === 'submitted'

  // Standalone typing indicator
  const visibleMessages = messages.filter(
    (m) => !(m.role === 'user' && m.parts.some((p) => p.type === 'text' && (p as any).text === '__PROACTIVE_SCAN__')),
  )
  const showTypingRow =
    isLoading &&
    visibleMessages.length > 0 &&
    visibleMessages[visibleMessages.length - 1].role === 'user'

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, showTypingRow])

  // Show quick actions after triage, hide on user message
  useEffect(() => {
    if (triageDone && messages.length > 0 && !userHasSentMessage) {
      setShowQuickActions(true)
    }
  }, [triageDone, messages.length, userHasSentMessage])

  // Proactive triage on load
  const sendMessageRef = useRef(sendMessage)
  sendMessageRef.current = sendMessage

  useEffect(() => {
    if (!triageDone && profile?.uid && status === 'ready') {
      setTriageDone(true)
      const t = setTimeout(() => sendMessageRef.current({ text: '__PROACTIVE_SCAN__' }), 800)
      return () => clearTimeout(t)
    }
  }, [profile?.uid, triageDone, status])

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
  }

  function handleQuickAction(message: string) {
    setUserHasSentMessage(true)
    setShowQuickActions(false)
    sendMessage({ text: message })
  }

  function handleFileAwareSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() && !pendingFile) return
    setUserHasSentMessage(true)
    setShowQuickActions(false)
    if (pendingFile) {
      sendMessage({ text: `${input || 'Reviewing this document.'}\n\n[DOCUMENT_ATTACHED: ${pendingFile.name}]\n[BASE64: ${pendingFile.base64}]` })
      setPendingFile(null)
    } else {
      sendMessage({ text: input })
    }
    setInput('')
  }

  async function handleSignOut() {
    await signOut()
    router.push('/login')
  }

  const initials = profile?.name?.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() ?? 'A'

  return (
    <div className="flex flex-col h-screen bg-background dark">
      <Toaster position="top-right" />

      {/* ── Header ── */}
      <header className="flex items-center justify-between px-4 sm:px-6 py-2.5 glass-panel">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-brand to-violet-700 flex items-center justify-center shadow-lg shadow-brand/20 border border-brand/20">
              <Zap className="h-4 w-4 text-white" />
            </div>
            <div className="leading-none">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold tracking-tight">ConvoWork</span>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 hidden sm:flex">Admin</Badge>
              </div>
              <p className="text-[10px] text-muted-foreground">{profile?.department}</p>
            </div>
          </div>

          <Separator orientation="vertical" className="h-5 hidden sm:block" />

          {/* Live queue stats */}
          {!queueLoading && (
            <div className="hidden sm:flex items-center gap-2 text-xs">
              <StatChip icon={<Clock className="h-3 w-3" />} color="text-brand" value={summary.openCount} label="Open" />
              <StatChip icon={<FileText className="h-3 w-3" />} color="text-amber-400" value={summary.pendingDocsCount} label="Docs" urgent={summary.pendingDocsCount > 0} />
              <StatChip icon={<Zap className="h-3 w-3" />} color="text-muted-foreground" value={summary.totalActive} label="Active" />
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="icon" className="relative h-8 w-8">
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-4 w-4 flex items-center justify-center bg-destructive text-white text-[10px] rounded-full font-bold">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2 h-8 px-2">
                <Avatar className="h-6 w-6">
                  <AvatarFallback className="text-[10px] bg-brand/20 text-brand font-semibold">{initials}</AvatarFallback>
                </Avatar>
                <span className="text-sm hidden sm:inline">{profile?.name?.split(' ')[0]}</span>
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <div className="px-2 py-1.5">
                <p className="text-sm font-medium">{profile?.name}</p>
                <p className="text-xs text-muted-foreground">{profile?.email}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem><Settings className="h-4 w-4 mr-2" /> Settings</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
                <LogOut className="h-4 w-4 mr-2" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* ── Chat area ── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-xl mx-auto">

          {/* Empty / scanning state */}
          <AnimatePresence>
            {visibleMessages.length === 0 && (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="flex flex-col items-center justify-center min-h-[calc(100vh-130px)] px-6 py-16 text-center"
              >
                <motion.div
                  initial={{ scale: 0.75, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.05, type: 'spring', stiffness: 200, damping: 18 }}
                  className="relative mb-8"
                >
                  <div className="h-20 w-20 rounded-3xl bg-gradient-to-br from-brand/20 to-violet-900/40 border border-brand/25 flex items-center justify-center">
                    <Zap className="h-9 w-9 text-brand" />
                  </div>
                  {[1, 1.4, 1.8].map((scale, i) => (
                    <motion.div
                      key={i}
                      className="absolute inset-0 rounded-3xl border border-brand/20"
                      animate={{ scale: [1, scale, 1], opacity: [0.6, 0, 0.6] }}
                      transition={{ repeat: Infinity, duration: 2.5, ease: 'easeOut', delay: i * 0.6 }}
                    />
                  ))}
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <h2 className="text-xl font-bold mb-2">Command Center</h2>
                  <p className="text-sm text-muted-foreground">Running morning intelligence scan…</p>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Messages */}
          {visibleMessages.length > 0 && (
            <div className="py-4">
              {visibleMessages.map((message, i) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  isStreaming={isLoading && i === messages.length - 1 && message.role === 'assistant'}
                />
              ))}
              <AnimatePresence>
                {showTypingRow && <TypingRow key="typing" isAdmin />}
              </AnimatePresence>
              <div className="h-4" />
            </div>
          )}
        </div>
      </div>

      {/* ── Input area ── */}
      <div className="glass-panel border-t-0 shadow-[0_-8px_24px_-8px_rgba(0,0,0,0.3)]">
        <div className="max-w-xl mx-auto px-4 pb-4 pt-3">
          {/* Quick action chips */}
          <AnimatePresence>
            {showQuickActions && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex gap-1.5 mb-2.5 overflow-x-auto no-scrollbar pb-0.5"
              >
                {ADMIN_QUICK_ACTIONS.map((action) => (
                  <button
                    key={action.message}
                    onClick={() => handleQuickAction(action.message)}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border/60 bg-muted/40 hover:bg-muted text-xs text-muted-foreground hover:text-foreground transition-colors font-medium"
                  >
                    {action.icon && <span>{action.icon}</span>}
                    {action.label}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <ChatInput
            input={input}
            isLoading={isLoading}
            onInputChange={handleInputChange}
            onSubmit={handleFileAwareSubmit}
            placeholder="Query cases, approve, reject, run analytics…"
            pendingFile={pendingFile}
            onFileAttach={setPendingFile}
          />
          <p className="text-[11px] text-center text-muted-foreground mt-1.5 select-none">
            <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">Enter</kbd> to send ·{' '}
            <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">Shift+Enter</kbd> new line
          </p>
        </div>
      </div>
    </div>
  )
}

function StatChip({
  icon, color, value, label, urgent = false,
}: {
  icon: React.ReactNode
  color: string
  value: number
  label: string
  urgent?: boolean
}) {
  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg ${urgent ? 'bg-amber-500/10' : 'bg-muted/40'}`}>
      <span className={color}>{icon}</span>
      <span className={`font-bold ${urgent ? 'text-amber-400' : ''}`}>{value}</span>
      <span className="text-muted-foreground">{label}</span>
    </div>
  )
}
