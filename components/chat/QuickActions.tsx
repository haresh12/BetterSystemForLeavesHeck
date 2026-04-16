'use client'

import { Button } from '@/components/ui/button'

interface QuickAction {
  label: string
  message: string
  icon?: string
}

interface QuickActionsProps {
  actions: QuickAction[]
  onSelect: (message: string) => void
}

export function QuickActions({ actions, onSelect }: QuickActionsProps) {
  return (
    <div className="flex flex-wrap gap-2 px-4 py-3">
      {actions.map((action) => (
        <button
          key={action.message}
          onClick={() => onSelect(action.message)}
          className="text-xs px-3 py-1.5 rounded-full border border-brand/30 bg-brand-muted/50 text-brand hover:bg-brand-muted hover:border-brand transition-colors font-medium"
        >
          {action.icon && <span className="mr-1">{action.icon}</span>}
          {action.label}
        </button>
      ))}
    </div>
  )
}

export const EMPLOYEE_QUICK_ACTIONS: QuickAction[] = [
  { label: 'My balance', message: 'What is my current leave balance?', icon: '📊' },
  { label: 'Submit leave', message: 'I need to take some time off', icon: '📅' },
  { label: 'My cases', message: 'Show me all my leave requests', icon: '📋' },
  { label: 'Cancel leave', message: 'I want to cancel a leave request', icon: '❌' },
  { label: 'Team calendar', message: 'Show me who is out in my department', icon: '👥' },
  { label: 'Leave policies', message: 'What are the company leave policies?', icon: '📜' },
]

export const ADMIN_QUICK_ACTIONS: QuickAction[] = [
  { label: 'Morning triage', message: 'What needs my attention today?', icon: '⚡' },
  { label: 'All open cases', message: 'Show me all open cases', icon: '📋' },
  { label: 'Missing docs', message: 'Show me all cases with missing documents', icon: '📄' },
  { label: 'FMLA cases', message: 'Show me all open FMLA cases', icon: '🏥' },
  { label: 'Bulk PTO', message: 'Approve all low-risk PTO cases this week', icon: '✅' },
  { label: 'Trends', message: 'Show me absence trends by department this quarter', icon: '📈' },
]
