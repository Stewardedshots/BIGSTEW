import type { Config, Context } from '@netlify/functions'
import { getStore } from '@netlify/blobs'

type GalleryMeta = {
  code: string
  clientName: string
  clientEmail: string
  files: { name: string; size: number; type: string; key: string }[]
  createdAt: string
  updatedAt?: string
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function generateCode(length = 6): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  let out = ''
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length]
  }
  return out
}

function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_')
  return cleaned.slice(0, 120) || 'photo'
}

export default async (req: Request, context: Context) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 })
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return Response.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const clientName = String(form.get('clientName') || '').trim()
  const clientEmail = String(form.get('clientEmail') || '').trim().toLowerCase()
  const existingCode = String(form.get('code') || '').trim().toUpperCase()
  const files = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0)

  if (!files.length) {
    return Response.json({ error: 'Attach at least one photo before sending.' }, { status: 400 })
  }

  const galleries = getStore({ name: 'galleries', consistency: 'strong' })
  const photos = getStore('gallery-photos')

  let meta: GalleryMeta | null = null
  let code = existingCode

  if (code) {
    meta = await galleries.get(code, { type: 'json' }) as GalleryMeta | null
    if (!meta) {
      return Response.json({ error: 'Gallery session expired. Please start the upload again.' }, { status: 404 })
    }
    if (clientEmail && clientEmail !== meta.clientEmail) {
      return Response.json({ error: 'Client email does not match this gallery.' }, { status: 403 })
    }
  } else {
    if (!clientName || !clientEmail) {
      return Response.json({ error: 'Client name and email are required.' }, { status: 400 })
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail)) {
      return Response.json({ error: 'Please provide a valid client email.' }, { status: 400 })
    }
    for (let attempt = 0; attempt < 6; attempt++) {
      const candidate = generateCode(6)
      const existing = await galleries.getMetadata(candidate)
      if (!existing) {
        code = candidate
        break
      }
    }
    if (!code) {
      return Response.json({ error: 'Could not allocate an access code. Please retry.' }, { status: 500 })
    }
    meta = {
      code,
      clientName,
      clientEmail,
      files: [],
      createdAt: new Date().toISOString(),
    }
  }

  const seen = new Set(meta.files.map((f) => f.name))
  const addedNames: string[] = []
  for (const file of files) {
    let name = sanitizeFilename(file.name || 'photo')
    let unique = name
    let counter = 1
    while (seen.has(unique)) {
      const dot = name.lastIndexOf('.')
      const base = dot > 0 ? name.slice(0, dot) : name
      const ext = dot > 0 ? name.slice(dot) : ''
      unique = `${base}_${counter}${ext}`
      counter++
    }
    seen.add(unique)
    const key = `${code}/${unique}`
    const buffer = await file.arrayBuffer()
    await photos.set(key, buffer, {
      metadata: { contentType: file.type || 'application/octet-stream' },
    })
    meta.files.push({ name: unique, size: file.size, type: file.type || '', key })
    addedNames.push(unique)
  }

  meta.updatedAt = new Date().toISOString()
  await galleries.setJSON(code, meta)

  return Response.json({
    ok: true,
    code,
    fileCount: meta.files.length,
    added: addedNames,
    clientName: meta.clientName,
    clientEmail: meta.clientEmail,
  })
}

export const config: Config = {
  path: '/api/send-photos',
  method: 'POST',
}
