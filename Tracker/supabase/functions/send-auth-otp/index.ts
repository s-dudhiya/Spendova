// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const OTP_TTL_MINUTES = 10

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function cleanEmail(email: string) {
  return String(email || '').trim().toLowerCase()
}

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

async function hashOtp(email: string, purpose: string, otp: string) {
  const secret = Deno.env.get('OTP_SECRET') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const payload = `${cleanEmail(email)}:${purpose}:${otp}:${secret}`
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload))
  return Array.from(new Uint8Array(bytes)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function otpEmailHtml(otp: string) {
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:30px;background:#F7F5FF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1A1A1A;">
  <div style="max-width:520px;margin:auto;background:#ffffff;border-radius:20px;padding:35px;border:1px solid #ECE8FF;">
    <div style="font-size:13px;color:#8D88A8;letter-spacing:1px;font-weight:700;">SPENDOVA</div>
    <h1 style="margin:10px 0 20px;font-size:24px;">Your verification code</h1>
    <p style="color:#5B5B6A;font-size:15px;line-height:1.7;">Your verification code is:</p>
    <div style="margin:22px 0;padding:18px;border-radius:14px;background:#F4EEFF;border:1px solid #E5D8FF;text-align:center;font-size:32px;font-weight:800;letter-spacing:8px;color:#6D28D9;">${otp}</div>
    <p style="color:#5B5B6A;font-size:15px;line-height:1.7;">This code expires in 10 minutes.</p>
    <p style="color:#8D88A8;font-size:13px;line-height:1.6;">If you did not request this, you can ignore this email.</p>
  </div>
</body>
</html>`
}

async function sendEmail(to: string, otp: string) {
  const SMTP_HOST = Deno.env.get('SMTP_HOST') || 'smtp.gmail.com'
  const SMTP_PORT = parseInt(Deno.env.get('SMTP_PORT') || '465')
  const SMTP_USER = Deno.env.get('SMTP_USER')
  const SMTP_PASS = Deno.env.get('SMTP_PASS')
  if (!SMTP_USER || !SMTP_PASS) throw new Error('Missing SMTP credentials')

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  })

  await transporter.sendMail({
    from: `Spendova <${SMTP_USER}>`,
    to,
    subject: 'Your Spendova verification code',
    text: `Your verification code is:\n\n${otp}\n\nThis code expires in 10 minutes.\n\nIf you did not request this, you can ignore this email.`,
    html: otpEmailHtml(otp),
  })
}

async function findUserByEmail(supabaseAdmin: any, email: string) {
  const { data, error } = await supabaseAdmin.auth.admin.listUsers()
  if (error) throw error
  return data?.users?.find((user: any) => user.email?.toLowerCase() === email) || null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json()
    const email = cleanEmail(body.email)
    const purpose = body.purpose
    if (!email || !['signup_verify', 'reset_password'].includes(purpose)) return json({ error: 'Invalid request' }, 400)

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    if (purpose === 'signup_verify') {
      const password = String(body.password || '')
      const fullName = String(body.fullName || '').trim()
      const username = String(body.username || '').trim().toLowerCase()
      const existingUser = await findUserByEmail(supabaseAdmin, email)
      if (!password || !fullName || !username) {
        if (!existingUser) return json({ error: 'Missing signup details' }, 400)
        const { data: existingProfile } = await supabaseAdmin
          .from('profiles')
          .select('email_verified')
          .eq('user_id', existingUser.id)
          .maybeSingle()
        if (existingProfile?.email_verified) return json({ error: 'An account with this email already exists' }, 409)
      } else {
        const { data: existingUsername } = await supabaseAdmin
          .from('profiles')
          .select('user_id')
          .eq('username', username)
          .maybeSingle()
        if (existingUsername && existingUsername.user_id !== existingUser?.id) return json({ error: 'Username is already taken' }, 409)

        if (existingUser) {
          const { data: existingProfile } = await supabaseAdmin
            .from('profiles')
            .select('email_verified')
            .eq('user_id', existingUser.id)
            .maybeSingle()
          if (existingProfile?.email_verified) return json({ error: 'An account with this email already exists' }, 409)
          await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
            password,
            user_metadata: { full_name: fullName, username, spendova_custom_pending: true },
          })
          await supabaseAdmin.from('profiles').upsert({
            user_id: existingUser.id,
            full_name: fullName,
            username,
            email_verified: false,
          }, { onConflict: 'user_id' })
        } else {
          const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { full_name: fullName, username, spendova_custom_pending: true },
          })
          if (createError) throw createError
          await supabaseAdmin.from('profiles').upsert({
            user_id: created.user.id,
            full_name: fullName,
            username,
            email_verified: false,
          }, { onConflict: 'user_id' })
        }
      }
    }

    if (purpose === 'reset_password') {
      const existingUser = await findUserByEmail(supabaseAdmin, email)
      if (!existingUser) return json({ success: true })
    }

    const otp = generateOtp()
    const otpHash = await hashOtp(email, purpose, otp)
    await supabaseAdmin.from('auth_otps').update({ used: true }).eq('email', email).eq('purpose', purpose).eq('used', false)
    const { error: insertError } = await supabaseAdmin.from('auth_otps').insert({
      email,
      purpose,
      otp_hash: otpHash,
      expires_at: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString(),
    })
    if (insertError) throw insertError

    await sendEmail(email, otp)
    return json({ success: true })
  } catch (error) {
    console.error('send-auth-otp error:', error)
    return json({ error: error?.message || 'Could not send verification code' }, 500)
  }
})
