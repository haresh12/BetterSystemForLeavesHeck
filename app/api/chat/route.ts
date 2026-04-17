import { streamText, convertToModelMessages, stepCountIs } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { NextRequest } from 'next/server'
import { getAdminDb, getAdminAuth } from '@/lib/firebase/admin'
import { buildEmployeeSystemPrompt } from '@/lib/prompts/employee-system'
import { leaveMcpTools } from '@/lib/mcp/leave-mcp'
import { documentMcpTools } from '@/lib/mcp/document-mcp'
import { policyMcpTools } from '@/lib/mcp/policy-mcp'
import { notificationMcpTools } from '@/lib/mcp/notification-mcp'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'
export const maxDuration = 60

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY! })

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const token = cookieStore.get('session')?.value

  if (!token) {
    return new Response('Unauthorised', { status: 401 })
  }

  let uid: string
  try {
    const decoded = await getAdminAuth().verifyIdToken(token)
    uid = decoded.uid
  } catch {
    return new Response('Invalid session', { status: 401 })
  }

  const db = getAdminDb()
  const userSnap = await db.collection('users').doc(uid).get()
  if (!userSnap.exists || userSnap.data()!.role !== 'employee') {
    return new Response('Forbidden', { status: 403 })
  }

  const user = userSnap.data()!
  const body = await req.json()
  // Strip any raw base64 blobs from history — only compact [DOC_VERIFIED] summaries should remain
  const messages = (body.messages ?? []).map((msg: any, idx: number, arr: any[]) => {
    if (!msg.parts || idx === arr.length - 1) return msg
    return {
      ...msg,
      parts: msg.parts.map((p: any) => {
        if (p.type === 'text' && typeof p.text === 'string' && p.text.includes('[BASE64:')) {
          return { ...p, text: p.text.replace(/\[BASE64:[A-Za-z0-9+/=\s]{100,}\]/g, '[IMAGE_STRIPPED]') }
        }
        return p
      }),
    }
  })

  const systemPrompt = buildEmployeeSystemPrompt({
    uid,
    name: user.name,
    department: user.department,
    jobTitle: user.jobTitle ?? '',
    tenureYears: user.tenureYears ?? 0,
  })

  const result = streamText({
    model: openai('gpt-5.1'),
    system: systemPrompt,
    messages: await convertToModelMessages(messages),
    tools: {
      get_balance: leaveMcpTools.get_balance,
      check_date_availability: leaveMcpTools.check_date_availability,
      check_eligibility: leaveMcpTools.check_eligibility,
      preview_leave_request: leaveMcpTools.preview_leave_request,
      submit_leave: leaveMcpTools.submit_leave,
      get_my_cases: leaveMcpTools.get_my_cases,
      cancel_leave: leaveMcpTools.cancel_leave,
      get_leave_calendar: leaveMcpTools.get_leave_calendar,
      calculate_end_date: leaveMcpTools.calculate_end_date,
      get_leave_type_options: leaveMcpTools.get_leave_type_options,
      show_document_review: documentMcpTools.show_document_review,
      extract_document_fields: documentMcpTools.extract_document_fields,
      mark_document_uploaded: documentMcpTools.mark_document_uploaded,
      get_document_status: documentMcpTools.get_document_status,
      list_case_documents: documentMcpTools.list_case_documents,
      ...policyMcpTools,
      get_unread_notifications: notificationMcpTools.get_unread_notifications,
      mark_read: notificationMcpTools.mark_read,
    },
    stopWhen: stepCountIs(20),
  })

  return result.toUIMessageStreamResponse()
}
