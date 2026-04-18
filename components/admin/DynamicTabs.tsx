'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { X, Sparkles, Bot, CheckCheck, Search } from 'lucide-react'

export interface DynamicTab {
  id: string
  label: string
  caseIds: string[]
  color: string
  createdByAI: boolean
  pinned?: boolean
  reviewing?: boolean     // AI is currently reviewing this tab
  reviewedCount?: number  // how many cases AI has reviewed
}

interface DynamicTabsProps {
  tabs: DynamicTab[]
  activeTabId: string
  onTabClick: (tabId: string) => void
  onTabClose: (tabId: string) => void
  onAIReview: (tabId: string) => void
  onApproveAllSafe: (tabId: string) => void
  aiVerdicts: Record<string, 'safe' | 'review' | 'flag'>
}

export function DynamicTabs({ tabs, activeTabId, onTabClick, onTabClose, onAIReview, onApproveAllSafe, aiVerdicts }: DynamicTabsProps) {
  const activeTab = tabs.find(t => t.id === activeTabId)
  const safeCount = activeTab ? activeTab.caseIds.filter(id => aiVerdicts[id] === 'safe').length : 0
  const reviewCount = activeTab ? activeTab.caseIds.filter(id => aiVerdicts[id] === 'review').length : 0
  const flagCount = activeTab ? activeTab.caseIds.filter(id => aiVerdicts[id] === 'flag').length : 0
  const hasVerdicts = safeCount + reviewCount + flagCount > 0

  return (
    <div>
      {/* Tab bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, overflowX: 'auto', borderBottom: '1px solid #e8e8f0', background: '#fafafc' }} className="no-scrollbar">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId
          return (
            <motion.div
              key={tab.id}
              initial={tab.createdByAI ? { opacity: 0, scale: 0.9, width: 0 } : false}
              animate={{ opacity: 1, scale: 1, width: 'auto' }}
              transition={{ duration: 0.25, type: 'spring', stiffness: 300, damping: 25 }}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '13px 18px',
                borderBottom: isActive ? `3px solid ${tab.color}` : '3px solid transparent',
                background: isActive ? '#fff' : 'transparent',
                cursor: 'pointer',
                transition: 'background 0.15s',
                flexShrink: 0,
              }}
              onClick={() => onTabClick(tab.id)}
            >
              {tab.createdByAI && <Sparkles className="h-3.5 w-3.5" style={{ color: tab.color }} />}
              <span style={{ fontSize: 14, fontWeight: isActive ? 800 : 600, color: isActive ? tab.color : '#64748b', whiteSpace: 'nowrap' }}>
                {tab.label}
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: isActive ? `${tab.color}12` : '#f1f5f9', color: isActive ? tab.color : '#94a3b8' }}>
                {tab.caseIds.length}
              </span>
              {tab.reviewing && (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
                >
                  <Bot className="h-3.5 w-3.5" style={{ color: tab.color }} />
                </motion.div>
              )}
              {tab.id !== 'all' && (
                <button
                  onClick={(e) => { e.stopPropagation(); onTabClose(tab.id) }}
                  style={{ height: 18, width: 18, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c0c0d0', background: 'none', border: 'none', cursor: 'pointer' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#ef4444' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#c0c0d0' }}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </motion.div>
          )
        })}
        {tabs.length <= 1 && (
          <div style={{ padding: '13px 18px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Sparkles className="h-3.5 w-3.5" style={{ color: '#c7d2fe' }} />
            <span style={{ fontSize: 12, color: '#b0b0c0', fontStyle: 'italic' }}>Type a filter in AI chat to create tabs</span>
          </div>
        )}
      </div>

      {/* AI Action Bar — shows when on AI-created tab */}
      {activeTab && activeTab.id !== 'all' && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 20px', background: `${activeTab.color}05`, borderBottom: `1px solid ${activeTab.color}15`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={() => onAIReview(activeTab.id)}
              disabled={activeTab.reviewing}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 13, fontWeight: 700, padding: '8px 18px', borderRadius: 10,
                background: activeTab.reviewing ? '#f1f5f9' : `${activeTab.color}`,
                color: activeTab.reviewing ? '#94a3b8' : '#fff',
                border: 'none', cursor: activeTab.reviewing ? 'not-allowed' : 'pointer',
                boxShadow: activeTab.reviewing ? 'none' : `0 3px 10px ${activeTab.color}35`,
              }}
            >
              {activeTab.reviewing ? (
                <><motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}><Bot className="h-4 w-4" /></motion.div> Reviewing...</>
              ) : (
                <><Bot className="h-4 w-4" /> AI Review All</>
              )}
            </button>

            {safeCount > 0 && (
              <button
                onClick={() => onApproveAllSafe(activeTab.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  fontSize: 13, fontWeight: 700, padding: '8px 18px', borderRadius: 10,
                  background: '#16a34a', color: '#fff', border: 'none', cursor: 'pointer',
                  boxShadow: '0 3px 10px rgba(22,163,106,0.3)',
                }}
              >
                <CheckCheck className="h-4 w-4" />
                Approve {safeCount} Safe
              </button>
            )}
          </div>

          {/* Verdict summary */}
          {hasVerdicts && (
            <div style={{ display: 'flex', gap: 12, fontSize: 13, fontWeight: 700 }}>
              {safeCount > 0 && <span style={{ color: '#16a34a' }}>✅ {safeCount} safe</span>}
              {reviewCount > 0 && <span style={{ color: '#f59e0b' }}>⚠️ {reviewCount} review</span>}
              {flagCount > 0 && <span style={{ color: '#ef4444' }}>❌ {flagCount} flagged</span>}
            </div>
          )}
        </motion.div>
      )}
    </div>
  )
}
