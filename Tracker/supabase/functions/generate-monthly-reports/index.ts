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
        
        // Allow service role or anon key (if triggered via cron securely)
        // For cron, typically we check a custom auth header or allow anon if we don't expose it.
        // We will just verify it's a valid request.

        const now = new Date()
        const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        const previousMonthString = previousMonth.toISOString().split('T')[0]
        const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)
        
        const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1)
        const cutoffDateString = threeMonthsAgo.toISOString()

        // Fetch up to 10 users who haven't been processed for the previous month
        const { data: usersToProcess, error: usersError } = await supabaseAdmin
            .from('profiles')
            .select('user_id, full_name, username')
            .limit(10)

        if (usersError || !usersToProcess) {
            throw new Error('Failed to fetch users')
        }

        let processedCount = 0;

        for (const userProfile of usersToProcess) {
            const userId = userProfile.user_id;

            // Check if already processed
            const { data: existingStat } = await supabaseAdmin
                .from('monthly_category_stats')
                .select('id')
                .eq('user_id', userId)
                .eq('month_date', previousMonthString)
                .maybeSingle()

            if (existingStat) continue;

            // Fetch previous month expenses
            const { data: monthExpenses } = await supabaseAdmin
                .from('expenses')
                .select('*, expense_splits(*)')
                .eq('user_id', userId)
                .gte('created_at', previousMonth.toISOString())
                .lte('created_at', previousMonthEnd.toISOString())
            
            // Fetch old expenses to be purged
            const { data: oldExpenses } = await supabaseAdmin
                .from('expenses')
                .select('*, expense_splits(*)')
                .eq('user_id', userId)
                .lt('created_at', cutoffDateString)

            const activeMonthExpenses = monthExpenses || [];
            const purgeExpenses = oldExpenses || [];

            // If no activity, just mark as processed and skip email
            if (activeMonthExpenses.length === 0 && purgeExpenses.length === 0) {
                await supabaseAdmin.from('monthly_category_stats').insert({
                    user_id: userId,
                    month_date: previousMonthString,
                    category_name: 'No Activity',
                    total_spent: 0
                })
                processedCount++;
                continue;
            }

            // Find unpaid debts in old expenses
            const unpaidOldDebts = purgeExpenses.flatMap(exp => {
                const splits = exp.expense_splits || [];
                const unpaid = splits.filter(s => Number(s.amount_owed || 0) > Number(s.amount_paid || 0) && !s.has_paid);
                return unpaid.map(u => ({
                    title: exp.category,
                    date: exp.created_at,
                    amount_owed: u.amount_owed,
                    user_id: u.user_id,
                    paid_by: exp.paid_by
                }));
            });

            // Generate Personal PDF using pdf-lib
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
            
            const mLogoY = height - 80;

            // Report Title
            page.drawText(`Monthly Report: ${previousMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}`, { x: 40, y: mLogoY - 50, size: 18, font: boldFont, color: rgb(0.1, 0.1, 0.15) });
            page.drawText(`Prepared for: ${userProfile.full_name || userProfile.username}`, { x: 40, y: mLogoY - 70, size: 11, font: font, color: rgb(0.4, 0.4, 0.45) });

            // Table Drawing Setup
            let mRowHeight = 24;
            let y = mLogoY - 120;
            const columns = ['Date', 'Category', 'Amount', 'Note'];
            const colWidths = [80, 140, 90, 180];
            const tableWidth = colWidths.reduce((a, b) => a + b, 0);

            // ----------------------------------------------------
            // MONTHLY SUMMARY SECTION (Bar Chart & Totals)
            // ----------------------------------------------------
            const totalSpent = activeMonthExpenses.reduce((sum: number, exp: any) => sum + Number(exp.amount), 0);
            
            const catMap: Record<string, number> = {};
            activeMonthExpenses.forEach((exp: any) => {
                const cat = exp.category || 'Uncategorized';
                catMap[cat] = (catMap[cat] || 0) + Number(exp.amount);
            });

            const palette = [
                rgb(0.2, 0.75, 0.4), // Green
                rgb(0.2, 0.5, 0.9),  // Blue
                rgb(0.9, 0.4, 0.2),  // Orange
                rgb(0.8, 0.2, 0.5),  // Pink
                rgb(0.5, 0.2, 0.8),  // Purple
                rgb(0.2, 0.8, 0.8),  // Teal
            ];

            const categoryStats = Object.keys(catMap).map((name, index) => ({
                name,
                amount: catMap[name],
                color: palette[index % palette.length]
            })).sort((a, b) => b.amount - a.amount);

            page.drawText("Monthly Summary", { x: 40, y, size: 14, font: boldFont, color: rgb(0.1, 0.1, 0.15) });
            page.drawText(`Total Spent: $${totalSpent.toFixed(2)}`, { x: width - 200, y, size: 14, font: boldFont, color: rgb(0.43, 0.16, 0.85) });
            
            y -= 25;
            const maxAmount = categoryStats.length > 0 ? Math.max(...categoryStats.map(s => s.amount)) : 0;
            const maxBarWidth = 250;

            categoryStats.forEach(stat => {
                page.drawText(stat.name, { x: 40, y, size: 10, font: font, color: rgb(0.3, 0.3, 0.35) });
                if (maxAmount > 0) {
                    const barWidth = (stat.amount / maxAmount) * maxBarWidth;
                    page.drawRectangle({ x: 140, y: y - 2, width: maxBarWidth, height: 12, color: rgb(0.95, 0.95, 0.95) });
                    page.drawRectangle({ x: 140, y: y - 2, width: barWidth, height: 12, color: stat.color });
                    page.drawText(`$${stat.amount.toFixed(2)}`, { x: 145 + maxBarWidth, y, size: 9, font: boldFont, color: stat.color });
                }
                y -= 18;
            });

            // ----------------------------------------------------
            // YTD SPENDING TREND (Month-wise)
            // ----------------------------------------------------
            y -= 40;
            page.drawText("Year-To-Date Spending Trend", { x: 40, y, size: 14, font: boldFont, color: rgb(0.1, 0.1, 0.15) });
            y -= 25;

            // Fetch historical YTD stats
            const yearStart = new Date(previousMonth.getFullYear(), 0, 1).toISOString().split('T')[0];
            const { data: ytdData } = await supabaseAdmin
                .from('monthly_category_stats')
                .select('month_date, total_spent')
                .eq('user_id', userId)
                .gte('month_date', yearStart)
                .lte('month_date', previousMonthString);
            
            const monthlyTotals: Record<string, number> = {};
            const monthsOrder = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            
            // Add current month (since it might not be fully saved in DB yet if it's currently processing)
            const currentMonthIndex = previousMonth.getMonth();
            monthlyTotals[monthsOrder[currentMonthIndex]] = totalSpent;

            if (ytdData) {
                ytdData.forEach((row: any) => {
                    if (row.month_date) {
                        const mIndex = parseInt(row.month_date.split('-')[1], 10) - 1;
                        if (mIndex >= 0 && mIndex < 12) {
                            const monthKey = monthsOrder[mIndex];
                            monthlyTotals[monthKey] = (monthlyTotals[monthKey] || 0) + Number(row.total_spent);
                        }
                    }
                });
            }

            // Filter out future months and months with $0 spending
            const ytdStats = monthsOrder.map((m, i) => ({
                month: m,
                amount: monthlyTotals[m] || 0
            })).filter((m, i) => i <= currentMonthIndex && m.amount > 0);

            const maxYtd = ytdStats.length > 0 ? Math.max(...ytdStats.map(s => s.amount)) : 0;
            const maxBarWidthYtd = 250;

            ytdStats.forEach(stat => {
                page.drawText(stat.month, { x: 40, y, size: 10, font: font, color: rgb(0.3, 0.3, 0.35) });
                if (maxYtd > 0) {
                    const barWidth = (stat.amount / maxYtd) * maxBarWidthYtd;
                    page.drawRectangle({ x: 140, y: y - 2, width: maxBarWidthYtd, height: 12, color: rgb(0.95, 0.95, 0.95) });
                    // Distinct purple for time trend
                    page.drawRectangle({ x: 140, y: y - 2, width: barWidth, height: 12, color: rgb(0.3, 0.15, 0.6) });
                    page.drawText(`$${stat.amount.toFixed(2)}`, { x: 145 + maxBarWidthYtd, y, size: 9, font: boldFont, color: rgb(0.3, 0.15, 0.6) });
                }
                y -= 18;
            });

            y -= 30; // Space before table

            // ----------------------------------------------------
            // EXPENSES TABLE
            // ----------------------------------------------------
            // Modern Header Background
            page.drawRectangle({ x: 35, y: y - 8, width: tableWidth + 10, height: 28, color: rgb(0.96, 0.95, 0.99) });
            page.drawLine({ start: { x: 35, y: y - 8 }, end: { x: 35 + tableWidth + 10, y: y - 8 }, color: rgb(0.85, 0.8, 0.95), thickness: 1 });
            page.drawLine({ start: { x: 35, y: y + 20 }, end: { x: 35 + tableWidth + 10, y: y + 20 }, color: rgb(0.85, 0.8, 0.95), thickness: 1 });

            let startX = 40;
            columns.forEach((col, i) => {
                page.drawText(col, { x: startX, y: y + 2, size: 10, font: boldFont, color: rgb(0.3, 0.15, 0.6) });
                startX += colWidths[i];
            });
            y -= mRowHeight;

            if (activeMonthExpenses.length === 0) {
                page.drawText("No expenses recorded for this month.", { x: 40, y: y + 2, size: 9, font: font });
                y -= mRowHeight;
            } else {
                activeMonthExpenses.forEach((exp: any, rowIndex: number) => {
                    if (y < 50) {
                        page = pdfDoc.addPage();
                        y = height - 50;
                        // Redraw header
                        page.drawRectangle({ x: 35, y: y - 8, width: tableWidth + 10, height: 28, color: rgb(0.96, 0.95, 0.99) });
                        page.drawLine({ start: { x: 35, y: y - 8 }, end: { x: 35 + tableWidth + 10, y: y - 8 }, color: rgb(0.85, 0.8, 0.95), thickness: 1 });
                        page.drawLine({ start: { x: 35, y: y + 20 }, end: { x: 35 + tableWidth + 10, y: y + 20 }, color: rgb(0.85, 0.8, 0.95), thickness: 1 });
                        let hx = 40;
                        columns.forEach((col, i) => {
                            page.drawText(col, { x: hx, y: y + 2, size: 10, font: boldFont, color: rgb(0.3, 0.15, 0.6) });
                            hx += colWidths[i];
                        });
                        y -= mRowHeight;
                    }

                    // Striped Background
                    if (rowIndex % 2 === 0) {
                        page.drawRectangle({ x: 35, y: y - 8, width: tableWidth + 10, height: mRowHeight, color: rgb(0.98, 0.98, 0.99) });
                    }
                    
                    page.drawLine({ start: { x: 35, y: y - 8 }, end: { x: 35 + tableWidth + 10, y: y - 8 }, color: rgb(0.92, 0.92, 0.94), thickness: 1 });

                    const row = [
                        new Date(exp.created_at).toLocaleDateString(),
                        (exp.category || 'Uncategorized').substring(0, 25),
                        `$${Number(exp.amount).toFixed(2)}`,
                        (exp.note || '').substring(0, 30)
                    ];
                    
                    let cx = 40;
                    row.forEach((cell, i) => {
                        page.drawText(cell, { x: cx, y: y + 2, size: 9, font: font, color: rgb(0.2, 0.2, 0.25) });
                        cx += colWidths[i];
                    });
                    y -= mRowHeight;
                });
            }

            // Table of unpaid debts being purged
            if (unpaidOldDebts.length > 0) {
                y -= 30;
                if (y < 120) {
                    page = pdfDoc.addPage();
                    y = height - 50;
                }
                
                page.drawText("Unpaid Debts (Older than 3 months)", { x: 40, y, size: 14, font: boldFont, color: rgb(0.86, 0.15, 0.15) });
                y -= 18;
                page.drawText("These expenses have been safely removed from your app to save space, but are recorded here as proof of debt.", { x: 40, y, size: 9, font: font, color: rgb(0.4, 0.4, 0.45) });
                y -= 30;
                
                const debtCols = ['Date', 'Expense', 'Unpaid Amount'];
                const debtWidths = [120, 220, 150];
                const debtTableWidth = debtWidths.reduce((a, b) => a + b, 0);

                // Debt Header Background
                page.drawRectangle({ x: 35, y: y - 8, width: debtTableWidth + 10, height: 28, color: rgb(0.98, 0.92, 0.92) });
                page.drawLine({ start: { x: 35, y: y - 8 }, end: { x: 35 + debtTableWidth + 10, y: y - 8 }, color: rgb(0.9, 0.8, 0.8), thickness: 1 });
                page.drawLine({ start: { x: 35, y: y + 20 }, end: { x: 35 + debtTableWidth + 10, y: y + 20 }, color: rgb(0.9, 0.8, 0.8), thickness: 1 });
                
                let dx = 40;
                debtCols.forEach((col, i) => {
                    page.drawText(col, { x: dx, y: y + 2, size: 10, font: boldFont, color: rgb(0.7, 0.1, 0.1) });
                    dx += debtWidths[i];
                });
                y -= mRowHeight;

                unpaidOldDebts.forEach((d: any, rowIndex: number) => {
                    if (y < 50) {
                        page = pdfDoc.addPage();
                        y = height - 50;
                        page.drawRectangle({ x: 35, y: y - 8, width: debtTableWidth + 10, height: 28, color: rgb(0.98, 0.92, 0.92) });
                        page.drawLine({ start: { x: 35, y: y - 8 }, end: { x: 35 + debtTableWidth + 10, y: y - 8 }, color: rgb(0.9, 0.8, 0.8), thickness: 1 });
                        page.drawLine({ start: { x: 35, y: y + 20 }, end: { x: 35 + debtTableWidth + 10, y: y + 20 }, color: rgb(0.9, 0.8, 0.8), thickness: 1 });
                        let hx = 40;
                        debtCols.forEach((col, i) => {
                            page.drawText(col, { x: hx, y: y + 2, size: 10, font: boldFont, color: rgb(0.7, 0.1, 0.1) });
                            hx += debtWidths[i];
                        });
                        y -= mRowHeight;
                    }

                    if (rowIndex % 2 === 0) {
                        page.drawRectangle({ x: 35, y: y - 8, width: debtTableWidth + 10, height: mRowHeight, color: rgb(0.99, 0.97, 0.97) });
                    }
                    
                    page.drawLine({ start: { x: 35, y: y - 8 }, end: { x: 35 + debtTableWidth + 10, y: y - 8 }, color: rgb(0.95, 0.88, 0.88), thickness: 1 });

                    const row = [
                        new Date(d.date).toLocaleDateString(),
                        (d.title || 'Unknown').substring(0, 40),
                        `$${Number(d.amount_owed).toFixed(2)}`
                    ];
                    
                    let cx = 40;
                    row.forEach((cell, i) => {
                        page.drawText(cell, { x: cx, y: y + 2, size: 9, font: font, color: rgb(0.2, 0.2, 0.25) });
                        cx += debtWidths[i];
                    });
                    y -= mRowHeight;
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
            let binaryString = "";
            for (let i = 0; i < pdfBytes.length; i++) {
                binaryString += String.fromCharCode(pdfBytes[i]);
            }
            const pdfBase64 = btoa(binaryString);

            // Fetch User Email
            const { data: userAuthData } = await supabaseAdmin.auth.admin.getUserById(userId);
            const userEmail = userAuthData?.user?.email;

            if (userEmail) {
                // Send Email
                const SMTP_HOST = Deno.env.get('SMTP_HOST') || 'smtp.gmail.com';
                const SMTP_PORT = parseInt(Deno.env.get('SMTP_PORT') || '465');
                const SMTP_USER = Deno.env.get('SMTP_USER');
                const SMTP_PASS = Deno.env.get('SMTP_PASS');

                if (SMTP_USER && SMTP_PASS) {
                    const transporter = nodemailer.createTransport({
                        host: SMTP_HOST,
                        port: SMTP_PORT,
                        secure: SMTP_PORT === 465,
                        auth: { user: SMTP_USER, pass: SMTP_PASS },
                    });

                    const subject = `Your Spendova Monthly Report - ${previousMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}`;
                    const htmlBody = `
                        <h2>Monthly Spending Report</h2>
                        <p>Attached is your PDF spending report for ${previousMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}.</p>
                        <p>Any expenses older than 3 months have been securely purged from your app to save space. If any of those old expenses contained unpaid debts, they have been permanently recorded in the attached PDF for your records.</p>
                    `;

                    await transporter.sendMail({
                        from: fromAddress(SMTP_USER),
                        to: userEmail,
                        subject: cleanMailHeader(subject),
                        text: stripHtml(htmlBody),
                        html: emailTemplate({
                            preview: 'Monthly Report attached',
                            title: subject,
                            body: [],
                            contentHtml: `<div style="color:#3f4254;font-size:15px;line-height:1.65;">${htmlBody}</div>`,
                            footer: 'Spendova Automated Reports'
                        }),
                        attachments: [{
                            filename: `Spendova_Report_${previousMonth.toLocaleString('default', { month: 'long', year: 'numeric' }).replace(' ', '_')}.pdf`,
                            content: pdfBase64,
                            encoding: 'base64'
                        }]
                    });
                }
            }

            // Delete old expenses
            if (purgeExpenses.length > 0) {
                const purgeIds = purgeExpenses.map(e => e.id);
                await supabaseAdmin.from('expenses').delete().in('id', purgeIds);
            }

            // Mark as processed
            await supabaseAdmin.from('monthly_category_stats').insert({
                user_id: userId,
                month_date: previousMonthString,
                category_name: 'Total',
                total_spent: activeMonthExpenses.reduce((sum, e) => sum + Number(e.amount), 0)
            });

            processedCount++;
        }

        return new Response(JSON.stringify({ success: true, processedCount }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    } catch (error: any) {
        console.error("Cron Error:", error.message);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }
})
