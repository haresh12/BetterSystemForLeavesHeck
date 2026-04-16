import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import sharp from 'sharp'
import { cookies } from 'next/headers'
import { getAdminAuth, getAdminStorage } from '@/lib/firebase/admin'

export const runtime = 'nodejs'
export const maxDuration = 30

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

// ── Per-leave-type validation rules ──────────────────────────────────────────
const LEAVE_RULES: Record<string, {
  documentLabel: string
  checks: Array<{ key: string; label: string; rule: string }>
}> = {
  Sick: {
    documentLabel: 'Medical Certificate',
    checks: [
      { key: 'isOfficial',  label: 'Official letterhead', rule: 'Must be on hospital/clinic letterhead or an official medical form — NOT a personal letter' },
      { key: 'provider',    label: 'Doctor identified',   rule: "Doctor's full name must be clearly visible" },
      { key: 'authorized',  label: 'Medical signature',   rule: "Doctor's handwritten signature OR official medical stamp must be present" },
      { key: 'dates',       label: 'Rest period',         rule: 'Both start AND end dates of the recommended rest period must be clearly stated' },
      { key: 'content',     label: 'Diagnosis',           rule: 'A medical condition or diagnosis must be described (general terms are acceptable)' },
    ],
  },
  FMLA: {
    documentLabel: 'WH-380 Form',
    checks: [
      { key: 'isOfficial',  label: 'Correct form type',       rule: 'Must be a WH-380-E/F form or equivalent official medical certification' },
      { key: 'provider',    label: 'Healthcare provider',     rule: "Licensed healthcare provider's name and credentials must be visible" },
      { key: 'authorized',  label: 'Provider signature',      rule: "Healthcare provider's signature must be present" },
      { key: 'dates',       label: 'Leave duration',          rule: 'Estimated duration or specific dates for the serious health condition must be stated' },
      { key: 'content',     label: 'Serious health condition', rule: 'A serious health condition must be described or referenced' },
    ],
  },
  Maternity: {
    documentLabel: 'Hospital Discharge / Birth Certificate',
    checks: [
      { key: 'isOfficial',  label: 'Official document',        rule: 'Must be hospital discharge papers or an official birth certificate' },
      { key: 'provider',    label: 'Hospital / authority',     rule: 'Hospital name or government issuing authority must be visible' },
      { key: 'authorized',  label: 'Official stamp',           rule: 'Official hospital stamp or authorised signature must be present' },
      { key: 'dates',       label: 'Birth / discharge date',   rule: 'Date of birth or hospital discharge date must be clearly stated' },
      { key: 'content',     label: 'Mother / infant details',  rule: "Mother's name and/or infant details should be present" },
    ],
  },
  Paternity: {
    documentLabel: 'Birth Certificate / Hospital Confirmation',
    checks: [
      { key: 'isOfficial',  label: 'Official document',    rule: 'Must be a birth certificate or hospital confirmation letter' },
      { key: 'provider',    label: 'Issuing authority',    rule: 'Hospital name or government issuing authority must be visible' },
      { key: 'authorized',  label: 'Official stamp',       rule: 'Official stamp or authorised signature must be present' },
      { key: 'dates',       label: 'Birth date',           rule: 'Date of birth must be clearly stated' },
      { key: 'content',     label: 'Infant details',       rule: "Infant's name or registration details should be present" },
    ],
  },
  Bereavement: {
    documentLabel: 'Death Certificate / Obituary',
    checks: [
      { key: 'isOfficial',  label: 'Official document',    rule: 'Must be a death certificate, obituary notice, or funeral home documentation' },
      { key: 'provider',    label: 'Issuing authority',    rule: 'Government authority, funeral home, or verifiable news source must be identifiable' },
      { key: 'authorized',  label: 'Official seal',        rule: 'Government seal, funeral home stamp, or official signature should be present' },
      { key: 'dates',       label: 'Date of passing',      rule: 'Date of death must be clearly stated' },
      { key: 'content',     label: 'Deceased details',     rule: 'Name of the deceased must be present' },
    ],
  },
  Intermittent: {
    documentLabel: 'Medical Certification',
    checks: [
      { key: 'isOfficial',  label: 'Official letterhead',   rule: 'Must be on hospital/clinic letterhead or official form' },
      { key: 'provider',    label: 'Doctor identified',     rule: "Doctor's full name must be clearly visible" },
      { key: 'authorized',  label: 'Medical signature',     rule: "Doctor's handwritten signature or official medical stamp must be present" },
      { key: 'dates',       label: 'Recurring condition',   rule: 'The episodic or recurring nature of the condition must be stated' },
      { key: 'content',     label: 'Chronic condition',     rule: 'A chronic or recurring health condition must be described' },
    ],
  },
}

