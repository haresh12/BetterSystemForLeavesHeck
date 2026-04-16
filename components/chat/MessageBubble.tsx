'use client'

import type { UIMessage } from 'ai'
import { motion } from 'framer-motion'
import { Sparkles, User, Zap } from 'lucide-react'
import { BalanceChart } from '@/components/cards/BalanceChart'
import { CaseTable } from '@/components/cards/CaseTable'
import { CaseCard } from '@/components/cards/CaseCard'
import { CaseStatusCard } from '@/components/cards/CaseStatusCard'
import { ConfirmCard } from '@/components/cards/ConfirmCard'
import { ProactiveAlertCard } from '@/components/cards/ProactiveAlertCard'
import { TrendCard } from '@/components/cards/TrendCard'
import { LeaveConfirmCard } from '@/components/cards/LeaveConfirmCard'
import { LeaveTypePickerCard } from '@/components/cards/LeaveTypePickerCard'
import { cn } from '@/lib/utils'

interface MessageBubbleProps {
  message: UIMessage
  isStreaming?: boolean
  onSend?: (text: string) => void
}

// ── Typing dots ───────────────────────────────────────────────────────────────
export function TypingDots() {
  return (
    <div className="flex items-center gap-1.5 px-4 py-3.5 bg-muted/60 rounded-2xl rounded-tl-sm w-fit border border-border/40">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-2 w-2 rounded-full bg-brand/60 block"
          animate={{ y: [0, -5, 0] }}
          transition={{ repeat: Infinity, duration: 0.9, delay: i * 0.18, ease: 'easeInOut' }}
        />
      ))}
    </div>
  )
}

export function TypingRow({ isAdmin }: { isAdmin?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.22 }}
      className="flex gap-3 px-4 py-2"
    >
      <div className={cn(
        'h-7 w-7 rounded-full flex items-center justify-center shrink-0 shadow-sm',
        isAdmin
          ? 'bg-gradient-to-br from-violet-600 to-indigo-700'
          : 'bg-gradient-to-br from-violet-500 to-indigo-600',
      )}>
        {isAdmin
          ? <Zap className="h-3.5 w-3.5 text-white" />
          : <Sparkles className="h-3.5 w-3.5 text-white" />
        }
      </div>
      <TypingDots />
    </motion.div>
  )
}

function WorkingBadge() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.93 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex items-center gap-2 text-xs text-muted-foreground px-3 py-2 bg-muted/60 rounded-xl w-fit border border-border/40"
    >
      <motion.div
        className="h-1.5 w-1.5 rounded-full bg-brand"
        animate={{ scale: [1, 1.5, 1], opacity: [0.6, 1, 0.6] }}
        transition={{ repeat: Infinity, duration: 1.2, ease: 'easeInOut' }}
      />
      <span className="font-medium">Working…</span>
    </motion.div>
  )
}

// ── Tool output renderer ──────────────────────────────────────────────────────
function renderToolOutput(result: unknown, onSend?: (text: string) => void) {
  if (!result || typeof result !== 'object') return null
  const r = result as Record<string, unknown>
  const c = r.ui_component as string | undefined
  if (!c) return null

  if (c === 'BalanceChart')
    return <BalanceChart employeeName={r.employeeName as string} balances={r.balances as Record<string, number>} />
  if (c === 'CaseTable')
    return <CaseTable cases={(r.cases as any[]) ?? []} total={r.total as number} viewType={r.viewType as any} viewLabel={r.viewLabel as string} />
  if (c === 'CaseCard')
    return <CaseCard case={(r.case ?? r) as any} documents={r.documents as any[]} auditLogs={r.auditLogs as any[]} message={r.message as string} />
  if (c === 'CaseStatusCard')
    return <CaseStatusCard {...(r as any)} />
  if (c === 'ConfirmCard')
    return <ConfirmCard action={r.action as any} candidates={(r.candidates as any[]) ?? []} count={(r.count as number) ?? 0} message={r.message as string} />
  if (c === 'ProactiveAlertCard')
    return <ProactiveAlertCard alerts={(r.alerts as any[]) ?? []} summary={(r.summary as any) ?? {}} message={r.message as string} />
  if (c === 'TrendCard')
    return <TrendCard chartType={r.chartType as any} title={r.title as string} data={(r.data as any[]) ?? []} periodDays={r.periodDays as number} />
  if (c === 'LeaveConfirmCard')
    return <LeaveConfirmCard {...(r as any)} />
  if (c === 'LeaveTypePickerCard')
    return <LeaveTypePickerCard options={(r.options as any[]) ?? []} onSelect={onSend} />
  return null
}

// ── Markdown renderer ─────────────────────────────────────────────────────────
function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4)
      return <strong key={i} className="font-bold text-foreground">{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2)
      return <code key={i} className="bg-muted px-1.5 py-0.5 rounded-md text-[0.82em] font-mono text-foreground/90 border border-border/50">{part.slice(1, -1)}</code>
    return part
  })
}

