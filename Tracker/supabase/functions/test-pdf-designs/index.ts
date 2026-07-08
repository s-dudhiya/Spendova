// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
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
        const { email } = await req.json();
        
        if (!email) {
            return new Response(JSON.stringify({ error: "Please provide an 'email' in the JSON body" }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        // ==========================================
        // 1. GENERATE DUMMY LEDGER EXPORT
        // ==========================================
        const ledgerPdf = await PDFDocument.create();
        let ledgerPage = ledgerPdf.addPage();
        const { width: w1, height: h1 } = ledgerPage.getSize();
        const font = await ledgerPdf.embedFont(StandardFonts.Helvetica);
        const boldFont = await ledgerPdf.embedFont(StandardFonts.HelveticaBold);

        try {
            const logoImageBytes = Uint8Array.from(atob(SPENDOVA_LOGO_BASE64), c => c.charCodeAt(0));
            const logoImage = await ledgerPdf.embedPng(logoImageBytes);
            const scaledLogo = logoImage.scaleToFit(220, 50); 
            ledgerPage.drawImage(logoImage, {
                x: (w1 - scaledLogo.width) / 2, // Centered
                y: h1 - 80,
                width: scaledLogo.width,
                height: scaledLogo.height,
            });
        } catch (e) {
            const textWidth = boldFont.widthOfTextAtSize("Spendova", 28);
            ledgerPage.drawText("Spendova", { x: (w1 - textWidth) / 2, y: h1 - 70, size: 28, font: boldFont, color: rgb(0.43, 0.16, 0.85) });
        }
        
        const logoY = h1 - 80; // Baseline for next elements
        
        // Report Title (Left aligned)
        ledgerPage.drawText(`Ledger Export: Summer Trip to Bali`, { x: 40, y: logoY - 50, size: 18, font: boldFont, color: rgb(0.1, 0.1, 0.15) });
        ledgerPage.drawText(`Exported on ${new Date().toLocaleDateString()}`, { x: 40, y: logoY - 70, size: 11, font: font, color: rgb(0.4, 0.4, 0.45) });

        let y = logoY - 120;
        const columns = ['Date', 'Title', 'Amount', 'Category', 'Paid By', 'Status'];
        const colWidths = [70, 110, 70, 80, 90, 60];
        const tableWidth = colWidths.reduce((a, b) => a + b, 0);
        const rowHeight = 24;

        // Modern Header Background
        ledgerPage.drawRectangle({ x: 35, y: y - 8, width: tableWidth + 10, height: 28, color: rgb(0.96, 0.95, 0.99) });
        // Header Borders
        ledgerPage.drawLine({ start: { x: 35, y: y - 8 }, end: { x: 35 + tableWidth + 10, y: y - 8 }, color: rgb(0.85, 0.8, 0.95), thickness: 1 });
        ledgerPage.drawLine({ start: { x: 35, y: y + 20 }, end: { x: 35 + tableWidth + 10, y: y + 20 }, color: rgb(0.85, 0.8, 0.95), thickness: 1 });

        let startX = 40;
        columns.forEach((col, i) => {
            ledgerPage.drawText(col, { x: startX, y: y + 2, size: 10, font: boldFont, color: rgb(0.3, 0.15, 0.6) });
            startX += colWidths[i];
        });
        y -= rowHeight;

        const dummyLedgerData = [
            [new Date().toLocaleDateString(), "Flight Tickets", "$1200.00", "Travel", "John Doe", "paid"],
            [new Date().toLocaleDateString(), "Hotel Booking", "$850.50", "Accommodation", "Jane Smith", "paid"],
            [new Date().toLocaleDateString(), "Dinner at Beach", "$120.00", "Food", "John Doe", "unpaid"],
            [new Date().toLocaleDateString(), "Scuba Diving", "$300.00", "Activity", "Jane Smith", "paid"],
            [new Date().toLocaleDateString(), "Taxi to Airport", "$45.00", "Transport", "John Doe", "unpaid"]
        ];

        dummyLedgerData.forEach((row, rowIndex) => {
            if (rowIndex % 2 === 0) {
                ledgerPage.drawRectangle({ x: 35, y: y - 8, width: tableWidth + 10, height: rowHeight, color: rgb(0.98, 0.98, 0.99) });
            }
            ledgerPage.drawLine({ start: { x: 35, y: y - 8 }, end: { x: 35 + tableWidth + 10, y: y - 8 }, color: rgb(0.92, 0.92, 0.94), thickness: 1 });
            let cx = 40;
            row.forEach((cell, i) => {
                ledgerPage.drawText(cell, { x: cx, y: y + 2, size: 9, font: font, color: rgb(0.2, 0.2, 0.25) });
                cx += colWidths[i];
            });
            y -= rowHeight;
        });
        
        const lPages = ledgerPdf.getPages();
        for (let i = 0; i < lPages.length; i++) {
            const p = lPages[i];
            const { width, height } = p.getSize();
            p.drawLine({ start: { x: 40, y: 40 }, end: { x: width - 40, y: 40 }, color: rgb(0.9, 0.88, 0.95), thickness: 1 });
            p.drawText("Spendova", { x: 40, y: 25, size: 9, font: boldFont, color: rgb(0.4, 0.4, 0.45) });
            p.drawText("System-generated document", { x: 95, y: 25, size: 8, font: font, color: rgb(0.5, 0.5, 0.55) });
            p.drawText(`Page ${i + 1} of ${lPages.length}`, { x: width - 90, y: 25, size: 9, font: font, color: rgb(0.4, 0.4, 0.45) });
        }

        const ledgerBytes = await ledgerPdf.save();
        let ledgerBase64 = "";
        for (let i = 0; i < ledgerBytes.length; i++) ledgerBase64 += String.fromCharCode(ledgerBytes[i]);
        ledgerBase64 = btoa(ledgerBase64);


        // ==========================================
        // 2. GENERATE DUMMY MONTHLY REPORT
        // ==========================================
        const monthlyPdf = await PDFDocument.create();
        let monthlyPage = monthlyPdf.addPage();
        const { width: w2, height: h2 } = monthlyPage.getSize();
        
        try {
            const logoImageBytes2 = Uint8Array.from(atob(SPENDOVA_LOGO_BASE64), c => c.charCodeAt(0));
            const logoImage2 = await monthlyPdf.embedPng(logoImageBytes2);
            const scaledLogo2 = logoImage2.scaleToFit(220, 50); 
            monthlyPage.drawImage(logoImage2, {
                x: (w2 - scaledLogo2.width) / 2,
                y: h2 - 80,
                width: scaledLogo2.width,
                height: scaledLogo2.height,
            });
        } catch (e) {
            const textWidth = boldFont.widthOfTextAtSize("Spendova", 28);
            monthlyPage.drawText("Spendova", { x: (w2 - textWidth) / 2, y: h2 - 70, size: 28, font: boldFont, color: rgb(0.43, 0.16, 0.85) });
        }
        
        const mLogoY = h2 - 80;

        monthlyPage.drawText(`Monthly Report: July 2026`, { x: 40, y: mLogoY - 50, size: 18, font: boldFont, color: rgb(0.1, 0.1, 0.15) });
        monthlyPage.drawText(`Prepared for: Jane Doe`, { x: 40, y: mLogoY - 70, size: 11, font: font, color: rgb(0.4, 0.4, 0.45) });

        let mRowHeight = 24;
        let y2 = mLogoY - 120;
        const mCols = ['Date', 'Category', 'Amount', 'Note'];
        const mWidths = [80, 140, 90, 180];
        const mTableWidth = mWidths.reduce((a, b) => a + b, 0);

        // ----------------------------------------------------
        // MONTHLY SUMMARY SECTION (Bar Chart & Totals)
        // ----------------------------------------------------
        const totalSpent = 250.50;
        const categoryStats = [
            { name: "Groceries", amount: 120.50, color: rgb(0.2, 0.75, 0.4) }, // Green
            { name: "Utilities", amount: 85.00, color: rgb(0.2, 0.5, 0.9) },   // Blue
            { name: "Dining Out", amount: 45.00, color: rgb(0.9, 0.4, 0.2) }   // Orange
        ];

        monthlyPage.drawText("Monthly Summary", { x: 40, y: y2, size: 14, font: boldFont, color: rgb(0.1, 0.1, 0.15) });
        monthlyPage.drawText(`Total Spent: $${totalSpent.toFixed(2)}`, { x: w2 - 200, y: y2, size: 14, font: boldFont, color: rgb(0.43, 0.16, 0.85) });
        
        y2 -= 25;
        const maxAmount = Math.max(...categoryStats.map(s => s.amount));
        const maxBarWidth = 250;

        categoryStats.forEach(stat => {
            monthlyPage.drawText(stat.name, { x: 40, y: y2, size: 10, font: font, color: rgb(0.3, 0.3, 0.35) });
            const barWidth = (stat.amount / maxAmount) * maxBarWidth;
            
            // Bar background
            monthlyPage.drawRectangle({ x: 130, y: y2 - 2, width: maxBarWidth, height: 12, color: rgb(0.95, 0.95, 0.95) });
            // Actual colored bar
            monthlyPage.drawRectangle({ x: 130, y: y2 - 2, width: barWidth, height: 12, color: stat.color });
            
            monthlyPage.drawText(`$${stat.amount.toFixed(2)}`, { x: 135 + maxBarWidth, y: y2, size: 9, font: boldFont, color: stat.color });
            y2 -= 18;
        });

        // ----------------------------------------------------
        // YTD SPENDING TREND (Month-wise)
        // ----------------------------------------------------
        y2 -= 40; // Space after category chart
        monthlyPage.drawText("Year-To-Date Spending Trend", { x: 40, y: y2, size: 14, font: boldFont, color: rgb(0.1, 0.1, 0.15) });
        y2 -= 25;

        // Dummy YTD Data (Only months with > 0 spending as requested)
        const ytdStats = [
            { month: "Jan", amount: 180.00 },
            { month: "Feb", amount: 220.50 },
            // Skipped March because amount was 0 (as requested by user rule)
            { month: "Apr", amount: 310.00 },
            { month: "May", amount: 150.00 },
            { month: "Jun", amount: 250.50 } 
        ];

        const maxYtd = Math.max(...ytdStats.map(s => s.amount));
        const maxBarWidthYtd = 250;

        ytdStats.forEach(stat => {
            monthlyPage.drawText(stat.month, { x: 40, y: y2, size: 10, font: font, color: rgb(0.3, 0.3, 0.35) });
            const barWidth = (stat.amount / maxYtd) * maxBarWidthYtd;
            
            monthlyPage.drawRectangle({ x: 130, y: y2 - 2, width: maxBarWidthYtd, height: 12, color: rgb(0.95, 0.95, 0.95) });
            // Using a distinct blue/purple for the time trend
            monthlyPage.drawRectangle({ x: 130, y: y2 - 2, width: barWidth, height: 12, color: rgb(0.3, 0.15, 0.6) });
            
            monthlyPage.drawText(`$${stat.amount.toFixed(2)}`, { x: 135 + maxBarWidthYtd, y: y2, size: 9, font: boldFont, color: rgb(0.3, 0.15, 0.6) });
            y2 -= 18;
        });

        y2 -= 30; // Space before table

        // ----------------------------------------------------
        // EXPENSES TABLE
        // ----------------------------------------------------
        monthlyPage.drawRectangle({ x: 35, y: y2 - 8, width: mTableWidth + 10, height: 28, color: rgb(0.96, 0.95, 0.99) });
        monthlyPage.drawLine({ start: { x: 35, y: y2 - 8 }, end: { x: 35 + mTableWidth + 10, y: y2 - 8 }, color: rgb(0.85, 0.8, 0.95), thickness: 1 });
        monthlyPage.drawLine({ start: { x: 35, y: y2 + 20 }, end: { x: 35 + mTableWidth + 10, y: y2 + 20 }, color: rgb(0.85, 0.8, 0.95), thickness: 1 });

        let mStartX = 40;
        mCols.forEach((col, i) => {
            monthlyPage.drawText(col, { x: mStartX, y: y2 + 2, size: 10, font: boldFont, color: rgb(0.3, 0.15, 0.6) });
            mStartX += mWidths[i];
        });
        y2 -= mRowHeight;

        const dummyExpenses = [
            [new Date().toLocaleDateString(), "Groceries", "$120.50", "Weekly Walmart run"],
            [new Date().toLocaleDateString(), "Utilities", "$85.00", "Electric Bill"],
            [new Date().toLocaleDateString(), "Dining Out", "$45.00", "Lunch with colleagues"]
        ];

        dummyExpenses.forEach((row, rowIndex) => {
            if (rowIndex % 2 === 0) {
                monthlyPage.drawRectangle({ x: 35, y: y2 - 8, width: mTableWidth + 10, height: mRowHeight, color: rgb(0.98, 0.98, 0.99) });
            }
            monthlyPage.drawLine({ start: { x: 35, y: y2 - 8 }, end: { x: 35 + mTableWidth + 10, y: y2 - 8 }, color: rgb(0.92, 0.92, 0.94), thickness: 1 });
            let cx = 40;
            row.forEach((cell, i) => {
                monthlyPage.drawText(cell, { x: cx, y: y2 + 2, size: 9, font: font, color: rgb(0.2, 0.2, 0.25) });
                cx += mWidths[i];
            });
            y2 -= mRowHeight;
        });

        // Add dummy debts
        y2 -= 30;
        monthlyPage.drawText("Unpaid Debts (Older than 3 months)", { x: 40, y: y2, size: 14, font: boldFont, color: rgb(0.86, 0.15, 0.15) });
        y2 -= 18;
        monthlyPage.drawText("These expenses have been safely removed from your app to save space, but are recorded here as proof of debt.", { x: 40, y: y2, size: 9, font: font, color: rgb(0.4, 0.4, 0.45) });
        y2 -= 30;
        
        const debtCols = ['Date', 'Expense', 'Unpaid Amount'];
        const debtWidths = [120, 220, 150];
        const debtTableWidth = debtWidths.reduce((a, b) => a + b, 0);

        monthlyPage.drawRectangle({ x: 35, y: y2 - 8, width: debtTableWidth + 10, height: 28, color: rgb(0.98, 0.92, 0.92) });
        monthlyPage.drawLine({ start: { x: 35, y: y2 - 8 }, end: { x: 35 + debtTableWidth + 10, y: y2 - 8 }, color: rgb(0.9, 0.8, 0.8), thickness: 1 });
        monthlyPage.drawLine({ start: { x: 35, y: y2 + 20 }, end: { x: 35 + debtTableWidth + 10, y: y2 + 20 }, color: rgb(0.9, 0.8, 0.8), thickness: 1 });
        
        let dx = 40;
        debtCols.forEach((col, i) => {
            monthlyPage.drawText(col, { x: dx, y: y2 + 2, size: 10, font: boldFont, color: rgb(0.7, 0.1, 0.1) });
            dx += debtWidths[i];
        });
        y2 -= mRowHeight;

        const dummyDebts = [
            ["02/14/2026", "Valentine's Dinner split", "$45.00"],
            ["03/10/2026", "Uber to airport", "$12.50"]
        ];

        dummyDebts.forEach((row, rowIndex) => {
            if (rowIndex % 2 === 0) {
                monthlyPage.drawRectangle({ x: 35, y: y2 - 8, width: debtTableWidth + 10, height: mRowHeight, color: rgb(0.99, 0.97, 0.97) });
            }
            monthlyPage.drawLine({ start: { x: 35, y: y2 - 8 }, end: { x: 35 + debtTableWidth + 10, y: y2 - 8 }, color: rgb(0.95, 0.88, 0.88), thickness: 1 });
            let cx = 40;
            row.forEach((cell, i) => {
                monthlyPage.drawText(cell, { x: cx, y: y2 + 2, size: 9, font: font, color: rgb(0.2, 0.2, 0.25) });
                cx += debtWidths[i];
            });
            y2 -= mRowHeight;
        });

        const mPages = monthlyPdf.getPages();
        for (let i = 0; i < mPages.length; i++) {
            const p = mPages[i];
            const { width, height } = p.getSize();
            p.drawLine({ start: { x: 40, y: 40 }, end: { x: width - 40, y: 40 }, color: rgb(0.9, 0.88, 0.95), thickness: 1 });
            p.drawText("Spendova", { x: 40, y: 25, size: 9, font: boldFont, color: rgb(0.4, 0.4, 0.45) });
            p.drawText("System-generated document", { x: 95, y: 25, size: 8, font: font, color: rgb(0.5, 0.5, 0.55) });
            p.drawText(`Page ${i + 1} of ${mPages.length}`, { x: width - 90, y: 25, size: 9, font: font, color: rgb(0.4, 0.4, 0.45) });
        }

        const monthlyBytes = await monthlyPdf.save();
        let monthlyBase64 = "";
        for (let i = 0; i < monthlyBytes.length; i++) monthlyBase64 += String.fromCharCode(monthlyBytes[i]);
        monthlyBase64 = btoa(monthlyBase64);

        // ==========================================
        // 3. SEND EMAIL WITH BOTH ATTACHMENTS
        // ==========================================
        const SMTP_HOST = Deno.env.get('SMTP_HOST') || 'smtp.gmail.com';
        const SMTP_PORT = parseInt(Deno.env.get('SMTP_PORT') || '465');
        const SMTP_USER = Deno.env.get('SMTP_USER');
        const SMTP_PASS = Deno.env.get('SMTP_PASS');

        if (!SMTP_USER || !SMTP_PASS) {
            return new Response(JSON.stringify({ error: "SMTP credentials not configured" }), { status: 500, headers: corsHeaders });
        }

        const transporter = nodemailer.createTransport({
            host: SMTP_HOST,
            port: SMTP_PORT,
            secure: SMTP_PORT === 465,
            auth: { user: SMTP_USER, pass: SMTP_PASS },
        });

        await transporter.sendMail({
            from: fromAddress(SMTP_USER),
            to: email,
            subject: cleanMailHeader("Test: Spendova PDF Designs"),
            text: "Attached are the two test PDFs.",
            html: emailTemplate({
                preview: 'Test PDFs',
                title: "Test PDF Layouts",
                body: [],
                contentHtml: `<p>Please find attached the dummy PDFs for the Ledger Export and Monthly Report to test the design styling.</p>`,
                footer: 'Spendova Test'
            }),
            attachments: [
                {
                    filename: 'Dummy_Ledger_Export.pdf',
                    content: ledgerBase64,
                    encoding: 'base64'
                },
                {
                    filename: 'Dummy_Monthly_Report.pdf',
                    content: monthlyBase64,
                    encoding: 'base64'
                }
            ]
        });

        return new Response(JSON.stringify({ success: true, message: `Test emails sent to ${email} successfully!` }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    } catch (error: any) {
        console.error("Test function error:", error.message);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }
})
