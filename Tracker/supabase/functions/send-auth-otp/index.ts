// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer'
import { emailTemplate, escapeHtml, fromAddress, withAutomatedFooterText } from '../_shared/email-template.ts'

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

function normalizePhone(raw: string, defaultCountryCode = '+91'): string | null {
  const trimmed = String(raw || '')
    .replace(/[\u200B-\u200F\u202A-\u202E\uFEFF\u00A0]/g, '')
    .trim()
  if (!trimmed) return null
  const hasPlus = trimmed.startsWith('+')
  let digits = trimmed.replace(/\D/g, '')
  if (!digits) return null
  if (hasPlus) return digits.length >= 10 && digits.length <= 15 ? `+${digits}` : null
  if (digits.startsWith('00')) {
    digits = digits.slice(2)
    return digits.length >= 10 && digits.length <= 15 ? `+${digits}` : null
  }
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1)
  if (digits.length === 10) return `${defaultCountryCode}${digits}`
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`
  return digits.length >= 10 && digits.length <= 15 ? `+${digits}` : null
}

async function isFakeEmail(email: string): Promise<boolean> {
  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (!apiKey) {
    console.warn('GEMINI_API_KEY is not set, skipping fake email check')
    return false // fail open if key is not configured
  }
  
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Analyze this email address: "${email}". Determine if this domain is a standard, reputable public/corporate/educational email provider, or if it exhibits characteristics of a temporary, disposable, catch-all, bot, or throwaway email service (e.g. 10minutemail, mailinator, telegram bot emails, pseudo-corporate random domain generators, nonsense/disposable domains). Reply with ONLY "true" if it is fake/disposable/suspicious throwaway, or "false" if it is a standard/valid email provider.`
          }]
        }]
      })
    })
    
    if (!response.ok) {
      console.warn('Gemini API returned error status:', response.status)
      return false
    }

    const data = await response.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()?.toLowerCase()
    
    // Gemini may sometimes reply with "true." or other punctuation, so we check if it starts with true
    return text === 'true' || text?.startsWith('true')
  } catch (error) {
    console.error('Error checking fake email:', error)
    return false
  }
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
  return emailTemplate({
    preview: 'Use this verification code to continue with Spendova.',
    title: 'Your verification code',
    body: [
      'Use the verification code below to continue. For your security, this code expires in 10 minutes.',
    ],
    details: [
      { label: 'Verification code', value: escapeHtml(otp), highlight: true },
    ],
    note: 'If you did not request this code, you can safely ignore this email.',
    footer: 'Spendova security notification',
  })
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
    from: fromAddress(SMTP_USER),
    to,
    subject: 'Your Spendova verification code',
    text: withAutomatedFooterText(`Your verification code is:\n\n${otp}\n\nThis code expires in 10 minutes.\n\nIf you did not request this, you can ignore this email.`),
    html: otpEmailHtml(otp),
  })
}

async function findUserByEmail(supabaseAdmin: any, email: string) {
  const { data, error } = await supabaseAdmin.auth.admin.listUsers()
  if (error) throw error
  return data?.users?.find((user: any) => user.email?.toLowerCase() === email) || null
}

async function cleanupAuthOtps(supabaseAdmin: any, email?: string, purpose?: string) {
  const { error } = await supabaseAdmin.rpc('cleanup_expired_auth_otps')
  if (error) console.warn('cleanup_expired_auth_otps skipped:', error.message)

  if (email && purpose) {
    await supabaseAdmin
      .from('auth_otps')
      .delete()
      .eq('email', email)
      .eq('purpose', purpose)
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json()
    const email = cleanEmail(body.email)
    const purpose = body.purpose
    if (!email || !['signup_verify', 'reset_password', 'login'].includes(purpose)) return json({ error: 'Invalid request' }, 400)

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    await cleanupAuthOtps(supabaseAdmin)

    if (purpose === 'signup_verify') {
      const domain = email.split('@')[1]
      let isFake = false

      if (domain) {
        // 1. Check cache first
        const { data: cachedDomain } = await supabaseAdmin
          .from('email_domains')
          .select('is_fake')
          .eq('domain', domain)
          .maybeSingle()

        if (cachedDomain) {
          isFake = cachedDomain.is_fake
          console.log(`[${email}] Cache HIT: is_fake = ${isFake}`)
        } else {
          // 2. Cache miss, call Gemini
          console.log(`[${email}] Cache MISS: checking with Gemini...`)
          isFake = await isFakeEmail(email)
          
          // 3. Save to cache (using upsert to prevent unique constraint warnings on rare concurrent signups)
          const { error: cacheError } = await supabaseAdmin
            .from('email_domains')
            .upsert({ domain, is_fake: isFake }, { onConflict: 'domain' })
            
          if (cacheError) console.warn(`[${email}] Failed to cache domain:`, cacheError.message)
        }
      } else {
        isFake = true // Invalid email format
      }

      if (isFake) {
        return json({ error: 'Fake or temporary email addresses are not allowed. Please use a valid email.' }, 400)
      }

      const password = String(body.password || '')
      const fullName = String(body.fullName || '').trim()
      const username = String(body.username || '').trim().toLowerCase()
      const phone = normalizePhone(String(body.phone || ''))
      const existingUser = await findUserByEmail(supabaseAdmin, email)
      if (!password || !fullName || !username || !phone) {
        if (!existingUser) return json({ error: 'Missing signup details (including valid mobile number)' }, 400)
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

        const { data: existingPhone } = await supabaseAdmin
          .from('profiles')
          .select('user_id')
          .eq('phone', phone)
          .maybeSingle()
        if (existingPhone && existingPhone.user_id !== existingUser?.id) return json({ error: 'This mobile number is already registered' }, 409)

        if (existingUser) {
          const { data: existingProfile } = await supabaseAdmin
            .from('profiles')
            .select('email_verified')
            .eq('user_id', existingUser.id)
            .maybeSingle()
          if (existingProfile?.email_verified) return json({ error: 'An account with this email already exists' }, 409)
          await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
            password,
            user_metadata: { full_name: fullName, username, phone, spendova_custom_pending: true },
          })
          await supabaseAdmin.from('profiles').upsert({
            user_id: existingUser.id,
            full_name: fullName,
            username,
            phone,
            email_verified: false,
          }, { onConflict: 'user_id' })
        } else {
          const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { full_name: fullName, username, phone, spendova_custom_pending: true },
          })
          if (createError) throw createError
          await supabaseAdmin.from('profiles').upsert({
            user_id: created.user.id,
            full_name: fullName,
            username,
            phone,
            email_verified: false,
          }, { onConflict: 'user_id' })
        }
      }
    }

    if (purpose === 'reset_password') {
      const existingUser = await findUserByEmail(supabaseAdmin, email)
      if (!existingUser) return json({ success: true })
    }

    if (purpose === 'login') {
      const existingUser = await findUserByEmail(supabaseAdmin, email)
      if (!existingUser) return json({ error: 'Account not found. Please create an account first.' }, 404)
    }

    const otp = generateOtp()
    const otpHash = await hashOtp(email, purpose, otp)
    await cleanupAuthOtps(supabaseAdmin, email, purpose)
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
