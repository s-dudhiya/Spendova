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

function cleanIdentifier(value: unknown) {
  return String(value || '').trim().toLowerCase()
}

function invalidLogin() {
  return json({ error: 'Invalid login credentials' }, 401)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json().catch(() => ({}))
    const identifier = cleanIdentifier(body.identifier)
    const password = String(body.password || '')
    if (!identifier || !password || identifier.includes('@')) return invalidLogin()

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('user_id')
      .eq('username', identifier)
      .maybeSingle()
    if (profileError) throw profileError
    if (!profile?.user_id) return invalidLogin()

    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(profile.user_id)
    if (userError) throw userError
    const email = userData.user?.email?.toLowerCase()
    if (!email) return invalidLogin()

    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    if (!anonKey) throw new Error('Missing Supabase anon key')
    const supabaseAuth = createClient(Deno.env.get('SUPABASE_URL') ?? '', anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data, error } = await supabaseAuth.auth.signInWithPassword({ email, password })
    if (error || !data.session || !data.user) return invalidLogin()

    return json({ session: data.session, user: data.user })
  } catch (error) {
    console.error('sign-in-with-identifier error:', error?.message || error)
    return json({ error: error?.message || 'Could not sign in' }, 500)
  }
})
