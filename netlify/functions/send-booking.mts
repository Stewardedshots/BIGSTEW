import type { Config, Context } from '@netlify/functions'

type BookingPayload = {
  pkg?: string
  hasAddon?: boolean
  total?: number
  name?: string
  email?: string
  date?: string
  note?: string
}

const BOOKING_RECIPIENT = 'lauramaddockmd@gmail.com'

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildSubject(pkg: string): string {
  return `New booking request — ${pkg}`
}

function buildText(b: Required<Pick<BookingPayload, 'pkg' | 'hasAddon' | 'total' | 'name' | 'email'>> & Pick<BookingPayload, 'date' | 'note'>): string {
  const lines = [
    `New booking request from the Stewarded Shots site.`,
    ``,
    `Package: ${b.pkg}`,
    `Add-on:  ${b.hasAddon ? 'Double exposure edit (+$15)' : 'None'}`,
    `Total:   $${b.total}`,
    ``,
    `Name:  ${b.name}`,
    `Email: ${b.email}`,
  ]
  if (b.date) lines.push(`Game date: ${b.date}`)
  if (b.note) lines.push('', 'Notes:', b.note)
  lines.push('', '— Sent from stewardedshots.com')
  return lines.join('\n')
}

function buildHtml(b: Required<Pick<BookingPayload, 'pkg' | 'hasAddon' | 'total' | 'name' | 'email'>> & Pick<BookingPayload, 'date' | 'note'>): string {
  const addon = b.hasAddon ? 'Double exposure edit (+$15)' : 'None'
  const dateRow = b.date
    ? `<tr><td style="padding:4px 0;color:#5a6a7a;width:110px;">Game date</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(b.date)}</td></tr>`
    : ''
  const noteBlock = b.note
    ? `<tr><td colspan="2" style="padding:14px 0 0 0;"><div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#8a7020;font-weight:700;margin-bottom:6px;">Notes</div><div style="white-space:pre-wrap;background:#fff8e1;border:1px solid #f5c842;border-radius:8px;padding:12px 14px;">${escapeHtml(b.note)}</div></td></tr>`
    : ''
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f5e9cc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a1a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #e6dcc4;border-radius:12px;overflow:hidden;">
      <tr><td style="background:#0a1a2e;padding:22px 28px;color:#f5e9cc;font-family:'Playfair Display',Georgia,serif;font-size:22px;letter-spacing:0.05em;">Stewarded Shots — New Booking</td></tr>
      <tr><td style="padding:24px 28px 8px 28px;font-size:15px;line-height:1.6;">
        <p style="margin:0 0 18px 0;">A new booking request just came in from the website.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">
          <tr><td style="padding:4px 0;color:#5a6a7a;width:110px;">Package</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(b.pkg)}</td></tr>
          <tr><td style="padding:4px 0;color:#5a6a7a;">Add-on</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(addon)}</td></tr>
          <tr><td style="padding:4px 0;color:#5a6a7a;">Total</td><td style="padding:4px 0;font-weight:600;">$${b.total}</td></tr>
          <tr><td colspan="2" style="padding:10px 0 4px 0;border-top:1px solid #eee;"></td></tr>
          <tr><td style="padding:4px 0;color:#5a6a7a;">Name</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(b.name)}</td></tr>
          <tr><td style="padding:4px 0;color:#5a6a7a;">Email</td><td style="padding:4px 0;font-weight:600;"><a href="mailto:${escapeHtml(b.email)}" style="color:#2a7fc1;text-decoration:none;">${escapeHtml(b.email)}</a></td></tr>
          ${dateRow}
          ${noteBlock}
        </table>
      </td></tr>
      <tr><td style="background:#f5e9cc;padding:14px 28px;font-size:11px;color:#6a5a3a;border-top:1px solid #e6dcc4;">Sent from stewardedshots.com</td></tr>
    </table>
  </td></tr>
</table>
</body></html>`
}

export default async (req: Request, _context: Context) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 })
  }

  let body: BookingPayload = {}
  try {
    body = (await req.json()) as BookingPayload
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const pkg = String(body.pkg || '').trim()
  const name = String(body.name || '').trim()
  const email = String(body.email || '').trim()
  const total = Number(body.total)
  const hasAddon = Boolean(body.hasAddon)
  const date = String(body.date || '').trim()
  const note = String(body.note || '').trim()

  if (!pkg || !name || !email || !Number.isFinite(total)) {
    return Response.json(
      { error: 'Missing required fields: package, name, email, and total are required.' },
      { status: 400 },
    )
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: 'Please enter a valid email address.' }, { status: 400 })
  }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return Response.json(
      {
        error:
          'Email delivery is not configured yet. Set the RESEND_API_KEY environment variable in Netlify to enable booking emails.',
        configRequired: true,
      },
      { status: 503 },
    )
  }

  const fromAddress = process.env.EMAIL_FROM || 'StewardedShots <onboarding@resend.dev>'

  const payload = {
    from: fromAddress,
    to: [BOOKING_RECIPIENT],
    reply_to: email,
    subject: buildSubject(pkg),
    text: buildText({ pkg, hasAddon, total, name, email, date, note }),
    html: buildHtml({ pkg, hasAddon, total, name, email, date, note }),
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

  return Response.json({ ok: true })
}

export const config: Config = {
  path: '/api/send-booking',
  method: 'POST',
}
