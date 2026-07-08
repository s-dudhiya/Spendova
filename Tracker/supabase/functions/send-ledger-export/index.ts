// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer'
import { PDFDocument, rgb, StandardFonts } from 'https://esm.sh/pdf-lib@1.17.1'
import { cleanMailHeader, emailTemplate, escapeHtml, fromAddress, stripHtml, withAutomatedFooterText } from '../_shared/email-template.ts'
import { SPENDOVA_LOGO_BASE64 } from '../_shared/logo.ts'
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

        // Generate PDF using pdf-lib (Edge compatible) with Beautiful Table Design
        const pdfDoc = await PDFDocument.create();
        let page = pdfDoc.addPage();
        const { width, height } = page.getSize();
        
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

        // Header / Brand Logo
        try {
            const logoImageBytes = Uint8Array.from(atob(SPENDOVA_LOGO_BASE64), c => c.charCodeAt(0));
            const logoImage = await pdfDoc.embedPng(logoImageBytes);
            const scaledLogo = logoImage.scaleToFit(220, 50); 
            page.drawImage(logoImage, {
                x: (width - scaledLogo.width) / 2, // Centered
                y: height - 80,
                width: scaledLogo.width,
                height: scaledLogo.height,
            });
        } catch (e) {
            const textWidth = boldFont.widthOfTextAtSize("Spendova", 28);
            page.drawText("Spendova", { x: (width - textWidth) / 2, y: height - 70, size: 28, font: boldFont, color: rgb(0.43, 0.16, 0.85) });
        }
        
        const logoY = height - 80;

        // Report Title
        page.drawText(`Ledger Export: ${ledger.name}`, { x: 40, y: logoY - 50, size: 18, font: boldFont, color: rgb(0.1, 0.1, 0.15) });
        page.drawText(`Exported on ${new Date().toLocaleDateString()}`, { x: 40, y: logoY - 70, size: 11, font: font, color: rgb(0.4, 0.4, 0.45) });

        const expenses = ledger.ledger_expenses || [];
        
        // Custom Table Drawing Function
        let y = logoY - 120;
        const columns = ['Date', 'Title', 'Amount', 'Category', 'Paid By', 'Status'];
        const colWidths = [70, 110, 70, 80, 90, 60];
        const tableWidth = colWidths.reduce((a, b) => a + b, 0);
        const rowHeight = 24;

        // Modern Header Background
        page.drawRectangle({ x: 35, y: y - 8, width: tableWidth + 10, height: 28, color: rgb(0.96, 0.95, 0.99) });
        page.drawLine({ start: { x: 35, y: y - 8 }, end: { x: 35 + tableWidth + 10, y: y - 8 }, color: rgb(0.85, 0.8, 0.95), thickness: 1 });
        page.drawLine({ start: { x: 35, y: y + 20 }, end: { x: 35 + tableWidth + 10, y: y + 20 }, color: rgb(0.85, 0.8, 0.95), thickness: 1 });

        let startX = 40;
        columns.forEach((col, i) => {
            page.drawText(col, { x: startX, y: y + 2, size: 10, font: boldFont, color: rgb(0.3, 0.15, 0.6) });
            startX += colWidths[i];
        });
        
        y -= rowHeight;

        // Table Body
        if (expenses.length === 0) {
            page.drawText("No expenses recorded in this ledger.", { x: 40, y, size: 9, font: font });
        } else {
            expenses.forEach((exp: any, rowIndex: number) => {
                if (y < 50) {
                    page = pdfDoc.addPage();
                    y = height - 50;
                    // Redraw header on new page
                    page.drawRectangle({ x: 35, y: y - 8, width: tableWidth + 10, height: 28, color: rgb(0.96, 0.95, 0.99) });
                    page.drawLine({ start: { x: 35, y: y - 8 }, end: { x: 35 + tableWidth + 10, y: y - 8 }, color: rgb(0.85, 0.8, 0.95), thickness: 1 });
                    page.drawLine({ start: { x: 35, y: y + 20 }, end: { x: 35 + tableWidth + 10, y: y + 20 }, color: rgb(0.85, 0.8, 0.95), thickness: 1 });
                    let hx = 40;
                    columns.forEach((col, i) => {
                        page.drawText(col, { x: hx, y: y + 2, size: 10, font: boldFont, color: rgb(0.3, 0.15, 0.6) });
                        hx += colWidths[i];
                    });
                    y -= rowHeight;
                }

                // Striped Background
                if (rowIndex % 2 === 0) {
                    page.drawRectangle({ x: 35, y: y - 8, width: tableWidth + 10, height: rowHeight, color: rgb(0.98, 0.98, 0.99) });
                }
                
                // Bottom border for the row
                page.drawLine({ start: { x: 35, y: y - 8 }, end: { x: 35 + tableWidth + 10, y: y - 8 }, color: rgb(0.92, 0.92, 0.94), thickness: 1 });

                const row = [
                    exp.created_at ? new Date(exp.created_at).toLocaleDateString() : '',
                    (exp.title || 'Unknown').substring(0, 18),
                    `$${Number(exp.amount).toFixed(2)}`,
                    (exp.category || '').substring(0, 15),
                    (profileMap[exp.user_id] || 'Unknown').substring(0, 15),
                    exp.status
                ];
                
                let cx = 40;
                row.forEach((cell, i) => {
                    page.drawText(cell, { x: cx, y: y + 2, size: 9, font: font, color: rgb(0.2, 0.2, 0.25) });
                    cx += colWidths[i];
                });
                y -= rowHeight;
            });
        }

        const pages = pdfDoc.getPages();
        for (let i = 0; i < pages.length; i++) {
            const p = pages[i];
            const { width, height } = p.getSize();
            p.drawLine({ start: { x: 40, y: 40 }, end: { x: width - 40, y: 40 }, color: rgb(0.9, 0.88, 0.95), thickness: 1 });
            p.drawText("Spendova", { x: 40, y: 25, size: 9, font: boldFont, color: rgb(0.4, 0.4, 0.45) });
            p.drawText("System-generated document", { x: 95, y: 25, size: 8, font: font, color: rgb(0.5, 0.5, 0.55) });
            p.drawText(`Page ${i + 1} of ${pages.length}`, { x: width - 90, y: 25, size: 9, font: font, color: rgb(0.4, 0.4, 0.45) });
        }

        const pdfBytes = await pdfDoc.save();
        
        // Base64 encode for Deno safely (avoiding max call stack with String.fromCharCode(...pdfBytes))
        let binaryString = "";
        for (let i = 0; i < pdfBytes.length; i++) {
            binaryString += String.fromCharCode(pdfBytes[i]);
        }
        const base64Pdf = btoa(binaryString);

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
                filename: `${new Date().toLocaleString('default', { month: 'long' })}_${ledger.name.replace(/[^a-z0-9]/gi, '_')}_LedgerReport.pdf`,
                content: base64Pdf,
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
