// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer'
import { cleanMailHeader, emailTemplate, escapeHtml, fromAddress } from '../_shared/email-template.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

  return emailTemplate({
    preview: `${payerName || 'Someone'} added an expense in ${groupName || 'your group'}.`,
    title: 'New expense added',
    body: [
      `<strong style="color:#1f2230;">${safePayerName}</strong> added a new expense in <strong style="color:#1f2230;">${safeGroupName}</strong>.`,
      safeNote ? `Note: ${safeNote}` : '',
    ],
    details: [
      { label: 'Category', value: safeCategory },
      { label: 'Total amount', value: `INR ${safeTotalAmount}` },
      { label: 'Your share', value: `INR ${safeMyShare}`, highlight: true },
    ],
    footer: 'Spendova expense notification',
  })
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
        from: fromAddress(SMTP_USER),
        to: email,
        subject: `${cleanMailHeader(payerName)} added "${cleanMailHeader(expense.category || 'Expense')}" - Your share INR ${money(share)}`,
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
