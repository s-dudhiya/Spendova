import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

// --- Configuration ---
// Make sure to set these in a .env file or export them in your terminal
const SUPABASE_URL = process.env.VITE_SUPABASE_URL; // e.g. https://your-project.supabase.co
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
// ^^^ CRITICAL: You MUST use the Service Role Key to bypass RLS and fetch auth.users

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.");
    console.log("Create a .env file with VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
}

// Ensure the local Node environment doesn't use the anon key if we're doing admin things
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function runAdminMailJob() {
    console.log("Fetching users from Supabase...");

    // Fetch all users using admin API
    const { data: usersData, error: usersError } = await supabase.auth.admin.listUsers();

    if (usersError) {
        console.error("Error fetching users:", usersError);
        return;
    }

    const emails = usersData.users.map(u => u.email).filter(Boolean) as string[];

    console.log(`Found ${emails.length} users with emails.`);

    if (emails.length === 0) {
        console.log("No users to email. Exiting.");
        return;
    }

    // --- MAIL GENERATION ---
    console.log("\n=================================");
    console.log(`Mailto string generated for ${emails.length} users:`);
    console.log("=================================\n");

    const bccPayload = emails.join(',');
    const mailToLink = `mailto:?bcc=${bccPayload}&subject=ExpenseMate%20Maintenance%20Notice&body=Hi%20there,%0A%0AThe%20ExpenseMate%20platform%20will%20be%20undergoing%20maintenance.`;

    console.log(mailToLink);

    console.log("\n---");
    console.log("Copy the exact 'mailto:...' string above and paste it directly into your browser's URL bar, or into a 'Run' dialogue, and it will automatically open your default desktop Email Client (like Outlook, Mail app, or Gmail) with every user pre-filled into the BCC field so they can't see each other's addresses.");
}

runAdminMailJob();
