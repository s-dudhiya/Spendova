// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function money(value: number) {
  return Number(value || 0).toFixed(2)
}

function expenseEmailHtml(payerName: string, category: string, totalAmount: number, myShare: number, groupName: string, note?: string) {
  const safePayerName = escapeHtml(payerName || 'Someone')
  const safeCategory = escapeHtml(category || 'Expense')
  const safeGroupName = escapeHtml(groupName || 'your group')
  const safeNote = note ? escapeHtml(note) : ''
  const safeTotalAmount = escapeHtml(money(totalAmount))
  const safeMyShare = escapeHtml(money(myShare))

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:30px;background:#F7F5FF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:520px;margin:auto;background:#ffffff;border-radius:20px;padding:35px;border:1px solid #ECE8FF;">
    <div style="margin-bottom:28px;">
      <div style="font-size:13px;color:#8D88A8;letter-spacing:1px;font-weight:600;">SPENDOVA</div>
      <h1 style="margin:10px 0 0;color:#1A1A1A;font-size:24px;font-weight:700;">New expense added</h1>
    </div>

    <p style="color:#5B5B6A;font-size:15px;line-height:1.7;margin-bottom:25px;">
      <strong style="color:#1A1A1A;">${safePayerName}</strong>
      added a new expense in
      <strong style="color:#8B6CFF;">${safeGroupName}</strong>.
    </p>

    ${safeNote ? `<p style="color:#5B5B6A;font-size:14px;line-height:1.6;margin:0 0 18px;padding:12px 14px;background:#FAF9FF;border:1px solid #F0EBFF;border-radius:12px;">${safeNote}</p>` : ''}

    <div style="background:#FAF9FF;border-radius:14px;padding:18px;margin-bottom:14px;border:1px solid #F0EBFF;">
      <div style="font-size:13px;color:#8D88A8;margin-bottom:6px;">Category</div>
      <div style="font-size:18px;color:#1A1A1A;font-weight:600;">${safeCategory}</div>
    </div>

    <div style="background:#FAF9FF;border-radius:14px;padding:18px;margin-bottom:14px;border:1px solid #F0EBFF;">
      <div style="font-size:13px;color:#8D88A8;margin-bottom:6px;">Total amount</div>
      <div style="font-size:22px;color:#1A1A1A;font-weight:700;">INR ${safeTotalAmount}</div>
    </div>

    <div style="background:#F4EEFF;border-radius:14px;padding:18px;border:1px solid #E5D8FF;">
      <div style="font-size:13px;color:#8B6CFF;margin-bottom:6px;font-weight:600;">Your share</div>
      <div style="font-size:26px;color:#8B6CFF;font-weight:800;">INR ${safeMyShare}</div>
    </div>

    <p style="margin-top:30px;color:#8D88A8;font-size:13px;text-align:center;">Track expenses together with Spendova</p>
  </div>
</body>
</html>`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { expense_id } = await req.json()
    if (!expense_id) {
      return new Response(JSON.stringify({ error: 'expense_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace('Bearer ', '')
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token)
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: expense, error: expenseError } = await supabaseAdmin
      .from('expenses')
      .select(`
        id, user_id, paid_by, amount, category, note, group_id,
        payer:profiles!expenses_paid_by_fkey(user_id, full_name),
        expense_splits(user_id, amount_owed, profiles!expense_splits_user_id_fkey(user_id, full_name))
      `)
      .eq('id', expense_id)
      .single()

    if (expenseError || !expense) throw expenseError ?? new Error('Expense not found')

    const requesterId = userData.user.id
    const isSplitParticipant = expense.expense_splits?.some((split: any) => split.user_id === requesterId)
    let isGroupMember = false
    if (expense.group_id) {
      const { data: membership } = await supabaseAdmin
        .from('group_members')
        .select('user_id')
        .eq('group_id', expense.group_id)
        .eq('user_id', requesterId)
        .maybeSingle()
      isGroupMember = Boolean(membership)
    }

    if (requesterId !== expense.user_id && requesterId !== expense.paid_by && !isSplitParticipant && !isGroupMember) {
      return new Response(JSON.stringify({ error: 'You cannot send notifications for this expense' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const splits = expense.expense_splits ?? []
    if (!splits.length) {
      return new Response(JSON.stringify({ success: true, sent: 0 }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let groupName = 'your group'
    if (expense.group_id) {
      const { data: group } = await supabaseAdmin
        .from('groups')
        .select('name')
        .eq('id', expense.group_id)
        .single()
      if (group?.name) groupName = group.name
    }

    const SMTP_HOST = Deno.env.get('SMTP_HOST') || 'smtp.gmail.com'
    const SMTP_PORT = parseInt(Deno.env.get('SMTP_PORT') || '465')
    const SMTP_USER = Deno.env.get('SMTP_USER')
    const SMTP_PASS = Deno.env.get('SMTP_PASS')
    if (!SMTP_USER || !SMTP_PASS) {
      console.warn('SMTP credentials missing. Expense notification skipped.')
      return new Response(JSON.stringify({ success: true, sent: 0, emailSent: false, reason: 'SMTP missing' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: usersData, error: usersError } = await supabaseAdmin.auth.admin.listUsers()
    if (usersError) throw usersError
    const userEmailMap: Record<string, string> = {}
    usersData?.users?.forEach((user: any) => {
      if (user.id && user.email) userEmailMap[user.id] = user.email
    })

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    })

    const payerName = expense.payer?.full_name || 'Someone'
    let sent = 0

    for (const split of splits) {
      if (split.user_id === expense.paid_by) continue
      const email = userEmailMap[split.user_id]
      if (!email) continue
      const share = Number(split.amount_owed || 0)
      await transporter.sendMail({
        from: `Spendova <${SMTP_USER}>`,
        to: email,
        subject: `${payerName} added "${expense.category || 'Expense'}" - Your share INR ${money(share)}`,
        html: expenseEmailHtml(payerName, expense.category, expense.amount, share, groupName, expense.note),
      })
      sent += 1
    }

    return new Response(JSON.stringify({ success: true, sent, emailSent: sent > 0 }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('send-expense-notification error:', error)
    return new Response(JSON.stringify({ error: error?.message || 'Could not send expense notification' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