function getRules(leaveType: string) {
  return LEAVE_RULES[leaveType] ?? LEAVE_RULES.Sick
}

function emptyChecks(leaveType: string): Record<string, { pass: boolean; note: string }> {
  const out: Record<string, { pass: boolean; note: string }> = {}
  for (const c of getRules(leaveType).checks) out[c.key] = { pass: false, note: 'Could not verify' }
  return out
}

function buildPrompt(leaveType: string): string {
  const rules = getRules(leaveType)
  const checkKeys = rules.checks.map(c => `    "${c.key}": { "pass": boolean, "note": "brief explanation" }`).join(',\n')
  const ruleList = rules.checks.map(c => `- ${c.label}: ${c.rule}`).join('\n')

  return `You are an HR document verification specialist.

## STEP 1 — EXTRACT (objective, no judgment yet)
Read every visible field precisely. If unclear → null. Never guess.

## STEP 2 — VALIDATE for a ${leaveType} leave (${rules.documentLabel})
Apply each rule and mark pass/fail with a brief note:
${ruleList}

## OUTPUT — return ONLY valid JSON, no prose:
{
  "doctorName": string | null,
  "hospital": string | null,
  "recommendedRestStart": "YYYY-MM-DD" | null,
  "recommendedRestEnd": "YYYY-MM-DD" | null,
  "diagnosisType": string | null,
  "dateOfIssue": "YYYY-MM-DD" | null,
  "signatureDetected": boolean,
  "isOnLetterhead": boolean,
  "documentType": "medical_certificate" | "hospital_discharge" | "birth_certificate" | "death_certificate" | "wh380_form" | "personal_letter" | "other",
  "checks": {
${checkKeys}
  },
  "isValid": boolean,
  "invalidReason": string | null,
  "confidenceScore": number,
  "failureReasons": string[]
}

Rules:
- isValid = true only when ALL checks pass AND confidenceScore >= 0.7
- confidenceScore: 0.0–1.0 based on image clarity and completeness
- failureReasons: user-friendly sentences for each failed check only
- invalidReason: single most critical failure, or null if valid`
}

function parseResult(raw: string, fileName: string, leaveType: string): NextResponse {
  console.log('[DOC] Parsing GPT response, length:', raw.length)
  try {
    const fields: Record<string, unknown> = JSON.parse(raw)

    // Ensure checks exist
    if (!fields.checks) fields.checks = emptyChecks(leaveType)

    // OVERRIDE confidence: derive from checks, don't trust GPT's number
    const checks = fields.checks as Record<string, { pass: boolean; note: string }>
    const checkEntries = Object.values(checks)
    const totalChecks = checkEntries.length
    const passedChecks = checkEntries.filter(c => c.pass).length
    const checkScore = totalChecks > 0 ? passedChecks / totalChecks : 0

    // Blend: 80% from checks, 20% from GPT's image-quality assessment
    const gptConfidence = Math.max(0, Math.min(1, (fields.confidenceScore as number) ?? 0))
    const computedConfidence = Math.round((checkScore * 0.8 + gptConfidence * 0.2) * 100) / 100

    fields.confidenceScore = computedConfidence
    fields.isValid = passedChecks === totalChecks && computedConfidence >= 0.7

    if (!fields.isValid && !fields.invalidReason) {
      const failedNames = Object.entries(checks)
        .filter(([, v]) => !v.pass)
        .map(([k]) => k)
      fields.invalidReason = `${failedNames.length} of ${totalChecks} checks failed.`
    }

    if (!fields.failureReasons) {
      fields.failureReasons = fields.isValid
        ? []
        : Object.entries(checks).filter(([, v]) => !v.pass).map(([, v]) => v.note)
    }

    console.log('[DOC] Result — passed:', passedChecks, '/', totalChecks, 'gptConf:', gptConfidence, 'computed:', computedConfidence, 'isValid:', fields.isValid)

    return NextResponse.json({ ...fields, fileName, leaveType })
  } catch (err) {
    console.error('[DOC] JSON parse FAILED:', err, 'Raw response:', raw.slice(0, 500))
    return NextResponse.json({
      isValid: false, invalidReason: 'Unable to read document — please ensure the image is clear.',
      confidenceScore: 0, fileName, leaveType,
      checks: emptyChecks(leaveType), failureReasons: ['Document parsing failed.'],
    })
  }
}

