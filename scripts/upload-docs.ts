/**
 * Upload all mock documents from scripts/mock-docs/ to Firebase Storage
 * Run: npx tsx scripts/upload-docs.ts
 */
import { initializeApp, cert } from 'firebase-admin/app'
import { getStorage } from 'firebase-admin/storage'
import * as fs from 'fs'
import * as path from 'path'

// Read .env.local manually since shell export breaks on private keys
const envPath = path.join(__dirname, '..', '.env.local')
const envContent = fs.readFileSync(envPath, 'utf-8')
const env: Record<string, string> = {}
for (const line of envContent.split('\n')) {
  if (!line || line.startsWith('#')) continue
  const eqIdx = line.indexOf('=')
  if (eqIdx === -1) continue
  const key = line.slice(0, eqIdx).trim()
  let val = line.slice(eqIdx + 1).trim()
  if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1)
  env[key] = val
}

const app = initializeApp({
  storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  credential: cert({
    projectId: env.FIREBASE_PROJECT_ID,
    clientEmail: env.FIREBASE_CLIENT_EMAIL,
    privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
})

const bucket = getStorage(app).bucket()
const DOCS_DIR = path.join(__dirname, 'mock-docs')

async function main() {
  const files = fs.readdirSync(DOCS_DIR).filter(f => f.endsWith('.pdf'))
  console.log(`Uploading ${files.length} PDFs to Firebase Storage...\n`)

  const urls: Record<string, string> = {}

  for (const file of files) {
    const filePath = path.join(DOCS_DIR, file)
    const storagePath = `mock-documents/${file}`

    try {
      const storageFile = bucket.file(storagePath)
      await storageFile.save(fs.readFileSync(filePath), {
        metadata: { contentType: 'application/pdf' },
        public: true,
      })

      const fileUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`
      urls[file] = fileUrl
      console.log(`  OK ${file}`)
    } catch (err: any) {
      console.error(`  FAIL ${file}: ${err.message}`)
    }
  }

  const manifestPath = path.join(DOCS_DIR, 'urls.json')
  fs.writeFileSync(manifestPath, JSON.stringify(urls, null, 2))
  console.log(`\nDone! ${Object.keys(urls).length}/${files.length} uploaded.`)
  console.log(`URLs saved to scripts/mock-docs/urls.json`)
}

main().catch(console.error)
