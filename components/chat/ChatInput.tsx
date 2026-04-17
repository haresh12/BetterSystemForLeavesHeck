'use client'

import { useRef, useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { motion, AnimatePresence } from 'framer-motion'
import { cn, fileToBase64 } from '@/lib/utils'
import { ArrowUp, Paperclip, Loader2 } from 'lucide-react'
import { BorderBeam } from '@/components/ui/border-beam'
import { DocumentChecklistCard, type CheckItem } from '@/components/chat/DocumentChecklistCard'

export interface DocResult {
  isValid: boolean
  invalidReason?: string | null
  doctorName?: string | null
  hospital?: string | null
  recommendedRestStart?: string | null
  recommendedRestEnd?: string | null
  diagnosisType?: string | null
  signatureDetected?: boolean
  confidenceScore?: number
  documentType?: string
  isOnLetterhead?: boolean
  checks?: Record<string, CheckItem>
  failureReasons?: string[]
  fileUrl?: string | null
}

export interface PendingDoc {
  name: string
  base64: string
  state: 'processing' | 'valid' | 'invalid'
  result?: DocResult
}

interface ChatInputProps {
  input: string
  isLoading: boolean
  onInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  onSubmit: (e: React.FormEvent) => void
  placeholder?: string
  hideUpload?: boolean
  pendingFile?: PendingDoc | null
  onFileAttach?: (file: PendingDoc | null) => void
}

export function ChatInput({
  input, isLoading, onInputChange, onSubmit, placeholder = 'Type a message…',
  pendingFile, onFileAttach, hideUpload,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isFocused, setIsFocused] = useState(false)

  async function processFile(file: File) {
    const base64 = await fileToBase64(file)
    onFileAttach?.({ name: file.name, base64, state: 'processing' })

    try {
      console.log('[DOC-CLIENT] Uploading', file.name, 'size:', Math.round(base64.length / 1024), 'KB')
      const res = await fetch('/api/process-document', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64, fileName: file.name }),
      })
      console.log('[DOC-CLIENT] Response status:', res.status)
      if (!res.ok) {
        const errText = await res.text()
        console.error('[DOC-CLIENT] Error response:', errText)
        throw new Error(`Server returned ${res.status}`)
      }
      const result: DocResult = await res.json()
      console.log('[DOC-CLIENT] Result:', result.isValid, 'confidence:', result.confidenceScore, 'checks:', Object.keys(result.checks ?? {}).length)
      onFileAttach?.({
        name: file.name,
        base64,
        state: result.isValid ? 'valid' : 'invalid',
        result,
      })
    } catch {
      onFileAttach?.({
        name: file.name,
        base64,
        state: 'invalid',
        result: {
          isValid: false,
          invalidReason: 'Verification failed — please try again.',
          checks: {},
          failureReasons: ['Network error.'],
        },
      })
    }
  }

  const onDrop = useCallback(async (accepted: File[]) => {
    const file = accepted[0]
    if (file) processFile(file)
  }, [onFileAttach]) // eslint-disable-line

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpg', '.jpeg', '.png', '.webp'],
      'application/pdf': ['.pdf'],
    },
    maxFiles: 1,
    noClick: true,
  })

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend(e as unknown as React.FormEvent)
    }
  }

  function handleSend(e: React.FormEvent) {
    if (isLoading) return
    if (pendingFile?.state === 'processing') return
    if (!input.trim() && !pendingFile) return
    onSubmit(e)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  function handleTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    onInputChange(e)
    const ta = e.target
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'
  }

  const canSend = !isLoading
    && pendingFile?.state !== 'processing'
    && (input.trim().length > 0 || pendingFile?.state === 'valid' || pendingFile?.state === 'invalid')

  return (
    <div
      {...getRootProps()}
      className="relative rounded-2xl transition-all duration-200"
      style={{
        background: '#fff',
        border: isDragActive
          ? '2px solid #6366f1'
          : isFocused
            ? '2px solid #818cf8'
            : '1px solid #e0e0ea',
        boxShadow: isDragActive
          ? '0 0 0 4px rgba(99,102,241,0.12), 0 4px 24px rgba(0,0,0,0.08)'
          : isFocused
            ? '0 0 0 3px rgba(99,102,241,0.08), 0 4px 24px rgba(0,0,0,0.08)'
            : '0 2px 12px rgba(0,0,0,0.06)',
      }}
    >
      <input {...getInputProps()} />

      {/* Drag overlay */}
      <AnimatePresence>
        {isDragActive && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 rounded-2xl bg-brand/5 border-2 border-dashed border-brand flex items-center justify-center z-10"
          >
            <div className="flex flex-col items-center gap-2 text-brand">
              <Paperclip className="h-6 w-6" />
              <span className="text-sm font-semibold">Drop document here</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Document checklist card */}
      <AnimatePresence>
        {pendingFile && (
          <div className="px-3 pt-3">
            {pendingFile.state === 'processing' ? (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-muted/50 border border-border/50 text-sm text-muted-foreground"
              >
                <Loader2 className="h-4 w-4 animate-spin shrink-0 text-brand" />
                <div className="min-w-0">
                  <p className="font-medium text-foreground truncate">{pendingFile.name}</p>
                  <p className="text-xs mt-0.5">Verifying with AI vision…</p>
                </div>
              </motion.div>
            ) : (
              <DocumentChecklistCard
                fileName={pendingFile.name}
                confidenceScore={pendingFile.result?.confidenceScore}
                documentType={pendingFile.result?.documentType}
                isValid={pendingFile.state === 'valid'}
                checks={pendingFile.result?.checks ?? {}}
                onReupload={() => fileInputRef.current?.click()}
                onDismiss={() => onFileAttach?.(null)}
              />
            )}
          </div>
        )}
      </AnimatePresence>

      {/* Input row */}
      <div className="flex items-end gap-2 px-4 py-3">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleTextareaChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={placeholder}
          rows={1}
          disabled={isLoading}
          className="flex-1 resize-none bg-transparent focus:outline-none disabled:opacity-50 max-h-40"
          style={{ minHeight: '28px', fontSize: 15, lineHeight: 1.6, color: '#1a1a2e' }}
        />

        <div className="flex items-center gap-1 pb-0.5 shrink-0">
          {/* Attach — image or PDF (hidden for admin) */}
          {!hideUpload && <label className={cn(
            'h-8 w-8 rounded-xl flex items-center justify-center cursor-pointer transition-colors',
            'text-muted-foreground hover:text-foreground hover:bg-muted',
          )}>
            <Paperclip className="h-4 w-4" />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (file) processFile(file)
                e.target.value = ''
              }}
            />
          </label>}

          {/* Send */}
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={handleSend}
            disabled={!canSend}
            className={cn(
              'h-9 w-9 rounded-xl flex items-center justify-center transition-all duration-200',
              canSend
                ? 'bg-gradient-to-br from-brand to-violet-600 text-white shadow-md shadow-brand/25 hover:shadow-lg hover:shadow-brand/30 hover:scale-[1.04]'
                : 'bg-muted text-muted-foreground cursor-not-allowed',
            )}
          >
            {isLoading || pendingFile?.state === 'processing'
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <ArrowUp className="h-4 w-4" />
            }
          </motion.button>
        </div>
      </div>
    </div>
  )
}