// ── PDF handler ───────────────────────────────────────────────────────────────
async function processPdf(rawBase64: string, fileName: string, leaveType: string): Promise<NextResponse> {
  console.log('[DOC] Processing PDF:', fileName, 'leaveType:', leaveType, 'base64 length:', rawBase64.length)
  let extractedText = ''
  try {
    const buffer = Buffer.from(rawBase64, 'base64')
    console.log('[DOC] PDF buffer size:', buffer.length, 'bytes')
    // pdf-parse v1 — simple, no worker needed
    const pdfParse = (await import('pdf-parse')).default
    const result = await pdfParse(buffer)
    extractedText = result.text?.trim() ?? ''
    console.log('[DOC] PDF text extracted, length:', extractedText.length, 'preview:', extractedText.slice(0, 200))
  } catch (err) {
    console.error('[DOC] PDF parse FAILED:', err)
  }

  if (!extractedText || extractedText.length < 40) {
    console.log('[DOC] PDF has no/insufficient text, rejecting')
    return NextResponse.json({
      isValid: false,
      invalidReason: 'This appears to be a scanned PDF with no readable text. Please upload a photo (JPG/PNG) instead.',
      confidenceScore: 0, fileName, leaveType,
      checks: emptyChecks(leaveType), failureReasons: ['Scanned PDF detected — upload a clear image.'],
    })
  }

  console.log('[DOC] Calling GPT-5.1 for PDF text analysis...')
  const prompt = buildPrompt(leaveType)
  const response = await openai.chat.completions.create({
    model: 'gpt-5.1',
    messages: [
      { role: 'system', content: prompt },
      { role: 'user', content: `Verify this ${leaveType} leave document.\nFilename: ${fileName}\n\n--- EXTRACTED TEXT ---\n${extractedText.slice(0, 5000)}\n--- END ---` },
    ],
    max_completion_tokens: 900,
    response_format: { type: 'json_object' },
  })
  console.log('[DOC] GPT response received, content length:', response.choices[0].message.content?.length ?? 0)

  return parseResult(response.choices[0].message.content ?? '{}', fileName, leaveType)
}

