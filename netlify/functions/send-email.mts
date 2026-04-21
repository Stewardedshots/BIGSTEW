import type { Config, Context } from '@netlify/functions'
import { getStore } from '@netlify/blobs'

type GalleryMeta = {
  code: string
  clientName: string
  clientEmail: string
  files: { name: string }[]
  createdAt: string
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildPortalUrl(req: Request, context: Context): string {
  const base = (context.site?.url || new URL(req.url).origin).replace(/\/$/, '')
  return `${base}/#receive`
}

function buildSubject(): string {
  return 'Your StewardedShots gallery is ready'
}

function buildText(opts: {
  clientName: string
  code: string
  clientEmail: string
  fileCount: number
  portalUrl: string
}): string {
  const { clientName, code, clientEmail, fileCount, portalUrl } = opts
  const greeting = clientName ? `Hi ${clientName},` : 'Hi,'
  const plural = fileCount === 1 ? 'photo is' : 'photos are'
  return [
    greeting,
    '',
    `Your ${fileCount} ${plural} ready to download on the StewardedShots Client Portal.`,
    '',
    `Access code: ${code}`,
    `Email:       ${clientEmail}`,
    '',
    `Open the portal and head to the "Receive Photos" tab:`,
    portalUrl,
    '',
    'Enter the access code together with this email address to view and download your gallery.',
    '',
    'Blessings,',
    'StewardedShots',
  ].join('\n')
}

function buildHtml(opts: {
  clientName: string
  code: string
  clientEmail: string
  fileCount: number
  portalUrl: string
}): string {
  const { clientName, code, clientEmail, fileCount, portalUrl } = opts
  const greeting = clientName ? `Hi ${escapeHtml(clientName)},` : 'Hi,'
  const plural = fileCount === 1 ? 'photo is' : 'photos are'
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f5faff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0a1a2e;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5faff;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #dbe8f5;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background:#0a1a2e;padding:22px 28px;color:#f5e9cc;font-family:'Playfair Display',Georgia,serif;font-size:22px;letter-spacing:0.05em;">
                StewardedShots
              </td>
            </tr>
            <tr>
              <td style="padding:28px 28px 8px 28px;font-size:15px;line-height:1.6;">
                <p style="margin:0 0 12px 0;">${greeting}</p>
                <p style="margin:0 0 18px 0;">Your ${fileCount} ${plural} ready to view and download on the StewardedShots Client Portal.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff8e1;border:1.5px solid #f5c842;border-radius:10px;">
                  <tr>
                    <td align="center" style="padding:18px 16px;">
                      <div style="font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#8a7020;font-weight:700;margin-bottom:8px;">Your access code</div>
                      <div style="font-family:'Playfair Display',Georgia,serif;font-size:32px;letter-spacing:0.22em;font-weight:600;color:#0a1a2e;">${escapeHtml(code)}</div>
                      <div style="font-size:12px;color:#5a7a9a;margin-top:10px;line-height:1.5;">Use this with the email address <strong>${escapeHtml(clientEmail)}</strong></div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:22px 28px 8px 28px;">
                <a href="${escapeHtml(portalUrl)}" style="display:inline-block;background:#f5c842;color:#0a1a2e;font-weight:700;text-decoration:none;padding:12px 26px;border-radius:8px;letter-spacing:0.1em;text-transform:uppercase;font-size:12px;">Open Client Portal</a>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 28px 28px 28px;font-size:13px;line-height:1.6;color:#4a6a8a;">
                <p style="margin:0 0 10px 0;">In the portal, choose <strong>Receive Photos</strong>, then enter your access code together with this email address to download your gallery.</p>
                <p style="margin:0;">If the button doesn't open, copy and paste this link:<br/><span style="color:#2a7fc1;word-break:break-all;">${escapeHtml(portalUrl)}</span></p>
              </td>
            </tr>
            <tr>
              <td style="background:#f5faff;padding:16px 28px;font-size:11px;color:#8aa7c4;border-top:1px solid #dbe8f5;">
                Blessings,<br/>StewardedShots
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

export default async (req: Request, context: Context) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 })
  }

  let body: { code?: string } = {}
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const code = String(body.code || '').trim().toUpperCase()
  if (!code) {
    return Response.json({ error: 'Missing access code.' }, { status: 400 })
  }

  const galleries = getStore('galleries')
  const meta = (await galleries.get(code, { type: 'json' })) as GalleryMeta | null
  if (!meta) {
    return Response.json({ error: 'Gallery not found for that code.' }, { status: 404 })
  }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return Response.json(
      {
        error:
          'Email delivery is not configured yet. Set the RESEND_API_KEY environment variable in Netlify to send access codes automatically. You can still share the code manually for now.',
        configRequired: true,
      },
      { status: 503 },
    )
  }

  const fromAddress = process.env.EMAIL_FROM || 'StewardedShots <onboarding@resend.dev>'
  const portalUrl = buildPortalUrl(req, context)
  const fileCount = meta.files.length

  const payload = {
    from: fromAddress,
    to: [meta.clientEmail],
    subject: buildSubject(),
    text: buildText({
      clientName: meta.clientName,
      code,
      clientEmail: meta.clientEmail,
      fileCount,
      portalUrl,
    }),
    html: buildHtml({
      clientName: meta.clientName,
      code,
      clientEmail: meta.clientEmail,
      fileCount,
      portalUrl,
    }),
  }

  let resendRes: Response
  try {
    resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
  } catch (err: any) {
    return Response.json(
      { error: `Email service request failed: ${err?.message || 'network error'}` },
      { status: 502 },
    )
  }

  if (!resendRes.ok) {
    let detail = ''
    try {
      const errJson = (await resendRes.json()) as { message?: string; name?: string }
      detail = errJson?.message || errJson?.name || ''
    } catch {
      try {
        detail = await resendRes.text()
      } catch {
        detail = ''
      }
    }
    return Response.json(
      {
        error:
          detail ||
          `Email provider returned status ${resendRes.status}. Verify RESEND_API_KEY and EMAIL_FROM are set correctly.`,
      },
      { status: 502 },
    )
  }

  return Response.json({
    ok: true,
    sentTo: meta.clientEmail,
    code,
  })
}

export const config: Config = {
  path: '/api/send-email',
  method: 'POST',
}
