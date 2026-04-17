'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase/client'
import { useAuth, type SignUpData } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, MessageSquare, Check, Users } from 'lucide-react'
import toast from 'react-hot-toast'
import type { UserDoc } from '@/lib/firebase/types'

const DEPARTMENTS = [
  'Engineering', 'Product', 'Design', 'Sales', 'Marketing',
  'HR', 'Finance', 'Legal', 'Operations', 'Customer Success',
  'Data Science', 'Security', 'DevOps', 'QA', 'Executive',
]

const JOB_TITLES: Record<string, string[]> = {
  Engineering: ['Software Engineer', 'Senior Engineer', 'Staff Engineer', 'Engineering Manager', 'VP Engineering'],
  Product: ['Product Manager', 'Senior PM', 'Director of Product', 'VP Product'],
  Design: ['UX Designer', 'Product Designer', 'Design Lead', 'Head of Design'],
  Sales: ['Sales Rep', 'Account Executive', 'Sales Manager', 'VP Sales'],
  Marketing: ['Marketing Specialist', 'Marketing Manager', 'Growth Lead', 'VP Marketing'],
  HR: ['HR Specialist', 'HR Manager', 'People Operations', 'VP HR'],
  Finance: ['Financial Analyst', 'Finance Manager', 'Controller', 'CFO'],
  Legal: ['Legal Counsel', 'Senior Counsel', 'General Counsel'],
  Operations: ['Operations Analyst', 'Operations Manager', 'COO'],
  'Customer Success': ['CSM', 'Senior CSM', 'CS Director'],
  'Data Science': ['Data Analyst', 'Data Scientist', 'ML Engineer', 'Data Lead'],
  Security: ['Security Engineer', 'Security Analyst', 'CISO'],
  DevOps: ['DevOps Engineer', 'SRE', 'Platform Engineer'],
  QA: ['QA Engineer', 'Senior QA', 'QA Lead'],
  Executive: ['CEO', 'CTO', 'COO', 'President'],
}

const ADMIN_DEFAULTS = {
  department: 'HR',
  jobTitle: 'HR Manager',
} as const

