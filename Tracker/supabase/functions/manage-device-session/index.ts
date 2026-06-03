// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const INACTIVITY_TIMEOUT_MS = 30 * 24 * 60 * 60 * 1000

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function normalizeDeviceId(value: unknown) {
  return String(value || '').trim().slice(0, 128)
}

function normalizeText(value: unknown, fallback: string, max = 255) {
  const text = String(value || '').trim()
  return (text || fallback).slice(0, max)
}

function clientIp(req: Request) {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('cf-connecting-ip')
    || null
}

function getSessionExpiryReason(session: { created_at?: string | null; last_seen_at?: string | null }) {
  const now = Date.now()
  const lastSeenAt = session.last_seen_at ? Date.parse(session.last_seen_at) : NaN
  const createdAt = session.created_at ? Date.parse(session.created_at) : NaN
  const securityRotationCutoff = new Date()
  securityRotationCutoff.setMonth(securityRotationCutoff.getMonth() - 6)

  if (Number.isFinite(createdAt) && createdAt <= securityRotationCutoff.getTime()) return 'security_rotation'
  if (Number.isFinite(lastSeenAt) && now - lastSeenAt >= INACTIVITY_TIMEOUT_MS) return 'inactivity_timeout'
  return null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace('Bearer ', '')
    if (!token) return json({ error: 'Authentication required' }, 401)

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token)
    if (userError || !userData.user) return json({ error: 'Invalid session' }, 401)

    const body = await req.json().catch(() => ({}))
    const action = normalizeText(body.action, 'check', 32)
    const deviceId = normalizeDeviceId(body.deviceId)
    const userId = userData.user.id

    if (action === 'list') {
      const { data, error } = await supabaseAdmin
        .from('auth_device_sessions')
        .select('id, device_id, device_name, device_type, platform, active, revoked_at, revoked_reason, created_at, last_seen_at')
        .eq('user_id', userId)
        .eq('active', true)
        .order('last_seen_at', { ascending: false })
        .limit(10)
      if (error) throw error
      return json({ sessions: data || [] })
    }

    if (!deviceId) return json({ error: 'Device identity required' }, 400)

    if (action === 'register') {
      const deviceName = normalizeText(body.deviceName, 'Unknown device')
      const deviceType = normalizeText(body.deviceType, 'web', 32)
      const fingerprintHash = normalizeText(body.fingerprintHash, 'unknown', 128)
      const userAgent = normalizeText(req.headers.get('user-agent') || body.userAgent, '', 512)
      const platform = normalizeText(body.platform, 'unknown', 128)

      const { error: deleteOtherDevicesError } = await supabaseAdmin
        .from('auth_device_sessions')
        .delete()
        .eq('user_id', userId)
        .neq('device_id', deviceId)
      if (deleteOtherDevicesError) throw deleteOtherDevicesError

      const { data, error } = await supabaseAdmin
        .from('auth_device_sessions')
        .upsert({
          user_id: userId,
          device_id: deviceId,
          device_name: deviceName,
          device_type: deviceType,
          fingerprint_hash: fingerprintHash,
          user_agent: userAgent,
          platform,
          ip_address: clientIp(req),
          active: true,
          revoked_at: null,
          revoked_reason: null,
          last_seen_at: new Date().toISOString(),
        }, { onConflict: 'user_id,device_id' })
        .select('id, device_id, device_name, device_type, platform, active, created_at, last_seen_at')
        .single()
      if (error) throw error
      return json({ session: data, replacedOtherDevices: true })
    }

    if (action === 'check') {
      const { data, error } = await supabaseAdmin
        .from('auth_device_sessions')
        .select('id, active, revoked_at, revoked_reason, created_at, last_seen_at')
        .eq('user_id', userId)
        .eq('device_id', deviceId)
        .maybeSingle()
      if (error) throw error
      if (!data || !data.active || data.revoked_at) {
        return json({ valid: false, reason: data?.revoked_reason || 'device_session_missing' }, 200)
      }
      const expiryReason = getSessionExpiryReason(data)
      if (expiryReason) {
        await supabaseAdmin
          .from('auth_device_sessions')
          .update({
            active: false,
            revoked_at: new Date().toISOString(),
            revoked_reason: expiryReason,
          })
          .eq('id', data.id)
        return json({ valid: false, reason: expiryReason }, 200)
      }
      await supabaseAdmin
        .from('auth_device_sessions')
        .update({ last_seen_at: new Date().toISOString(), ip_address: clientIp(req) })
        .eq('id', data.id)
      return json({ valid: true })
    }

    if (action === 'revoke-current') {
      const { error } = await supabaseAdmin
        .from('auth_device_sessions')
        .delete()
        .eq('user_id', userId)
        .eq('device_id', deviceId)
      if (error) throw error
      return json({ success: true })
    }

    if (action === 'revoke-all') {
      const { error } = await supabaseAdmin
        .from('auth_device_sessions')
        .delete()
        .eq('user_id', userId)
      if (error) throw error
      return json({ success: true })
    }

    return json({ error: 'Unsupported action' }, 400)
  } catch (error) {
    console.error('manage-device-session error:', error?.message || error)
    return json({ error: error?.message || 'Could not manage device session' }, 500)
  }
})
