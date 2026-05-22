// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    // Handle CORS Preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {

        // 2. Parse Subject, HTML Body, and Attachments from the request
        const { subject, htmlBody, attachments, password } = await req.json()

        // 3. Verify the hardcoded frontend password (same as in Admin.tsx)
        if (password !== 'exp_admin_2026') {
            return new Response(JSON.stringify({ error: 'Unauthorized access' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        if (!subject || !htmlBody) {
            return new Response(JSON.stringify({ error: 'Subject and htmlBody are required' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        // 3. Get all user emails using the service role key to bypass RLS
        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        const { data: usersData, error: usersError } = await supabaseAdmin.auth.admin.listUsers()

        if (usersError) {
            throw usersError
        }

        const emails = usersData.users.map((u) => u.email).filter(Boolean) as string[]

        if (emails.length === 0) {
            return new Response(JSON.stringify({ message: 'No users found to email.' }), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        // 4. Send Email via SMTP
        const SMTP_HOST = Deno.env.get('SMTP_HOST') || 'smtp.gmail.com';
        const SMTP_PORT = parseInt(Deno.env.get('SMTP_PORT') || '465');
        const SMTP_USER = Deno.env.get('SMTP_USER');
        const SMTP_PASS = Deno.env.get('SMTP_PASS');

        if (!SMTP_USER || !SMTP_PASS) {
            throw new Error('Missing SMTP credentials. Please set SMTP_USER and SMTP_PASS secrets.');
        }

        const transporter = nodemailer.createTransport({
            host: SMTP_HOST,
            port: SMTP_PORT,
            secure: SMTP_PORT === 465,
            auth: {
                user: SMTP_USER,
                pass: SMTP_PASS,
            },
            maxMessageSize: 100 * 1024 * 1024, // 100 MB
        });

        console.log(`Sending email to ${emails.length} users (BCC)...`);
        // Send using BCC to prevent exposing all emails
        const mailOptions: any = {
            from: SMTP_USER,
            to: SMTP_USER, // Need at least one "to" address, use own email
            bcc: emails,
            subject: subject,
            text: htmlBody, // Provide text fallback (optional, but good)
            html: htmlBody,
        };

        if (attachments && Array.isArray(attachments) && attachments.length > 0) {
            mailOptions.attachments = attachments.map((att: any) => ({
                filename: att.name,
                content: att.data.split(',')[1] || att.data, // Remove data URI prefix if it exists
                encoding: 'base64'
            }));
        }

        const info = await transporter.sendMail(mailOptions);

        console.log("Transmission info:", info.messageId);

        return new Response(JSON.stringify({ success: true, message: `Successfully sent broadcast to ${emails.length} users using SMTP.` }), {
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
