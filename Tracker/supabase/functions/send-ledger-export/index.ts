// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer'
import { cleanMailHeader, emailTemplate, escapeHtml, fromAddress, stripHtml, withAutomatedFooterText } from '../_shared/email-template.ts'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function escapeCsv(val: any) {
    if (val == null) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
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
        const authHeader = req.headers.get('Authorization') ?? ''
        const token = authHeader.replace('Bearer ', '')
        const { data: userData, error: authError } = await supabaseAdmin.auth.getUser(token)
        if (authError || !userData.user) {
            return new Response(JSON.stringify({ error: 'Unauthorized access' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        const { ledgerId } = await req.json()
        if (!ledgerId) {
            return new Response(JSON.stringify({ error: 'ledgerId is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        // Fetch ledger, members, and expenses
        const { data: ledger, error: ledgerError } = await supabaseAdmin
            .from('ledgers')
            .select(`
                *,
                ledger_members(user_id, role),
                ledger_expenses(*)
            `)
            .eq('id', ledgerId)
            .single()

        if (ledgerError || !ledger) {
            return new Response(JSON.stringify({ error: 'Ledger not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        // Check if the user is part of the ledger
        const isMember = ledger.ledger_members.some((m: any) => m.user_id === userData.user.id)
        if (!isMember) {
            return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        // Fetch emails for the members
        const { data: usersData, error: usersError } = await supabaseAdmin.auth.admin.listUsers()
        if (usersError) throw usersError
        
        const memberIds = ledger.ledger_members.map((m: any) => m.user_id)
        const emails = usersData.users
            .filter((u: any) => memberIds.includes(u.id))
            .map((u: any) => u.email)
            .filter(Boolean) as string[]

        if (emails.length === 0) {
            return new Response(JSON.stringify({ message: 'No emails found to send' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        // Also fetch profiles to map user_id to names
        const { data: profiles } = await supabaseAdmin
            .from('profiles')
            .select('user_id, full_name, username')
            .in('user_id', memberIds)
            
        const profileMap = (profiles || []).reduce((acc: any, p: any) => {
            acc[p.user_id] = p.full_name || p.username || 'Unknown';
            return acc;
        }, {})

        // Generate CSV
        const header = ['Title', 'Amount', 'Category', 'Paid By', 'Status', 'Date', 'Notes']
        const csvRows = [header.map(escapeCsv).join(',')]

        const expenses = ledger.ledger_expenses || []
        expenses.forEach((exp: any) => {
            csvRows.push([
                exp.title,
                exp.amount,
                exp.category,
                profileMap[exp.user_id] || 'Unknown',
                exp.status,
                exp.created_at ? new Date(exp.created_at).toLocaleDateString() : '',
                exp.notes
            ].map(escapeCsv).join(','))
        })

        const csvContent = csvRows.join('\n')
        // Deno uses strict base64 encoding; encode text into Uint8Array then to base64
        const textEncoder = new TextEncoder()
        const uint8Array = textEncoder.encode(csvContent)
        const base64Csv = btoa(String.fromCharCode(...uint8Array))

        // Send Email
        const SMTP_HOST = Deno.env.get('SMTP_HOST') || 'smtp.gmail.com';
        const SMTP_PORT = parseInt(Deno.env.get('SMTP_PORT') || '465');
        const SMTP_USER = Deno.env.get('SMTP_USER');
        const SMTP_PASS = Deno.env.get('SMTP_PASS');

        if (!SMTP_USER || !SMTP_PASS) {
            console.warn('Missing SMTP credentials, skipping email send.');
            return new Response(JSON.stringify({ success: true, warning: 'Missing SMTP config' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        const transporter = nodemailer.createTransport({
            host: SMTP_HOST,
            port: SMTP_PORT,
            secure: SMTP_PORT === 465,
            auth: { user: SMTP_USER, pass: SMTP_PASS },
        });

        const subject = `Expense Export: ${ledger.name}`
        const htmlBody = `
            <h2>${escapeHtml(ledger.name)} has been closed/deleted.</h2>
            <p>Please find attached the final expense report for this ledger.</p>
        `

        const mailOptions = {
            from: fromAddress(SMTP_USER),
            to: SMTP_USER,
            bcc: emails,
            subject: cleanMailHeader(subject),
            text: withAutomatedFooterText(stripHtml(htmlBody)),
            html: emailTemplate({
                preview: 'Ledger Export attached',
                title: subject,
                body: [],
                contentHtml: `<div style="color:#3f4254;font-size:15px;line-height:1.65;">${htmlBody}</div>`,
                footer: 'Spendova export'
            }),
            attachments: [{
                filename: `${ledger.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_export.csv`,
                content: base64Csv,
                encoding: 'base64'
            }]
        }

        await transporter.sendMail(mailOptions);

        return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    } catch (error: any) {
        console.error("Transmission Error:", error.message);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }
})
