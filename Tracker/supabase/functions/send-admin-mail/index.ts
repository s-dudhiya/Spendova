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
        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )
        const authHeader = req.headers.get('Authorization') ?? ''
        const token = authHeader.replace('Bearer ', '')
        const { data: userData, error: authError } = await supabaseAdmin.auth.getUser(token)
        if (authError || !userData.user) {
            return new Response(JSON.stringify({ error: 'Unauthorized access' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }
        const { data: adminUser, error: adminError } = await supabaseAdmin
            .from('admin_users')
            .select('user_id')
            .eq('user_id', userData.user.id)
            .maybeSingle()
        if (adminError || !adminUser) {
            return new Response(JSON.stringify({ error: 'Admin access required' }), {
                status: 403,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        // 2. Parse Subject, HTML Body, and Attachments from the request
        const { subject, htmlBody, attachments, targetEmail, sendToAll, recipientMode } = await req.json()

        if (!subject || !htmlBody) {
            return new Response(JSON.stringify({ error: 'Subject and htmlBody are required' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        const requestedEmail = typeof targetEmail === 'string' ? targetEmail.trim().toLowerCase() : ''
        const mode = recipientMode === 'all' || recipientMode === 'single'
            ? recipientMode
            : sendToAll === true
                ? 'all'
                : requestedEmail
                    ? 'single'
                    : ''
        let emails: string[] = []

        if (!mode) {
            return new Response(JSON.stringify({ error: 'recipientMode must be "single" or "all".' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        if (mode === 'single' && sendToAll === true) {
            return new Response(JSON.stringify({ error: 'Refusing to send: single recipient requests cannot also set sendToAll=true.' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        if (mode === 'all' && requestedEmail) {
            return new Response(JSON.stringify({ error: 'Refusing to send: all-user broadcasts cannot include targetEmail.' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        if (mode === 'single') {
            const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
            if (!emailPattern.test(requestedEmail)) {
                return new Response(JSON.stringify({ error: 'targetEmail must be a valid email address' }), {
                    status: 400,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                })
            }
            emails = [requestedEmail]
        } else {
            // 3. Get all user emails using the service role key to bypass RLS
            const { data: usersData, error: usersError } = await supabaseAdmin.auth.admin.listUsers()

            if (usersError) {
                throw usersError
            }

            emails = usersData.users.map((u) => u.email).filter(Boolean) as string[]
        }

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

        console.log(`Admin mail mode=${mode}; recipients=${mode === 'single' ? requestedEmail : emails.length}`);
        // Send using BCC to prevent exposing all emails
        const mailOptions: any = {
            from: SMTP_USER,
            ...(mode === 'single' ? { to: requestedEmail } : { to: SMTP_USER, bcc: emails }),
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

        return new Response(JSON.stringify({ success: true, recipientMode: mode, recipientCount: emails.length, message: mode === 'single' ? `Successfully sent email to ${requestedEmail}.` : `Successfully sent broadcast to ${emails.length} users using SMTP.` }), {
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
