import type { Config, Context } from '@netlify/functions'
import { getStore } from '@netlify/blobs'

type GalleryMeta = {
  code: string
  clientName: string
  clientEmail: string
  files: { name: string; size: number; type: string; key: string }[]
  createdAt: string
}

function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export default async (req: Request, context: Context) => {
  const url = new URL(req.url)
  let rawCode = ''
  let rawEmail = ''

  if (req.method === 'POST') {
    const contentType = req.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      try {
        const body = await req.json()
        rawCode = String(body.code || '')
        rawEmail = String(body.email || '')
      } catch {
        return Response.json({ error: 'Invalid JSON body.' }, { status: 400 })
      }
    } else {
      const form = await req.formData()
      rawCode = String(form.get('code') || '')
      rawEmail = String(form.get('email') || '')
    }
  } else {
    rawCode = url.searchParams.get('code') || ''
    rawEmail = url.searchParams.get('email') || ''
  }

  const code = normalizeCode(rawCode)
  const email = rawEmail.trim().toLowerCase()

  if (!code) {
    return Response.json({ error: 'Please enter the access code from your photographer.' }, { status: 400 })
  }

  const galleries = getStore('galleries')
  const meta = await galleries.get(code, { type: 'json' }) as GalleryMeta | null

  if (!meta) {
    return Response.json({ error: 'That access code was not recognized. Double-check it and try again.' }, { status: 404 })
  }

  if (!email || email !== meta.clientEmail) {
    return Response.json({ error: 'That email does not match the gallery. Please use the address your photographer sent it to.' }, { status: 403 })
  }

  const photos = meta.files.map((f) => ({
    name: f.name,
    size: f.size,
    type: f.type,
    url: `/api/photos/${encodeURIComponent(code)}/${encodeURIComponent(f.name)}?email=${encodeURIComponent(email)}`,
  }))

  return Response.json({
    ok: true,
    clientName: meta.clientName,
    createdAt: meta.createdAt,
    photos,
  })
}

export const config: Config = {
  path: '/api/receive-photos',
  method: ['GET', 'POST'],
}
