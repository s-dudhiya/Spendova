// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Check auth secret if sent via pg_net (optional layer of security)
    const authHeader = req.headers.get('Authorization')
    if (authHeader !== `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`) {
      // Allow execution without auth if not strictly enforced, or log it
      console.log('Cron executed without service role token in header.')
    }

    // 1. Find all ledgers and their pending expenses created strictly before today
    // To properly compare dates, let's just use raw SQL via RPC or fetch and filter.
    // Given PostgREST limits, let's fetch pending expenses.
    
    const { data: expenses, error: expensesError } = await supabaseAdmin
      .from('ledger_expenses')
      .select(`
        id,
        created_at,
        amount,
        ledger_id,
        ledgers (
          name,
          budget_admin_id,
          owner_id
        )
      `)
      .in('status', ['pending', 'approved'])

    if (expensesError) throw expensesError

    if (!expenses || expenses.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'No pending expenses found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Group expenses by budget_admin_id and ledger
    const pendingMap = {} // budgetAdminId -> { ledgerId -> count }
    const ledgerNames = {} // ledgerId -> name

    expenses.forEach((expense) => {
      // Extract data
      const adminId = expense.ledgers?.budget_admin_id || expense.ledgers?.owner_id
      const ledgerId = expense.ledger_id
      const ledgerName = expense.ledgers?.name
      
      if (!adminId) return

      if (!pendingMap[adminId]) pendingMap[adminId] = {}
      if (!pendingMap[adminId][ledgerId]) pendingMap[adminId][ledgerId] = 0
      
      pendingMap[adminId][ledgerId]++
      ledgerNames[ledgerId] = ledgerName
    })

    const notificationsToInsert = []

    for (const [adminId, ledgers] of Object.entries(pendingMap)) {
      for (const [ledgerId, count] of Object.entries(ledgers)) {
        const rawLedgerName = ledgerNames[ledgerId] || 'Unknown';
        const cleanName = rawLedgerName.trim();
        const displayName = cleanName.toLowerCase().endsWith('ledger') ? cleanName : `${cleanName} Ledger`;
        
        notificationsToInsert.push({
          user_id: adminId,
          actor_id: adminId, // System reminder
          type: 'ledger_reminder',
          title: `Pending Expenses in ${displayName}`,
          message: `Reminder: You have ${count} unpaid expense${count > 1 ? 's' : ''} waiting for your review.`,
          entity_type: 'ledger',
          entity_id: ledgerId,
          is_read: false,
        })
      }
    }

    if (notificationsToInsert.length > 0) {
      const { error: insertError } = await supabaseAdmin
        .from('notifications')
        .insert(notificationsToInsert)

      if (insertError) throw insertError
    }

    return new Response(JSON.stringify({ success: true, notifications_sent: notificationsToInsert.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error: any) {
    console.error('cron-ledger-reminders error:', error)
    return new Response(JSON.stringify({ error: error?.message || 'Server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
