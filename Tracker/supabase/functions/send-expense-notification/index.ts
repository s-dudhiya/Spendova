// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function expenseEmailHtml(payerName: string, category: string, totalAmount: number, myShare: number, groupName: string, note?: string) {
    return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0f0f14;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:#1a1a24;border-radius:24px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);">
    <div style="background:linear-gradient(135deg,#1a1a24,#2a1f44);padding:28px 32px;border-bottom:1px solid rgba(255,255,255,0.06);">
      <div style="display:flex;align-items:center;gap:12px;">
        <div style="width:48px;height:48px;background:linear-gradient(135deg,#6c47ff,#4f8bff);border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:22px;">🧾</div>
        <div>
          <p style="color:#6b6b80;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin:0 0 2px;">New Expense</p>
          <h2 style="color:#fff;margin:0;font-size:20px;font-weight:800;text-transform:capitalize;">${category}</h2>
        </div>
      </div>
    </div>
    <div style="padding:28px 32px;">
      <p style="color:#c4c4d4;font-size:14px;margin:0 0 20px;">
        <strong style="color:#fff;">${payerName}</strong> added an expense in <strong style="color:#7c6af7;">${groupName}</strong>.
      </p>
      ${note ? `<p style="color:#8888a0;font-size:13px;margin:0 0 20px;padding:10px 14px;background:rgba(255,255,255,0.04);border-radius:10px;border-left:3px solid #6c47ff;">${note}</p>` : ''}
      <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,0.04);border-radius:16px;padding:16px 20px;margin-bottom:12px;">
        <span style="color:#8888a0;font-size:13px;">Total Amount</span>
        <span style="color:#fff;font-size:20px;font-weight:800;">₹${totalAmount.toFixed(2)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(108,71,255,0.12);border-radius:16px;padding:16px 20px;border:1px solid rgba(108,71,255,0.3);">
        <span style="color:#a08fff;font-size:13px;font-weight:600;">Your Share</span>
        <span style="color:#7c6af7;font-size:22px;font-weight:800;">₹${myShare.toFixed(2)}</span>
      </div>
    </div>
    <div style="padding:16px 32px;border-top:1px solid rgba(255,255,255,0.06);text-align:center;">
      <p style="color:#6b6b80;font-size:12px;margin:0;">ExpenseMate · Split smarter</p>
    </div>
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
                status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // Fetch expense + splits + profiles
        const { data: expense, error: expErr } = await supabaseAdmin
            .from('expenses')
            .select(`
                id, amount, category, note, group_id,
                payer:profiles!expenses_paid_by_fkey(user_id, full_name),
                expense_splits(user_id, amount_owed, profiles!expense_splits_user_id_fkey(user_id, full_name))
            `)
            .eq('id', expense_id)
            .single()

        if (expErr || !expense) throw expErr ?? new Error('Expense not found')

        // Get group name if applicable
        let groupName = 'your group'
        if (expense.group_id) {
            const { data: grp } = await supabaseAdmin.from('groups').select('name').eq('id', expense.group_id).single()
            if (grp) groupName = grp.name
        }

        // Collect user_ids to notify (all split participants)
        const splitUserIds = expense.expense_splits?.map((s: any) => s.user_id) ?? []
        if (splitUserIds.length === 0) return new Response(JSON.stringify({ success: true, sent: 0 }), {
            status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })

        // Get emails of all split users
        const { data: usersData } = await supabaseAdmin.auth.admin.listUsers()
        const userEmailMap: Record<string, string> = {}
        usersData?.users?.forEach((u: any) => { if (u.id && u.email) userEmailMap[u.id] = u.email })

        // Setup SMTP
        const SMTP_HOST = Deno.env.get('SMTP_HOST') || 'smtp.gmail.com'
        const SMTP_PORT = parseInt(Deno.env.get('SMTP_PORT') || '465')
        const SMTP_USER = Deno.env.get('SMTP_USER')
        const SMTP_PASS = Deno.env.get('SMTP_PASS')
        if (!SMTP_USER || !SMTP_PASS) throw new Error('Missing SMTP credentials')

        const transporter = nodemailer.createTransport({
            host: SMTP_HOST, port: SMTP_PORT,
            secure: SMTP_PORT === 465,
            auth: { user: SMTP_USER, pass: SMTP_PASS },
            maxMessageSize: 100 * 1024 * 1024,
        })

        const payerName = expense.payer?.full_name || 'Someone'
        let sent = 0

        for (const split of expense.expense_splits ?? []) {
            const email = userEmailMap[split.user_id]
            if (!email) continue
            const html = expenseEmailHtml(payerName, expense.category, expense.amount, split.amount_owed, groupName, expense.note)
            await transporter.sendMail({
                from: `ExpenseMate <${SMTP_USER}>`,
                to: email,
                subject: `${payerName} added "${expense.category}" · Your share ₹${split.amount_owed.toFixed(2)}`,
                html,
            })
            sent++
        }

        return new Response(JSON.stringify({ success: true, sent }), {
            status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    } catch (error: any) {
        console.error('send-expense-notification error:', error.message)
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }
})
