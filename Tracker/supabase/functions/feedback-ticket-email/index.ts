// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer'
import { cleanMailHeader, emailTemplate, escapeHtml, fromAddress, stripHtml } from '../_shared/email-template.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const statusLabel = (status = 'open') => status.charAt(0).toUpperCase() + status.slice(1)
const priorityLabel = (priority = 'medium') => priority.charAt(0).toUpperCase() + priority.slice(1)

function row(label: string, value: unknown) {
  if (value === null || value === undefined || value === '') return ''
  return `<tr><td style="padding:7px 12px;color:#7b8190;font-size:13px;">${escapeHtml(label)}</td><td style="padding:7px 12px;color:#2f3140;font-size:13px;font-weight:600;">${escapeHtml(String(value))}</td></tr>`
}

function ticketCreatedHtml(report: any, userEmail: string) {
  const device = report.device_info || {}
  const rows = [
    row('Title', report.title),
    row('Type', String(report.type || '').replace(/_/g, ' ')),
    row('Priority', priorityLabel(report.priority)),
    row('User', userEmail),
    row('Created', new Date(report.created_at).toLocaleString('en-IN')),
    row('Device', device.device_type),
    row('OS', device.os),
    row('Browser', device.browser),
    row('Viewport', device.viewport),
    row('App version', report.app_version),
  ].join('')

  return emailTemplate({
    preview: `New Spendova ticket: ${report.title}`,
    title: 'New Spendova support ticket',
    body: [],
    contentHtml: `
      <div style="color:#3f4254;font-size:15px;line-height:1.65;">
        <p>A user submitted a new Spendova feedback ticket.</p>
        <table style="width:100%;border-collapse:collapse;background:#f8f5ff;border:1px solid #ece6ff;border-radius:14px;overflow:hidden;margin:16px 0;">${rows}</table>
        <p style="font-weight:700;margin:0 0 8px;color:#2f3140;">Description</p>
        <div style="white-space:pre-line;border-left:3px solid #7c3aed;padding-left:14px;">${escapeHtml(report.description || '')}</div>
      </div>
    `,
    footer: 'Spendova admin notification',
  })
}

function ticketUpdatedHtml(report: any, message: string) {
  const cleanMessage = String(message || '').trim()
  const visibleMessage = cleanMessage.toUpperCase() === 'N/A' ? '' : cleanMessage
  return emailTemplate({
    preview: `Your ticket was updated to ${statusLabel(report.status)}.`,
    title: 'Your Spendova ticket was updated',
    body: [],
    contentHtml: `
      <div style="color:#3f4254;font-size:15px;line-height:1.65;">
        <p>Your ticket <strong>${escapeHtml(report.title)}</strong> has been updated.</p>
        <table style="width:100%;border-collapse:collapse;background:#f8f5ff;border:1px solid #ece6ff;border-radius:14px;overflow:hidden;margin:16px 0;">
          ${row('Status', statusLabel(report.status))}
          ${row('Priority', priorityLabel(report.priority))}
        </table>
        ${visibleMessage ? `<p style="font-weight:700;margin:0 0 8px;color:#2f3140;">Admin update</p><div style="white-space:pre-line;border-left:3px solid #7c3aed;padding-left:14px;">${escapeHtml(visibleMessage)}</div>` : ''}
      </div>
    `,
    footer: 'Spendova support',
  })
}

async function getUserEmail(supabaseAdmin: any, userId: string) {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId)
  if (error) throw error
  return data?.user?.email || ''
}

async function getAdminEmails(supabaseAdmin: any, fallbackEmail: string) {
  const { data: admins, error } = await supabaseAdmin.from('admin_users').select('user_id')
  if (error) throw error
  const emails: string[] = []
  for (const admin of admins || []) {
    try {
      const email = await getUserEmail(supabaseAdmin, admin.user_id)
      if (email) emails.push(email)
    } catch (error) {
      console.warn('Could not resolve admin email', admin.user_id, error)
    }
  }
  return emails.length ? emails : [fallbackEmail].filter(Boolean)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace('Bearer ', '')
    const { data: userData, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !userData.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized access' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { mode, reportId, userUpdateMessage } = await req.json()
    if (!reportId || !['created', 'updated'].includes(mode)) {
      return new Response(JSON.stringify({ error: 'mode and reportId are required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { data: report, error: reportError } = await supabaseAdmin
      .from('feedback_reports')
      .select('id,user_id,type,title,description,priority,status,device_info,app_version,created_at')
      .eq('id', reportId)
      .single()
    if (reportError || !report) throw reportError || new Error('Ticket not found')

    const { data: adminUser } = await supabaseAdmin.from('admin_users').select('user_id').eq('user_id', userData.user.id).maybeSingle()
    const isAdmin = Boolean(adminUser)
    if (mode === 'created' && report.user_id !== userData.user.id && !isAdmin) {
      return new Response(JSON.stringify({ error: 'You can only notify admins about your own ticket.' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    if (mode === 'updated' && !isAdmin) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const SMTP_HOST = Deno.env.get('SMTP_HOST') || 'smtp.gmail.com'
    const SMTP_PORT = parseInt(Deno.env.get('SMTP_PORT') || '465')
    const SMTP_USER = Deno.env.get('SMTP_USER')
    const SMTP_PASS = Deno.env.get('SMTP_PASS')
    if (!SMTP_USER || !SMTP_PASS) throw new Error('Missing SMTP credentials. Please set SMTP_USER and SMTP_PASS secrets.')

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    })

    const userEmail = await getUserEmail(supabaseAdmin, report.user_id)
    if (!userEmail) throw new Error('Ticket user email could not be resolved')

    const recipients = mode === 'created' ? await getAdminEmails(supabaseAdmin, SMTP_USER) : [userEmail]
    const subject = mode === 'created'
      ? `New Spendova ticket: ${report.title}`
      : `Spendova ticket update: ${report.title}`
    const html = mode === 'created'
      ? ticketCreatedHtml(report, userEmail)
      : ticketUpdatedHtml(report, userUpdateMessage)
    const text = stripHtml(html)

    const info = await transporter.sendMail({
      from: fromAddress(SMTP_USER),
      to: recipients,
      subject: cleanMailHeader(subject),
      text,
      html,
    })

    console.log('Feedback ticket email sent', info.messageId, mode, report.id)
    return new Response(JSON.stringify({ success: true, recipientCount: recipients.length }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    console.error('Feedback ticket email error', error)
    return new Response(JSON.stringify({ error: error.message || 'Could not send ticket email' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