function MessageText({ content }: { content: string }) {
  if (content === '__PROACTIVE_SCAN__') return null

  const lines = content.split('\n')
  const nodes: React.ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // H2/H3 headings
    if (/^## /.test(line)) {
      nodes.push(
        <p key={i} className="font-bold text-[15.5px] text-foreground mt-3 mb-1 first:mt-0">
          {renderInline(line.replace(/^## /, ''))}
        </p>
      )
      i++; continue
    }
    if (/^### /.test(line)) {
      nodes.push(
        <p key={i} className="font-semibold text-[14.5px] text-foreground mt-2.5 mb-0.5 first:mt-0">
          {renderInline(line.replace(/^### /, ''))}
        </p>
      )
      i++; continue
    }

    // Bullet list — collect consecutive bullets into a group
    if (/^[\s]*[-•*]\s+/.test(line)) {
      const bullets: string[] = []
      while (i < lines.length && /^[\s]*[-•*]\s+/.test(lines[i])) {
        bullets.push(lines[i].replace(/^[\s]*[-•*]\s+/, ''))
        i++
      }
      nodes.push(
        <ul key={`ul-${i}`} className="space-y-1 my-1.5 pl-1">
          {bullets.map((b, bi) => (
            <li key={bi} className="flex items-start gap-2.5">
              <span className="mt-[5px] h-1.5 w-1.5 rounded-full bg-brand/50 shrink-0" />
              <span className="leading-relaxed">{renderInline(b)}</span>
            </li>
          ))}
        </ul>
      )
      continue
    }

    // Numbered list — collect consecutive numbered items
    if (/^[\s]*\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^[\s]*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[\s]*\d+\.\s+/, ''))
        i++
      }
      nodes.push(
        <ol key={`ol-${i}`} className="space-y-1.5 my-1.5 pl-1">
          {items.map((item, ii) => (
            <li key={ii} className="flex items-start gap-2.5">
              <span
                className="mt-0.5 h-5 w-5 rounded-md bg-brand/10 text-brand text-[10px] font-bold flex items-center justify-center shrink-0 border border-brand/20"
              >
                {ii + 1}
              </span>
              <span className="leading-relaxed">{renderInline(item)}</span>
            </li>
          ))}
        </ol>
      )
      continue
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      nodes.push(<div key={i} className="border-t border-border/40 my-2" />)
      i++; continue
    }

    // Empty line → small gap
    if (!line.trim()) {
      nodes.push(<div key={i} className="h-1.5" />)
      i++; continue
    }

    // Normal paragraph
    nodes.push(
      <p key={i} className="leading-relaxed">
        {renderInline(line)}
      </p>
    )
    i++
  }

  return <>{nodes}</>
}

// ── Main component ────────────────────────────────────────────────────────────
export function MessageBubble({ message, isStreaming, onSend }: MessageBubbleProps) {
  const isUser = message.role === 'user'

  const textContent = (message.parts ?? [])
    .filter((p: any) => p.type === 'text' && typeof p.text === 'string')
    .map((p: any) => {
      // Strip DOC_VERIFIED blobs from display
      const t = p.text as string
      const idx = t.lastIndexOf('\n\n[DOC_VERIFIED:')
      return (idx !== -1 ? t.slice(0, idx) : t).replace(/\[IMAGE_STRIPPED\]/g, '').trim()
    })
    .filter(Boolean)
    .join('')

  const toolParts = (message.parts ?? []).filter((p: any) => {
    if (!p || typeof p.type !== 'string') return false
    return p.type === 'dynamic-tool' || p.type.startsWith('tool-')
  }) as any[]

  const completedTools = toolParts.filter((p) => p.state === 'output-available' && p.output != null)
  const pendingTools = toolParts.filter((p) => p.state === 'input-streaming' || p.state === 'input-available')
  const hasCards = completedTools.some((p) => p.output?.ui_component)

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={cn('group flex gap-3 px-4 py-1.5', isUser && 'flex-row-reverse')}
    >
      {/* Avatar */}
      <div className={cn(
        'h-7 w-7 rounded-full flex items-center justify-center shrink-0 mt-1 flex-shrink-0',
        isUser
          ? 'bg-gradient-to-br from-brand to-violet-600 text-white shadow-md shadow-brand/30'
          : 'bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-md shadow-indigo-500/25',
      )}>
        {isUser
          ? <User className="h-3.5 w-3.5" />
          : <Sparkles className="h-3.5 w-3.5" />
        }
      </div>

      {/* Content */}
      <div className={cn(
        'flex flex-col gap-2.5 min-w-0',
        isUser ? 'items-end max-w-[80%]' : 'items-start w-full max-w-[96%]',
      )}>
        {/* Text */}
        {textContent && (
          isUser ? (
            <div
              className="rounded-2xl rounded-tr-sm px-4 py-3 leading-relaxed text-white"
              style={{
                fontSize: '14.5px',
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                boxShadow: '0 4px 20px rgba(99,102,241,0.30)',
              }}
            >
              <MessageText content={textContent} />
            </div>
          ) : (
            <div
              className="rounded-2xl rounded-tl-sm px-5 py-4"
              style={{
                fontSize: '15px',
                fontWeight: 400,
                lineHeight: 1.8,
                color: '#1a1a2e',
                background: '#ffffff',
                border: '1px solid #e8e8f0',
                boxShadow: '0 2px 16px rgba(0,0,0,0.06)',
              }}
            >
              <MessageText content={textContent} />
            </div>
          )
        )}

        {/* Typing dots */}
        {isStreaming && !textContent && !hasCards && pendingTools.length === 0 && (
          <TypingDots />
        )}

        {/* Working badge */}
        {pendingTools.length > 0 && <WorkingBadge />}

        {/* Card outputs */}
        {completedTools.map((p, i) => {
          const card = renderToolOutput(p.output, onSend)
          if (!card) return null
          return (
            <motion.div
              key={p.toolCallId ?? i}
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.38, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.05 }}
              className="w-full"
            >
              {card}
            </motion.div>
          )
        })}
      </div>
    </motion.div>
  )
}
