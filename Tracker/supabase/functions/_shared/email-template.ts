export const MAIL_FROM_NAME = 'Spendova'

type EmailButton = {
  label: string
  url: string
}

type EmailDetail = {
  label: string
  value: string
  highlight?: boolean
}

type EmailTemplateOptions = {
  preview: string
  title: string
  body: string[]
  contentHtml?: string
  button?: EmailButton
  details?: EmailDetail[]
  note?: string
  footer?: string
}

export function fromAddress(email: string) {
  return `${MAIL_FROM_NAME} <${email}>`
}

export function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function stripHtml(value: string) {
  return String(value || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

export function cleanMailHeader(value: unknown) {
  return String(value ?? '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function emailTemplate(options: EmailTemplateOptions) {
  const preview = escapeHtml(options.preview)
  const title = escapeHtml(options.title)
  const footer = escapeHtml(options.footer || 'Spendova')
  const bodyHtml = options.body
    .filter(Boolean)
    .map((paragraph) => `<p style="margin:0 0 16px;color:#3f4254;font-size:15px;line-height:1.65;">${paragraph}</p>`)
    .join('')

  const detailsHtml = options.details?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0;border-collapse:separate;border-spacing:0 10px;">
        ${options.details.map((detail) => `
          <tr>
            <td style="padding:14px 16px;background:${detail.highlight ? '#f3f0ff' : '#fafafa'};border:1px solid ${detail.highlight ? '#ded6ff' : '#ececf1'};border-radius:10px;">
              <div style="margin:0 0 5px;color:#73778c;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;">${escapeHtml(detail.label)}</div>
              <div style="color:${detail.highlight ? '#5b3fd6' : '#1f2230'};font-size:${detail.highlight ? '22px' : '16px'};font-weight:700;line-height:1.35;">${detail.value}</div>
            </td>
          </tr>
        `).join('')}
      </table>`
    : ''

  const buttonHtml = options.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 8px;">
        <tr>
          <td style="border-radius:8px;background:#5b3fd6;">
            <a href="${escapeHtml(options.button.url)}" style="display:inline-block;padding:13px 22px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:8px;">${escapeHtml(options.button.label)}</a>
          </td>
        </tr>
      </table>`
    : ''

  const noteHtml = options.note
    ? `<p style="margin:20px 0 0;color:#74788d;font-size:13px;line-height:1.6;">${options.note}</p>`
    : ''

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${title}</title>
  <style>
    @media only screen and (max-width: 620px) {
      .email-page { padding: 16px !important; }
      .email-card { width: 100% !important; }
      .email-content { padding: 24px 18px !important; }
      .email-title { font-size: 22px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#f5f6fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#1f2230;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preview}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="email-page" style="background:#f5f6fa;padding:28px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" class="email-card" style="width:560px;max-width:100%;background:#ffffff;border:1px solid #e6e8f0;border-radius:14px;overflow:hidden;">
          <tr>
            <td style="padding:18px 24px;background:#ffffff;border-bottom:1px solid #eceef4;">
              <div style="color:#5b3fd6;font-size:16px;font-weight:800;letter-spacing:.02em;">Spendova</div>
            </td>
          </tr>
          <tr>
            <td class="email-content" style="padding:30px 28px;">
              <h1 class="email-title" style="margin:0 0 18px;color:#1f2230;font-size:25px;line-height:1.25;font-weight:750;">${title}</h1>
              ${bodyHtml}
              ${options.contentHtml || ''}
              ${detailsHtml}
              ${buttonHtml}
              ${noteHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:18px 24px;background:#fbfbfd;border-top:1px solid #eceef4;text-align:center;">
              <p style="margin:0;color:#85899b;font-size:12px;line-height:1.5;">${footer}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
