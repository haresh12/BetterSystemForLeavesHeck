import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function daysBetween(start: string, end: string): number {
  const s = new Date(start)
  const e = new Date(end)
  return Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1
}

// ── Company holidays (2025-2027 coverage) ─────────────────────────────────────
export const COMPANY_HOLIDAYS: Record<string, string> = {
  '2025-01-01': "New Year's Day",
  '2025-01-20': 'Martin Luther King Jr. Day',
  '2025-02-17': "Presidents' Day",
  '2025-05-26': 'Memorial Day',
  '2025-07-04': 'Independence Day',
  '2025-09-01': 'Labor Day',
  '2025-11-27': 'Thanksgiving',
  '2025-11-28': 'Day after Thanksgiving',
  '2025-12-25': 'Christmas Day',
  '2025-12-31': "New Year's Eve",
  '2026-01-01': "New Year's Day",
  '2026-01-19': 'Martin Luther King Jr. Day',
  '2026-02-16': "Presidents' Day",
  '2026-05-25': 'Memorial Day',
  '2026-07-03': 'Independence Day (observed)',
  '2026-09-07': 'Labor Day',
  '2026-11-26': 'Thanksgiving',
  '2026-11-27': 'Day after Thanksgiving',
  '2026-12-25': 'Christmas Day',
  '2026-12-31': "New Year's Eve",
  '2027-01-01': "New Year's Day",
  '2027-01-18': 'Martin Luther King Jr. Day',
  '2027-02-15': "Presidents' Day",
  '2027-05-31': 'Memorial Day',
  '2027-07-05': 'Independence Day (observed)',
  '2027-09-06': 'Labor Day',
  '2027-11-25': 'Thanksgiving',
  '2027-11-26': 'Day after Thanksgiving',
  '2027-12-24': 'Christmas Eve (observed)',
  '2027-12-31': "New Year's Eve",
}

export interface DayBreakdown {
  calendarDays: number
  businessDays: number
  weekendDays: number
  holidays: Array<{ date: string; name: string }>
}

export function countBusinessDays(startDate: string, endDate: string): DayBreakdown {
  const start = new Date(startDate + 'T00:00:00')
  const end = new Date(endDate + 'T00:00:00')
  let calendarDays = 0
  let businessDays = 0
  let weekendDays = 0
  const holidays: Array<{ date: string; name: string }> = []

  const current = new Date(start)
  while (current <= end) {
    calendarDays++
    const dow = current.getDay()
    const iso = current.toISOString().split('T')[0]

    if (dow === 0 || dow === 6) {
      weekendDays++
    } else if (COMPANY_HOLIDAYS[iso]) {
      holidays.push({ date: iso, name: COMPANY_HOLIDAYS[iso] })
    } else {
      businessDays++
    }
    current.setDate(current.getDate() + 1)
  }

  return { calendarDays, businessDays, weekendDays, holidays }
}

export function isCompanyHoliday(date: string): string | null {
  return COMPANY_HOLIDAYS[date] ?? null
}

export function daysUntil(iso: string): number {
  const target = new Date(iso)
  const now = new Date()
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
  })
}
