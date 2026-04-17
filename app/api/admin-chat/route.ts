import { streamText, convertToModelMessages, stepCountIs } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { NextRequest } from 'next/server'
import { getAdminDb, getAdminAuth } from '@/lib/firebase/admin'
import { buildAdminSystemPrompt } from '@/lib/prompts/admin-system'
import { casesMcpTools } from '@/lib/mcp/cases-mcp'
import { documentMcpTools } from '@/lib/mcp/document-mcp'
import { policyMcpTools } from '@/lib/mcp/policy-mcp'
import { notificationMcpTools } from '@/lib/mcp/notification-mcp'
import { analyticsMcpTools } from '@/lib/mcp/analytics-mcp'
import { intelligenceMcpTools } from '@/lib/mcp/intelligence-mcp'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'
export const maxDuration = 120

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
  if (!userSnap.exists || userSnap.data()!.role !== 'admin') {
    return new Response('Forbidden', { status: 403 })
  }

  const admin = userSnap.data()!
  const body = await req.json()
  const { messages } = body

  const systemPrompt = buildAdminSystemPrompt({
    uid,
    name: admin.name,
    department: admin.department,
  })

  const result = streamText({
    model: openai('gpt-5.1'),
    system: systemPrompt,
    messages: await convertToModelMessages(messages),
    tools: {
      ...casesMcpTools,
      ...documentMcpTools,
      ...policyMcpTools,
      ...notificationMcpTools,
      ...analyticsMcpTools,
      ...intelligenceMcpTools,
    },
    stopWhen: stepCountIs(50),
  })

  return result.toUIMessageStreamResponse()
}
