// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer'
import { cleanMailHeader, emailTemplate, escapeHtml, fromAddress } from '../_shared/email-template.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function inviteEmailHtml(inviterName: string, groupName: string, inviteUrl: string) {
  const displayInviterName = inviterName || 'A Spendova user'
  const displayGroupName = groupName || 'a group'
  const safeInviterName = escapeHtml(displayInviterName)
  const safeGroupName = escapeHtml(displayGroupName)
  const safeInviteUrl = escapeHtml(inviteUrl)

  return emailTemplate({
    preview: `${displayInviterName} invited you to join ${displayGroupName} on Spendova.`,
    title: 'You have been invited to a group',
    body: [
      `<strong style="color:#1f2230;">${safeInviterName}</strong> invited you to join <strong style="color:#1f2230;">${safeGroupName}</strong> on Spendova.`,
      'Use the button below to review and accept the invitation. This invitation is valid for 1 day.',
    ],
    button: { label: 'Accept invitation', url: inviteUrl },
    note: `If the button does not open, copy and paste this link into your browser:<br><a href="${safeInviteUrl}" style="color:#5b3fd6;word-break:break-all;text-decoration:none;">${safeInviteUrl}</a>`,
    footer: 'Spendova account notification',
  })
}

function notificationEmailHtml(inviterName: string, groupName: string, appUrl: string) {
  const displayInviterName = inviterName || 'A Spendova user'
  const displayGroupName = groupName || 'a group'
  const safeInviterName = escapeHtml(displayInviterName)
  const safeGroupName = escapeHtml(displayGroupName)
  const safeAppUrl = escapeHtml(appUrl)

  return emailTemplate({
    preview: `${displayInviterName} added you to ${displayGroupName} on Spendova.`,
    title: 'Group invitation pending',
    body: [
      `<strong style="color:#1f2230;">${safeInviterName}</strong> added you to <strong style="color:#1f2230;">${safeGroupName}</strong> on Spendova.`,
      'Open Spendova to review and accept the group invitation.',
    ],
    button: { label: 'Open Spendova', url: appUrl },
    note: `If the button does not open, copy and paste this link into your browser:<br><a href="${safeAppUrl}" style="color:#5b3fd6;word-break:break-all;text-decoration:none;">${safeAppUrl}</a>`,
    footer: 'Spendova account notification',
  })
}

async function cleanupEphemeralData(supabaseAdmin: any) {
  const { error } = await supabaseAdmin.rpc('cleanup_ephemeral_auth_data')
  if (error) console.warn('cleanup_ephemeral_auth_data skipped:', error.message)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const appUrl = Deno.env.get('APP_URL')?.replace(/\/$/, '')
    if (!appUrl) {
      throw new Error('APP_URL is not configured. Refusing to generate an invite link.')
    }

    const { email, group_id, group_name, inviter_name } = await req.json()
    if (!email || !group_id || !group_name || !inviter_name) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    await cleanupEphemeralData(supabaseAdmin)

    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace('Bearer ', '')
    const { data: userData, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !userData.user) {
      return new Response(JSON.stringify({ error: 'Authentication required to send invites' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { data: membership, error: memberError } = await supabaseAdmin
      .from('group_members')
      .select('user_id')
      .eq('group_id', group_id)
      .eq('user_id', userData.user.id)
      .maybeSingle()
    if (memberError || !membership) {
      return new Response(JSON.stringify({ error: 'Only group members can send invites' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    const { data: usersData } = await supabaseAdmin.auth.admin.listUsers()
    const existingUser = usersData?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase())

    const { data: existingInvite } = await supabaseAdmin
      .from('group_invites')
      .select('*')
      .eq('email', email)
      .eq('group_id', group_id)
      .maybeSingle()

    let invite
    if (existingInvite) {
      const { data, error: updateErr } = await supabaseAdmin
        .from('group_invites')
        .update({ status: 'pending', invited_by: userData.user.id, invite_type: 'email', expires_at: expiresAt })
        .eq('id', existingInvite.id)
        .select('token').single()
      if (updateErr) throw updateErr
      invite = data
    } else {
      const { data, error: insertErr } = await supabaseAdmin
        .from('group_invites')
        .insert({ group_id, invited_by: userData.user.id, email, status: 'pending', invite_type: 'email', expires_at: expiresAt })
        .select('token').single()
      if (insertErr) throw insertErr
      invite = data
    }

    const inviteUrl = `${appUrl}/accept-invite?token=${invite.token}`

    let subject: string
    let html: string

    const subjectInviterName = cleanMailHeader(inviter_name)
    const subjectGroupName = cleanMailHeader(group_name)
    if (existingUser) {
      subject = `${subjectInviterName} added you to "${subjectGroupName}" on Spendova`
      html = notificationEmailHtml(inviter_name, group_name, inviteUrl)
    } else {
      subject = `${subjectInviterName} invited you to join "${subjectGroupName}" on Spendova`
      html = inviteEmailHtml(inviter_name, group_name, inviteUrl)
    }

    const SMTP_HOST = Deno.env.get('SMTP_HOST') || 'smtp.gmail.com'
    const SMTP_PORT = parseInt(Deno.env.get('SMTP_PORT') || '465')
    const SMTP_USER = Deno.env.get('SMTP_USER')
    const SMTP_PASS = Deno.env.get('SMTP_PASS')

    let emailSent = false
    let emailReason: string | null = null
    if (SMTP_USER && SMTP_PASS) {
      const transporter = nodemailer.createTransport({
        host: SMTP_HOST, port: SMTP_PORT,
        secure: SMTP_PORT === 465,
        auth: { user: SMTP_USER, pass: SMTP_PASS },
        maxMessageSize: 100 * 1024 * 1024,
      })
      await transporter.sendMail({ from: fromAddress(SMTP_USER), to: email, subject, html })
      emailSent = true
    } else {
      emailReason = 'SMTP missing'
      console.warn('SMTP credentials missing. Invite generated in DB but email not sent.')
    }

    if (existingUser?.id && existingUser.id !== userData.user.id) {
      const { error: notificationError } = await supabaseAdmin.from('notifications').insert({
        user_id: existingUser.id,
        actor_id: userData.user.id,
        type: 'group_user_added',
        title: 'Group invitation pending',
        message: `${inviter_name} added you to ${group_name}.`,
        entity_type: 'group',
        entity_id: group_id,
        is_read: false,
      })
      if (notificationError) console.warn('Could not create group invite notification', notificationError.message)
    }

    return new Response(JSON.stringify({ success: true, inviteCreated: true, emailSent, reason: emailReason, inviteUrl, isExistingUser: !!existingUser }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error: any) {
    console.error('send-invite error:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
