// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
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

    const payload = await req.json()
    const { action, ledger_id, expense_id, actor_id } = payload

    if (!action || !ledger_id || !expense_id || !actor_id) {
      return json({ error: 'Missing required parameters' }, 400)
    }

    // Get Ledger details
    const { data: ledger, error: ledgerError } = await supabaseAdmin
      .from('ledgers')
      .select('name, budget_admin_id, owner_id')
      .eq('id', ledger_id)
      .single()

    if (ledgerError || !ledger) {
      return json({ error: 'Ledger not found' }, 404)
    }

    const effectiveAdminId = ledger.budget_admin_id || ledger.owner_id;

    // Get Expense details
    const { data: expense, error: expenseError } = await supabaseAdmin
      .from('ledger_expenses')
      .select('title, amount, user_id')
      .eq('id', expense_id)
      .single()

    if (expenseError || !expense) {
      return json({ error: 'Expense not found' }, 404)
    }

    // Get Actor details (who did the action)
    const { data: actor } = await supabaseAdmin
      .from('profiles')
      .select('full_name')
      .eq('user_id', actor_id)
      .single()

    const actorName = actor?.full_name || 'Someone'
    let targetUserIds: string[] = []
    let title = ''
    let message = ''

    const cleanName = ledger.name.trim();
    const displayName = cleanName.toLowerCase().endsWith('ledger') ? cleanName : `${cleanName} Ledger`;

    if (action === 'expense_added') {
      title = `New Expense in ${displayName}`
      message = `${actorName} submitted a new expense for INR ${expense.amount}: "${expense.title}"`

      // Fetch all ledger members
      const { data: members, error: membersError } = await supabaseAdmin
        .from('ledger_members')
        .select('user_id')
        .eq('ledger_id', ledger_id)

      if (members && !membersError) {
        // Notify everyone except the person who added the expense
        targetUserIds = members.map(m => m.user_id).filter(id => id !== actor_id)
      }
      
    } else if (action === 'expense_paid') {
      // If someone marks it paid, we notify the person who created the expense
      if (expense.user_id !== actor_id) {
        targetUserIds = [expense.user_id]
      }
      title = `Expense Paid in ${displayName}`
      message = `You have been paid INR ${expense.amount} for "${expense.title}".`
    } else {
      return json({ error: 'Unsupported action' }, 400)
    }

    if (!targetUserIds.length) {
      return json({ success: true, message: 'No target users to notify' })
    }

    // Deduplicate and prepare inserts
    const dedupeSince = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    const rows = []
    
    for (const userId of targetUserIds) {
      const { data: existing } = await supabaseAdmin
        .from('notifications')
        .select('id')
        .eq('user_id', userId)
        .eq('actor_id', actor_id)
        .eq('entity_id', expense_id)
        .eq('type', action)
        .gte('created_at', dedupeSince)
        .limit(1)

      if (!existing?.length) {
        rows.push({
          user_id: userId,
          actor_id: actor_id,
          type: action,
          title,
          message,
          entity_type: 'ledger_expense',
          entity_id: expense_id,
          is_read: false,
        })
      }
    }

    if (rows.length === 0) {
      return json({ success: true, message: 'Notifications deduped' })
    }

    // Insert into notifications (This triggers the push notification webhook!)
    const { error: insertError } = await supabaseAdmin.from('notifications').insert(rows)

    if (insertError) throw insertError

    return json({ success: true, inserted: rows.length })

  } catch (error: any) {
    console.error('send-ledger-notification error:', error)
    return json({ error: error?.message || 'Server error' }, 500)
  }
})