export default function SignupPage() {
  const router = useRouter()
  const { signUp } = useAuth()
  const [step, setStep] = useState(1) // 1: account, 2: role/dept, 3: admin scope
  const [loading, setLoading] = useState(false)
  const [employees, setEmployees] = useState<UserDoc[]>([])
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([])

  const [form, setForm] = useState<Omit<SignUpData, 'managedEmployeeIds'>>({
    name: '',
    email: '',
    password: '',
    role: 'employee',
    gender: 'male',
    department: '',
    jobTitle: '',
    tenureYears: 1,
  })

  // Load employees when moving to admin scope step
  useEffect(() => {
    if (step === 3 && form.role === 'admin') {
      getDocs(query(collection(db, 'users'), where('role', '==', 'employee')))
        .then((snap) => setEmployees(snap.docs.map((d) => d.data() as UserDoc)))
    }
  }, [step, form.role])

  function updateForm(key: keyof typeof form, value: any) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function toggleEmployee(uid: string) {
    setSelectedEmployees((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    )
  }

  async function handleSubmit() {
    setLoading(true)
    try {
      await signUp({
        ...form,
        managedEmployeeIds: form.role === 'admin' ? selectedEmployees : undefined,
      })
      toast.success('Account created! Welcome to ConvoWork.')
      await new Promise((r) => setTimeout(r, 400))
      router.refresh()
    } catch (err: any) {
      toast.error(err?.message ?? 'Signup failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-md">
      <div className="flex items-center justify-center gap-2 mb-8">
        <div className="h-9 w-9 rounded-xl bg-brand flex items-center justify-center">
          <MessageSquare className="h-5 w-5 text-white" />
        </div>
        <span className="text-xl font-bold tracking-tight">ConvoWork</span>
      </div>

      <Card className="border-0 shadow-xl shadow-slate-200/60 dark:shadow-none">
        <CardHeader className="pb-4">
          <CardTitle className="text-xl">Create account</CardTitle>
          <CardDescription>
            {step === 1 && 'Your account credentials'}
            {step === 2 && 'Your role and department'}
            {step === 3 && 'Select employees you manage'}
          </CardDescription>
          {/* Progress dots */}
          <div className="flex gap-1.5 pt-1">
            {[1, 2, form.role === 'admin' ? 3 : null].filter(Boolean).map((s) => (
              <div
                key={s}
                className={`h-1.5 flex-1 rounded-full transition-colors ${step >= (s as number) ? 'bg-brand' : 'bg-muted'}`}
              />
            ))}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Step 1: Credentials */}
          {step === 1 && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="name">Full name</Label>
                <Input
                  id="name"
                  placeholder="Jane Smith"
                  value={form.name}
                  onChange={(e) => updateForm('name', e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Work email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="jane@company.com"
                  value={form.email}
                  onChange={(e) => updateForm('email', e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="At least 8 characters"
                  value={form.password}
                  onChange={(e) => updateForm('password', e.target.value)}
                  required
                  minLength={8}
                />
              </div>
              <Button
                className="w-full"
                variant="brand"
                disabled={!form.name || !form.email || form.password.length < 8}
                onClick={() => setStep(2)}
              >
                Continue
              </Button>
            </>
          )}

          {/* Step 2: Role + dept */}
          {step === 2 && (
            <>
              <div className="space-y-1.5">
                <Label>I am joining as</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(['employee', 'admin'] as const).map((r) => (
                    <button
                      key={r}
                      onClick={() => {
                        updateForm('role', r)
                        if (r === 'admin') {
                          updateForm('gender', undefined)
                          updateForm('department', ADMIN_DEFAULTS.department)
                          updateForm('jobTitle', ADMIN_DEFAULTS.jobTitle)
                        } else {
                          updateForm('gender', 'male')
                          updateForm('department', '')
                          updateForm('jobTitle', '')
                        }
                      }}
                      className={`p-3 rounded-lg border text-sm font-medium transition-colors text-left ${
                        form.role === r
                          ? 'border-brand bg-brand-muted text-brand'
                          : 'border-border hover:border-brand/50'
                      }`}
                    >
                      {r === 'employee' ? '👤 Employee' : '🏢 HR Admin'}
                    </button>
                  ))}
                </div>
              </div>

              {form.role === 'employee' && (
                <div className="space-y-1.5">
                  <Label>Gender</Label>
                  <Select value={form.gender} onValueChange={(v: 'male' | 'female') => updateForm('gender', v)}>
                    <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {form.role === 'employee' && (
                <div className="space-y-1.5">
                  <Label>Department</Label>
                  <Select value={form.department} onValueChange={(v) => { updateForm('department', v); updateForm('jobTitle', '') }}>
                    <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                    <SelectContent>
                      {DEPARTMENTS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {form.role === 'employee' && form.department && (
                <div className="space-y-1.5">
                  <Label>Job title</Label>
                  <Select value={form.jobTitle} onValueChange={(v) => updateForm('jobTitle', v)}>
                    <SelectTrigger><SelectValue placeholder="Select job title" /></SelectTrigger>
                    <SelectContent>
                      {(JOB_TITLES[form.department] ?? []).map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="tenure">Years at company</Label>
                <Input
                  id="tenure"
                  type="number"
                  min={0}
                  max={40}
                  value={form.tenureYears}
                  onChange={(e) => updateForm('tenureYears', Number(e.target.value))}
                />
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>Back</Button>
                <Button
                  variant="brand"
                  className="flex-1"
                  disabled={form.role === 'employee' && (!form.gender || !form.department || !form.jobTitle)}
                  onClick={() => form.role === 'admin' ? setStep(3) : handleSubmit()}
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {form.role === 'admin' ? 'Continue' : 'Create account'}
                </Button>
              </div>
            </>
          )}

          {/* Step 3: Admin — select managed employees */}
          {step === 3 && (
            <>
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                <Users className="h-4 w-4" />
                <span>
                  {employees.length === 0
                    ? 'No employees yet — you\'ll manage all future employees'
                    : `${employees.length} employee${employees.length !== 1 ? 's' : ''} in the system`}
                </span>
              </div>

              {employees.length > 0 && (
                <div className="border rounded-lg divide-y max-h-64 overflow-y-auto">
                  {employees.map((emp) => (
                    <button
                      key={emp.uid}
                      onClick={() => toggleEmployee(emp.uid)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors text-left"
                    >
                      <div className={`h-5 w-5 rounded border-2 flex items-center justify-center shrink-0 ${
                        selectedEmployees.includes(emp.uid) ? 'bg-brand border-brand' : 'border-muted-foreground'
                      }`}>
                        {selectedEmployees.includes(emp.uid) && <Check className="h-3 w-3 text-white" />}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{emp.name}</p>
                        <p className="text-xs text-muted-foreground">{emp.department} · {emp.jobTitle}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {employees.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Leave all unselected to manage ALL employees in the organisation.
                </p>
              )}

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setStep(2)}>Back</Button>
                <Button variant="brand" className="flex-1" onClick={handleSubmit} disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create account
                </Button>
              </div>
            </>
          )}

          {step < 3 && (
            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link href="/login" className="text-brand font-medium hover:underline">Sign in</Link>
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
