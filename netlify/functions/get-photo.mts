import type { Config, Context } from '@netlify/functions'
import { getStore } from '@netlify/blobs'

type GalleryMeta = {
  clientEmail: string
  files: { name: string; type: string }[]
}

export default async (req: Request, context: Context) => {
  const url = new URL(req.url)
  const code = String(context.params.code || '').toUpperCase()
  const name = String(context.params.name || '')
  const email = (url.searchParams.get('email') || '').trim().toLowerCase()

  if (!code || !name) {
    return new Response('Not found', { status: 404 })
  }

  const galleries = getStore('galleries')
  const meta = await galleries.get(code, { type: 'json' }) as GalleryMeta | null
  if (!meta) {
    return new Response('Gallery not found', { status: 404 })
  }
  if (!email || email !== meta.clientEmail) {
    return new Response('Access denied', { status: 403 })
  }

  const fileMeta = meta.files.find((f) => f.name === name)
  if (!fileMeta) {
    return new Response('Photo not found', { status: 404 })
  }

  const photos = getStore('gallery-photos')
  const blob = await photos.get(`${code}/${name}`, { type: 'stream' }) as ReadableStream | null
  if (!blob) {
    return new Response('Photo not found', { status: 404 })
  }

  const disposition = url.searchParams.get('view') === '1' ? 'inline' : 'attachment'
  const safeName = name.replace(/"/g, '')
  return new Response(blob, {
    headers: {
      'Content-Type': fileMeta.type || 'application/octet-stream',
      'Content-Disposition': `${disposition}; filename="${safeName}"`,
      'Cache-Control': 'private, max-age=3600',
    },
  })
}

export const config: Config = {
  path: '/api/photos/:code/:name',
  method: 'GET',
}
