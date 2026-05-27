// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer'
import { cleanMailHeader, emailTemplate, escapeHtml, fromAddress } from '../_shared/email-template.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const supportedTypes = new Set([
  'friend_request_received',
  'friend_request_accepted',
  'split_expense_added',
  'split_expense_updated',
  'split_expense_paid',
  'split_settled',
  'split_expense_deleted',
  'group_created_user_added',
  'group_user_added',
  'group_expense_added',
  'group_expense_updated',
  'group_expense_paid',
  'group_settled',
  'group_expense_deleted',
  'group_user_removed',
  'group_deleted',
])

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function money(value?: number | null) {
  if (!Number.isFinite(Number(value))) return null
  return `INR ${Number(value).toFixed(2)}`
}

function notificationEmailHtml(title: string, message: string, details: Array<{ label: string; value?: string | null }>) {
  return emailTemplate({
    preview: message,
    title,
    body: [escapeHtml(message)],
    details: details.filter((item) => item.value).map((item) => ({
      label: escapeHtml(item.label),
      value: escapeHtml(item.value || ''),
      highlight: item.label === 'Amount',
    })),
    footer: 'Spendova shared activity notification',
  })
}

async function getActorName(supabaseAdmin: any, actorId: string) {
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('full_name, username')
    .eq('user_id', actorId)
    .maybeSingle()
  return data?.full_name || data?.username || 'Someone'
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace('Bearer ', '')
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token)
    if (userError || !userData.user) return json({ error: 'Authentication required' }, 401)

    const body = await req.json()
    const type = String(body.type || '')
    if (!supportedTypes.has(type)) return json({ error: 'Unsupported notification type' }, 400)

    const actorId = userData.user.id
    const actorName = await getActorName(supabaseAdmin, actorId)
    const recipients = [...new Set((body.recipients || []).filter(Boolean))]
      .filter((id: string) => id !== actorId)

    if (!recipients.length) return json({ success: true, inserted: 0, emailSent: false })

    const title = String(body.title || 'Spendova update').replaceAll('{actor}', actorName).slice(0, 140)
    const message = String(body.message || `${actorName} updated a shared item.`).replaceAll('{actor}', actorName).slice(0, 500)
    const entityType = String(body.entity_type || 'activity').slice(0, 60)
    const entityId = body.entity_id || null
    const amount = money(body.amount)
    const groupName = body.group_name ? String(body.group_name) : null
    const expenseName = body.expense_name ? String(body.expense_name) : null

    const dedupeSince = new Date(Date.now() - 15_000).toISOString()
    const rows = []
    for (const userId of recipients) {
      let existingQuery = supabaseAdmin
        .from('notifications')
        .select('id')
        .eq('user_id', userId)
        .eq('actor_id', actorId)
        .eq('type', type)
        .eq('entity_type', entityType)
        .gte('created_at', dedupeSince)
        .limit(1)

      existingQuery = entityId ? existingQuery.eq('entity_id', entityId) : existingQuery.is('entity_id', null)
      const { data: existing } = await existingQuery
      if (existing?.length) continue
      rows.push({
      user_id: userId,
      actor_id: actorId,
      type,
      title,
      message,
      entity_type: entityType,
      entity_id: entityId,
      is_read: false,
      })
    }

    if (!rows.length) return json({ success: true, inserted: 0, emailSent: false, deduped: true })

    const { error: insertError } = await supabaseAdmin.from('notifications').insert(rows)
    if (insertError) throw insertError

    const SMTP_HOST = Deno.env.get('SMTP_HOST') || 'smtp.gmail.com'
    const SMTP_PORT = parseInt(Deno.env.get('SMTP_PORT') || '465')
    const SMTP_USER = Deno.env.get('SMTP_USER')
    const SMTP_PASS = Deno.env.get('SMTP_PASS')

    let sent = 0
    if (SMTP_USER && SMTP_PASS) {
      const { data: usersData, error: usersError } = await supabaseAdmin.auth.admin.listUsers()
      if (usersError) throw usersError
      const userEmailMap: Record<string, string> = {}
      usersData?.users?.forEach((user: any) => {
        if (user.id && user.email) userEmailMap[user.id] = user.email
      })

      const transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_PORT === 465,
        auth: { user: SMTP_USER, pass: SMTP_PASS },
      })

      const html = notificationEmailHtml(title, message, [
        { label: 'By', value: actorName },
        { label: 'Expense', value: expenseName },
        { label: 'Group', value: groupName },
        { label: 'Amount', value: amount },
      ])

      for (const userId of rows.map((row) => row.user_id)) {
        const email = userEmailMap[userId]
        if (!email) continue
        await transporter.sendMail({
          from: fromAddress(SMTP_USER),
          to: email,
          subject: cleanMailHeader(title),
          html,
        })
        sent += 1
      }
    } else {
      console.warn('SMTP credentials missing. Notification email skipped.')
    }

    return json({ success: true, inserted: rows.length, emailSent: sent > 0, sent })
  } catch (error) {
    console.error('send-shared-notification error:', error)
    return json({ error: 'Could not send notification' }, 500)
  }
})