// ── Image handler ─────────────────────────────────────────────────────────────
async function processImage(rawBase64: string, fileName: string, leaveType: string): Promise<NextResponse> {
  console.log('[DOC] Processing image:', fileName, 'leaveType:', leaveType, 'base64 length:', rawBase64.length)

  let compressedBase64: string
  try {
    const inputBuffer = Buffer.from(rawBase64, 'base64')
    console.log('[DOC] Input buffer:', inputBuffer.length, 'bytes. Compressing with sharp...')
    const compressed = await sharp(inputBuffer)
      .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82, progressive: true })
      .toBuffer()
    compressedBase64 = compressed.toString('base64')
    console.log('[DOC] Compressed:', inputBuffer.length, '->', compressed.length, 'bytes (', Math.round(compressed.length / inputBuffer.length * 100), '% )')
  } catch (err) {
    console.error('[DOC] Sharp compression FAILED:', err)
    console.log('[DOC] Falling back to raw base64 (no compression)')
    compressedBase64 = rawBase64
  }

  console.log('[DOC] Calling GPT-5.1 Vision for image analysis...')
  try {
    const prompt = buildPrompt(leaveType)
    const response = await openai.chat.completions.create({
      model: 'gpt-5.1',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: `Verify this ${leaveType} leave document image.\n\n${prompt}` },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${compressedBase64}`, detail: 'high' } },
        ],
      }],
      max_completion_tokens: 900,
      response_format: { type: 'json_object' },
    })
    console.log('[DOC] GPT Vision response received, content length:', response.choices[0].message.content?.length ?? 0)
    console.log('[DOC] Raw GPT response:', response.choices[0].message.content?.slice(0, 300))

    return parseResult(response.choices[0].message.content ?? '{}', fileName, leaveType)
  } catch (err: any) {
    console.error('[DOC] GPT Vision call FAILED:', err?.message ?? err, 'Status:', err?.status, 'Code:', err?.code)
    return NextResponse.json({
      isValid: false,
      invalidReason: `Verification failed: ${err?.message ?? 'Unknown error'}. Please try again.`,
      confidenceScore: 0, fileName, leaveType,
      checks: emptyChecks(leaveType), failureReasons: [`API error: ${err?.message ?? 'Unknown'}`],
    })
  }
}

// ── Upload to Firebase Storage ────────────────────────────────────────────────
async function uploadToStorage(rawBase64: string, fileName: string, uid: string): Promise<string | null> {
  try {
    const bucket = getAdminStorage().bucket()
    const ext = fileName.split('.').pop()?.toLowerCase() ?? 'jpg'
    const storagePath = `documents/${uid}/${Date.now()}_${fileName}`
    const buffer = Buffer.from(rawBase64, 'base64')
    const contentType = ext === 'pdf' ? 'application/pdf' : `image/${ext === 'jpg' ? 'jpeg' : ext}`

    console.log('[DOC] Uploading to Storage:', storagePath, 'size:', buffer.length, 'bytes', 'bucket:', bucket.name)

    const file = bucket.file(storagePath)
    await file.save(buffer, {
      metadata: { contentType },
      public: true,
    })

    // Try signed URL first (works even without public access), fallback to public URL
    let fileUrl: string
    try {
      const [url] = await file.getSignedUrl({ action: 'read', expires: '2030-01-01' })
      fileUrl = url
    } catch {
      fileUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`
    }

    console.log('[DOC] Upload SUCCESS:', fileUrl.slice(0, 100) + '...')
    return fileUrl
  } catch (err: any) {
    console.error('[DOC] Storage upload FAILED:', err?.message ?? err)
    return null
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const token = cookieStore.get('session')?.value
  console.log('[DOC] Auth check — session cookie present:', !!token, 'length:', token?.length ?? 0)
  if (!token) {
    console.error('[DOC] AUTH FAIL: No session cookie found. Available cookies:', [...cookieStore.getAll()].map(c => c.name).join(', ') || 'NONE')
    return NextResponse.json({ error: 'Unauthorised — no session cookie' }, { status: 401 })
  }

  let uid: string
  try {
    const decoded = await getAdminAuth().verifyIdToken(token)
    uid = decoded.uid
    console.log('[DOC] Auth OK — uid:', uid)
  } catch (err: any) {
    console.error('[DOC] AUTH FAIL: Token verification failed:', err?.message ?? err)
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
  }

  const { base64, fileName = 'document', leaveType = 'Sick' } = await req.json()
  console.log('[DOC] === NEW REQUEST ===', fileName, '| leaveType:', leaveType, '| base64 starts with:', base64?.slice(0, 50))

  const rawBase64 = base64.includes(',') ? base64.split(',')[1] : base64
  console.log('[DOC] Raw base64 length after strip:', rawBase64.length, '| first 20 chars:', rawBase64.slice(0, 20))

  const isPdf =
    fileName.toLowerCase().endsWith('.pdf') ||
    rawBase64.startsWith('JVBER')

  console.log('[DOC] Detected type:', isPdf ? 'PDF' : 'IMAGE')

  try {
    // Upload to Firebase Storage in parallel with verification
    const uploadPromise = uploadToStorage(rawBase64, fileName, uid)

    let verifyResult: NextResponse
    if (isPdf) {
      verifyResult = await processPdf(rawBase64, fileName, leaveType)
    } else {
      verifyResult = await processImage(rawBase64, fileName, leaveType)
    }

    const fileUrl = await uploadPromise
    console.log('[DOC] File URL:', fileUrl ?? 'UPLOAD FAILED (non-blocking)')

    // Inject fileUrl into the response
    const body = await verifyResult.json()
    return NextResponse.json({ ...body, fileUrl })
  } catch (err: any) {
    console.error('[DOC] TOP-LEVEL ERROR:', err?.message ?? err, err?.stack?.slice(0, 300))
    return NextResponse.json({
      isValid: false,
      invalidReason: `Verification error: ${err?.message ?? 'Unknown'}. Please try again.`,
      confidenceScore: 0, fileName, leaveType,
      checks: emptyChecks(leaveType), failureReasons: [`Error: ${err?.message ?? 'Unknown'}`],
    })
  }
}
