/**
 * document-mcp — AI-powered document verification and management
 * Tools: extract_document_fields, mark_document_uploaded, get_document_status
 */
import { tool } from 'ai'
import { z } from 'zod'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminDb } from '@/lib/firebase/admin'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export const documentMcpTools = {
  extract_document_fields: tool({
    description: 'Use gpt-5.1 Vision to read a medical certificate or supporting document. Extracts all relevant fields, determines validity, and returns structured data. Does NOT write to Firestore — only returns extracted data.',
    inputSchema: z.object({
      base64Image: z.string().describe('Base64 encoded image (with or without data URL prefix)'),
      fileName: z.string().optional().default('document'),
      leaveType: z.string().describe('The leave type this document is for — affects validation rules'),
    }),
    execute: async ({ base64Image, fileName, leaveType }) => {
      // Strip data URL prefix if present
      const imageData = base64Image.includes(',') ? base64Image.split(',')[1] : base64Image

      const systemPrompt = `You are a document verification expert for an HR system.
Analyse the provided document image and extract ALL relevant fields.
Be precise. If a field is unclear or missing, say so explicitly — do NOT guess.

For a VALID medical certificate you need ALL of:
- Official letterhead or hospital/clinic form (not a personal letter)
- Doctor's full name visible
- Medical signature or stamp detected
- Recommended rest period (clear start AND end dates)
- Date of issue consistent with the leave period
- Some form of diagnosis description (even general like "respiratory illness")

Output ONLY a JSON object with these exact fields:
{
  "patientName": string | null,
  "doctorName": string | null,
  "hospital": string | null,
  "recommendedRestStart": "YYYY-MM-DD" | null,
  "recommendedRestEnd": "YYYY-MM-DD" | null,
  "diagnosisType": string | null,
  "dateOfIssue": "YYYY-MM-DD" | null,
  "signatureDetected": boolean,
  "isOnLetterhead": boolean,
  "isValid": boolean,
  "invalidReason": string | null,
  "confidenceScore": number between 0 and 1,
  "documentType": "medical_certificate" | "hospital_discharge" | "birth_certificate" | "death_certificate" | "personal_letter" | "other"
}`

      const response = await openai.chat.completions.create({
        model: 'gpt-5.1',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Verify this document for a ${leaveType} leave request. ${systemPrompt}`,
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${imageData}`,
                  detail: 'high',
                },
              },
            ],
          },
        ],
        max_completion_tokens: 600,
        response_format: { type: 'json_object' },
      })

      let fields: Record<string, unknown> = {}
      try {
        fields = JSON.parse(response.choices[0].message.content ?? '{}')
      } catch {
        return {
          isValid: false,
          invalidReason: 'Unable to read the document. Please ensure the image is clear and try again.',
          confidenceScore: 0,
        }
      }

      // Additional validation: if confidence is low, mark invalid
      if (typeof fields.confidenceScore === 'number' && fields.confidenceScore < 0.5) {
        fields.isValid = false
        fields.invalidReason = fields.invalidReason ?? 'Image quality too low to verify all required fields. Please upload a clearer photo.'
      }

      return {
        ...fields,
        fileName,
        leaveType,
      }
    },
  }),

  mark_document_uploaded: tool({
    description: 'Save a verified document to Firestore and update the case docStatus. Set employeeOverride=true when the employee chose to proceed despite AI flagging the document as invalid — the document is saved for HR review instead of being rejected.',
    inputSchema: z.object({
      caseId: z.string(),
      employeeId: z.string(),
      fileName: z.string(),
      fileUrl: z.string().nullable().optional().describe('Public URL of the uploaded document in Firebase Storage'),
      employeeOverride: z.boolean().optional().default(false)
        .describe('True when employee explicitly chose to proceed despite AI document warnings'),
      extractedFields: z.object({
        patientName: z.string().nullable(),
        doctorName: z.string().nullable(),
        hospital: z.string().nullable(),
        recommendedRestStart: z.string().nullable(),
        recommendedRestEnd: z.string().nullable(),
        diagnosisType: z.string().nullable(),
        signatureDetected: z.boolean(),
        isValid: z.boolean(),
        invalidReason: z.string().nullable(),
        confidenceScore: z.number(),
      }),
    }),
    execute: async ({ caseId, employeeId, fileName, fileUrl, employeeOverride, extractedFields }) => {
      const db = getAdminDb()
      const now = FieldValue.serverTimestamp()

      // employee_override: employee insisted on submitting despite AI warnings — HR will review
      const docStatus = extractedFields.isValid
        ? 'valid'
        : (employeeOverride ? 'employee_override' : 'invalid')

      const docRef = await db.collection('documents').add({
        caseId,
        employeeId,
        fileName,
        fileUrl: fileUrl ?? null,
        uploadedAt: now,
        extractedFields,
        status: docStatus,
        employeeOverride: employeeOverride ?? false,
      })

      const caseSnap = await db.collection('cases').doc(caseId).get()
      const existingNotes = caseSnap.exists ? (caseSnap.data()!.notes ?? []) : []

      let noteText: string
      let caseDocStatus: string
      let caseStatus: string

      if (extractedFields.isValid) {
        noteText = `Document verified: ${fileName} — confidence ${Math.round(extractedFields.confidenceScore * 100)}%`
        caseDocStatus = 'uploaded'
        caseStatus = 'open'
      } else if (employeeOverride) {
        noteText = `Document uploaded by employee (AI flagged issues, employee chose to proceed — HR review required): ${extractedFields.invalidReason ?? 'See document'}`
        caseDocStatus = 'uploaded'
        caseStatus = 'open'
      } else {
        noteText = `Document invalid: ${extractedFields.invalidReason ?? 'Verification failed'}`
        caseDocStatus = 'invalid'
        caseStatus = 'pending_docs'
      }

      await db.collection('cases').doc(caseId).update({
        docStatus: caseDocStatus,
        status: caseStatus,
        updatedAt: now,
        notes: [...existingNotes, {
          text: noteText,
          actorId: employeeId,
          actorName: 'Employee',
          actorRole: 'employee',
          timestamp: new Date().toISOString(),
        }],
      })

      return {
        success: true,
        documentId: docRef.id,
        caseId,
        status: docStatus,
        employeeOverride: employeeOverride ?? false,
      }
    },
  }),

  get_document_status: tool({
    description: 'Check the document upload status for a specific case.',
    inputSchema: z.object({
      caseId: z.string(),
    }),
    execute: async ({ caseId }) => {
      const db = getAdminDb()
      const snap = await db.collection('documents').where('caseId', '==', caseId).get()

      if (snap.empty) {
        return { caseId, hasDocument: false, status: 'missing' }
      }

      const docData = snap.docs[0].data()
      return {
        caseId,
        hasDocument: true,
        status: docData.status,
        extractedFields: docData.extractedFields,
        uploadedAt: docData.uploadedAt?.toDate?.()?.toISOString() ?? null,
      }
    },
  }),

  show_document_review: tool({
    description: 'Show a visual document review card with action buttons (Proceed / Cancel) when a document fails AI verification. Call this INSTEAD of plain text whenever isValid=false or confidenceScore < 0.7 after a document upload.',
    inputSchema: z.object({
      fileName: z.string(),
      confidenceScore: z.number(),
      isValid: z.boolean(),
      documentType: z.string().optional().default('other'),
      checks: z.record(z.string(), z.object({ pass: z.boolean(), note: z.string() })),
      failureReasons: z.array(z.string()).optional().default([]),
    }),
    execute: async (args) => ({
      ui_component: 'DocumentReviewCard',
      ...args,
    }),
  }),

  list_case_documents: tool({
    description: 'List all documents uploaded for a case. Admin use — shows all upload attempts, valid and invalid.',
    inputSchema: z.object({
      caseId: z.string(),
    }),
    execute: async ({ caseId }) => {
      const db = getAdminDb()
      const snap = await db.collection('documents').where('caseId', '==', caseId).get()
      if (snap.empty) return { caseId, documents: [], total: 0, message: 'No documents uploaded for this case.' }
      const docs = snap.docs.map((d) => {
        const data = d.data()
        return {
          documentId: d.id, fileName: data.fileName ?? 'unknown', fileUrl: data.fileUrl ?? null,
          status: data.status, confidenceScore: data.extractedFields?.confidenceScore ?? null,
          doctorName: data.extractedFields?.doctorName ?? null, hospital: data.extractedFields?.hospital ?? null,
          isValid: data.extractedFields?.isValid ?? false, uploadedAt: data.uploadedAt?.toDate?.()?.toISOString() ?? null,
        }
      })
      return { caseId, documents: docs, total: docs.length }
    },
  }),
}
