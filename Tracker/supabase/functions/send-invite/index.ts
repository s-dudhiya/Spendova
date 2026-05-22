// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const APP_URL = Deno.env.get('APP_URL') || 'https://expensemate.app'

function inviteEmailHtml(inviterName: string, groupName: string, inviteUrl: string) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f0f14;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:#1a1a24;border-radius:24px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);">
    <div style="background:linear-gradient(135deg,#6c47ff,#4f8bff);padding:40px 32px;text-align:center;">
      <div style="font-size:48px;margin-bottom:12px;">💸</div>
      <h1 style="color:#fff;margin:0;font-size:26px;font-weight:800;letter-spacing:-0.5px;">You're invited to ExpenseMate</h1>
    </div>
    <div style="padding:32px;">
      <p style="color:#c4c4d4;font-size:16px;line-height:1.6;margin:0 0 20px;">
        <strong style="color:#fff;">${inviterName}</strong> invited you to join the group
        <strong style="color:#7c6af7;">${groupName}</strong> on ExpenseMate — the smartest way to split expenses with friends.
      </p>
      <div style="text-align:center;margin:28px 0;">
        <a href="${inviteUrl}" style="display:inline-block;background:linear-gradient(135deg,#6c47ff,#4f8bff);color:#fff;text-decoration:none;padding:14px 36px;border-radius:50px;font-weight:700;font-size:16px;letter-spacing:0.3px;">
          Accept Invite & Join 🎉
        </a>
      </div>
      <p style="color:#6b6b80;font-size:13px;text-align:center;margin:0;">
        Button not working? Copy this link:<br>
        <a href="${inviteUrl}" style="color:#7c6af7;word-break:break-all;">${inviteUrl}</a>
      </p>
    </div>
    <div style="padding:20px 32px;border-top:1px solid rgba(255,255,255,0.06);text-align:center;">
      <p style="color:#6b6b80;font-size:12px;margin:0;">ExpenseMate · Split smarter</p>
    </div>
  </div>
</body>
</html>`
}

function notificationEmailHtml(inviterName: string, groupName: string, appUrl: string) {
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0f0f14;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:#1a1a24;border-radius:24px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);">
    <div style="background:linear-gradient(135deg,#6c47ff,#4f8bff);padding:32px;text-align:center;">
      <div style="font-size:40px;margin-bottom:10px;">👥</div>
      <h1 style="color:#fff;margin:0;font-size:22px;font-weight:800;">Group Invite</h1>
    </div>
    <div style="padding:28px;">
      <p style="color:#c4c4d4;font-size:15px;line-height:1.6;margin:0 0 20px;">
        <strong style="color:#fff;">${inviterName}</strong> added you to the group
        <strong style="color:#7c6af7;">${groupName}</strong> on ExpenseMate. Open the app to accept.
      </p>
      <div style="text-align:center;margin:24px 0;">
        <a href="${appUrl}" style="display:inline-block;background:linear-gradient(135deg,#6c47ff,#4f8bff);color:#fff;text-decoration:none;padding:12px 32px;border-radius:50px;font-weight:700;">
          Open ExpenseMate
        </a>
      </div>
    </div>
  </div>
</body>
</html>`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
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

    // Check if email already exists in the app
    const { data: usersData } = await supabaseAdmin.auth.admin.listUsers()
    const existingUser = usersData?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase())

    // Check if invite exists manually to avoid upsert UNIQUE constraint error
    const { data: existingInvite } = await supabaseAdmin
      .from('group_invites')
      .select('*')
      .eq('email', email)
      .eq('group_id', group_id)
      .maybeSingle()

    let invite;
    if (existingInvite) {
      const { data, error: updateErr } = await supabaseAdmin
        .from('group_invites')
        .update({ status: 'pending' })
        .eq('id', existingInvite.id)
        .select('token').single()
      if (updateErr) throw updateErr
      invite = data;
    } else {
      const { data, error: insertErr } = await supabaseAdmin
        .from('group_invites')
        .insert({ group_id, invited_by: null, email, status: 'pending' })
        .select('token').single()
      if (insertErr) throw insertErr
      invite = data;
    }

    const inviteUrl = `${APP_URL}/invite?token=${invite.token}`

    let subject: string
    let html: string

    if (existingUser) {
      // Existing user — send notification
      subject = `${inviter_name} added you to "${group_name}" on ExpenseMate`
      html = notificationEmailHtml(inviter_name, group_name, inviteUrl)
    } else {
      // New user — send invite with magic link
      subject = `${inviter_name} invited you to split expenses on ExpenseMate 💸`
      html = inviteEmailHtml(inviter_name, group_name, inviteUrl)
    }

    // Setup SMTP (if credentials exist)
    const SMTP_HOST = Deno.env.get('SMTP_HOST') || 'smtp.gmail.com'
    const SMTP_PORT = parseInt(Deno.env.get('SMTP_PORT') || '465')
    const SMTP_USER = Deno.env.get('SMTP_USER')
    const SMTP_PASS = Deno.env.get('SMTP_PASS')

    if (SMTP_USER && SMTP_PASS) {
      const transporter = nodemailer.createTransport({
        host: SMTP_HOST, port: SMTP_PORT,
        secure: SMTP_PORT === 465,
        auth: { user: SMTP_USER, pass: SMTP_PASS },
        maxMessageSize: 100 * 1024 * 1024,
      })
      await transporter.sendMail({ from: `ExpenseMate <${SMTP_USER}>`, to: email, subject, html })
    } else {
      console.warn("SMTP credentials missing. Invite generated in DB but email not sent.");
    }

    return new Response(JSON.stringify({ success: true, isExistingUser: !!existingUser }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error: any) {
    console.error('send-invite error:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
