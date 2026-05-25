// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace('Bearer ', '')
    if (!token) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token)
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const userId = userData.user.id

    const ensureDeleted = async (query) => {
      const { error } = await query
      if (error) throw error
    }

    await ensureDeleted(supabaseAdmin.from('split_settlements').delete().or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`))
    await ensureDeleted(supabaseAdmin.from('expense_splits').delete().eq('user_id', userId))
    await ensureDeleted(supabaseAdmin.from('expenses').delete().or(`user_id.eq.${userId},paid_by.eq.${userId}`))
    await ensureDeleted(supabaseAdmin.from('connections').delete().or(`requester_id.eq.${userId},receiver_id.eq.${userId}`))
    await ensureDeleted(supabaseAdmin.from('group_invites').delete().eq('invited_by', userId))
    await ensureDeleted(supabaseAdmin.from('groups').delete().eq('created_by', userId))
    await ensureDeleted(supabaseAdmin.from('group_members').delete().eq('user_id', userId))
    await ensureDeleted(supabaseAdmin.from('profiles').delete().eq('user_id', userId))

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId)
    if (deleteError) throw deleteError

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('delete-account error:', error?.message || error)
    return new Response(JSON.stringify({ error: error?.message || 'Could not delete account' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
