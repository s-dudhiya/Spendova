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

async function findUserByEmail(supabaseAdmin: any, email: string) {
  const { data, error } = await supabaseAdmin.auth.admin.listUsers()
  if (error) throw error
  return data?.users?.find((user: any) => user.email?.toLowerCase() === email) || null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { email: rawEmail, resetToken, password } = await req.json()
    const email = cleanEmail(rawEmail)
    if (!email || !resetToken || !password || String(password).length < 6) {
      return json({ error: 'Invalid reset request.' }, 400)
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const { data: otpRow, error: lookupError } = await supabaseAdmin
      .from('auth_otps')
      .select('*')
      .eq('email', email)
      .eq('purpose', 'reset_password')
      .eq('reset_token', resetToken)
      .maybeSingle()

    if (lookupError) throw lookupError
    if (!otpRow || !otpRow.reset_token_expires_at || new Date(otpRow.reset_token_expires_at).getTime() <= Date.now()) {
      return json({ error: 'Reset session expired. Please request a new code.' }, 400)
    }

    const user = await findUserByEmail(supabaseAdmin, email)
    if (!user) return json({ error: 'Reset session expired. Please request a new code.' }, 400)

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, { password })
    if (updateError) throw updateError

    await supabaseAdmin.from('auth_otps').update({ reset_token: null, reset_token_expires_at: null }).eq('id', otpRow.id)
    return json({ success: true })
  } catch (error) {
    console.error('reset-password-with-otp error:', error)
    return json({ error: error?.message || 'Could not update password' }, 500)
  }
})
