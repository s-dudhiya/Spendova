// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function cleanEmail(email: string) {
  return String(email || '').trim().toLowerCase()
}

async function hashOtp(email: string, purpose: string, otp: string) {
  const secret = Deno.env.get('OTP_SECRET') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const payload = `${cleanEmail(email)}:${purpose}:${otp}:${secret}`
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload))
  return Array.from(new Uint8Array(bytes)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { email: rawEmail, purpose, otp } = await req.json()
    const email = cleanEmail(rawEmail)
    const token = String(otp || '').trim()
    if (!email || !['signup_verify', 'reset_password'].includes(purpose) || !/^\d{6}$/.test(token)) {
      return json({ error: 'Enter the 6-digit code.' }, 400)
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const { data: otpRow, error: lookupError } = await supabaseAdmin
      .from('auth_otps')
      .select('*')
      .eq('email', email)
      .eq('purpose', purpose)
      .eq('used', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (lookupError) throw lookupError
    if (!otpRow) return json({ error: 'Invalid or expired code.' }, 400)
    if (new Date(otpRow.expires_at).getTime() <= Date.now()) {
      await supabaseAdmin.from('auth_otps').update({ used: true }).eq('id', otpRow.id)
      return json({ error: 'This code has expired. Please request a new one.' }, 400)
    }
    if (otpRow.attempts >= 5) {
      await supabaseAdmin.from('auth_otps').update({ used: true }).eq('id', otpRow.id)
      return json({ error: 'Too many attempts. Please request a new code.' }, 429)
    }

    const otpHash = await hashOtp(email, purpose, token)
    if (otpHash !== otpRow.otp_hash) {
      await supabaseAdmin.from('auth_otps').update({ attempts: otpRow.attempts + 1 }).eq('id', otpRow.id)
      return json({ error: 'Invalid verification code.' }, 400)
    }

    if (purpose === 'signup_verify') {
      const { data: usersData, error: usersError } = await supabaseAdmin.auth.admin.listUsers()
      if (usersError) throw usersError
      const user = usersData?.users?.find((item: any) => item.email?.toLowerCase() === email)
      if (!user) return json({ error: 'Account not found.' }, 404)

      const metadata = user.user_metadata || {}
      const { error: userUpdateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
        user_metadata: { ...metadata, spendova_custom_pending: false },
      })
      if (userUpdateError) throw userUpdateError

      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .update({ email_verified: true })
        .eq('user_id', user.id)
      if (profileError) throw profileError

      await supabaseAdmin.from('auth_otps').update({ used: true }).eq('id', otpRow.id)
      return json({ success: true })
    }

    const resetToken = crypto.randomUUID()
    const { error: updateError } = await supabaseAdmin
      .from('auth_otps')
      .update({
        used: true,
        reset_token: resetToken,
        reset_token_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      })
      .eq('id', otpRow.id)
    if (updateError) throw updateError

    return json({ success: true, resetToken })
  } catch (error) {
    console.error('verify-auth-otp error:', error)
    return json({ error: error?.message || 'Could not verify code' }, 500)
  }
})
