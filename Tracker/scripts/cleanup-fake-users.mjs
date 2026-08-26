import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load .env from project root
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const SUPABASE_URL = "https://kmllvchwuhrnnahksurt.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!SERVICE_KEY) {
  console.error("❌ ERROR: Please add SUPABASE_SERVICE_ROLE_KEY to your .env file to fetch users.");
  process.exit(1);
}

if (!GEMINI_API_KEY) {
  console.error("❌ ERROR: GEMINI_API_KEY is not set in .env.");
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY);

async function isFakeEmail(email) {
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Analyze this email address: "${email}". Determine if this domain is a standard, reputable public/corporate/educational email provider, or if it exhibits characteristics of a temporary, disposable, catch-all, bot, or throwaway email service (e.g. 10minutemail, mailinator, telegram bot emails, pseudo-corporate random domain generators, nonsense/disposable domains). Reply with ONLY "true" if it is fake/disposable/suspicious throwaway, or "false" if it is a standard/valid email provider.`
          }]
        }]
      })
    });
    
    if (!response.ok) {
      console.warn(`[${email}] API returned error status: ${response.status}`);
      return false;
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()?.toLowerCase();
    
    return text === 'true' || text?.startsWith('true');
  } catch (error) {
    console.error(`[${email}] Error checking email:`, error.message);
    return false;
  }
}

async function hasActivity(userId) {
  // Check expenses paid by this user
  const { count: expCount } = await supabaseAdmin.from('expenses').select('*', { count: 'exact', head: true }).eq('paid_by', userId);
  // Check expense splits this user is part of
  const { count: splitCount } = await supabaseAdmin.from('expense_splits').select('*', { count: 'exact', head: true }).eq('user_id', userId);
  // Check groups this user is in
  const { count: groupCount } = await supabaseAdmin.from('group_members').select('*', { count: 'exact', head: true }).eq('user_id', userId);
  // Check connections
  const { count: reqCount } = await supabaseAdmin.from('connections').select('*', { count: 'exact', head: true }).eq('requester_id', userId);
  const { count: recCount } = await supabaseAdmin.from('connections').select('*', { count: 'exact', head: true }).eq('receiver_id', userId);

  return (expCount || 0) > 0 || (splitCount || 0) > 0 || (groupCount || 0) > 0 || (reqCount || 0) > 0 || (recCount || 0) > 0;
}

async function run() {
  console.log('Fetching users from database...');
  const { data, error } = await supabaseAdmin.auth.admin.listUsers();
  
  if (error) {
    console.error('Error fetching users:', error);
    return;
  }

  const users = data?.users || [];
  console.log(`Found ${users.length} total users. Looking for fake accounts to clean up...\n`);

  let hardDeleted = 0;
  let softDeleted = 0;
  let validUsers = 0;

  for (const user of users) {
    const email = user.email;
    if (!email) continue;
    const domain = email.split('@')[1];
    if (!domain) continue;

    process.stdout.write(`Analyzing ${email}... `);
    
    // Check cache
    const { data: cachedDomain } = await supabaseAdmin
      .from('email_domains')
      .select('is_fake')
      .eq('domain', domain)
      .maybeSingle();

    let isFake = false;
    if (cachedDomain) {
      isFake = cachedDomain.is_fake;
      process.stdout.write(`[CACHE HIT] `);
    } else {
      isFake = await isFakeEmail(email);
      process.stdout.write(`[API CALLED] `);
      await supabaseAdmin.from('email_domains').upsert({ domain, is_fake: isFake }, { onConflict: 'domain' });
      await new Promise(resolve => setTimeout(resolve, 4200));
    }
    
    if (isFake) {
      process.stdout.write('❌ FAKE - ');
      
      const hasData = await hasActivity(user.id);
      
      if (hasData) {
        // Soft Delete
        console.log('HAS ACTIVITY -> Performing Soft Delete (Ban)');
        
        // 1. Change email and ban them
        const scrambledEmail = `banned_${user.id}@spendova.banned`;
        await supabaseAdmin.auth.admin.updateUserById(user.id, { 
          email: scrambledEmail,
          ban_duration: '876000h' // 100 years
        });
        
        // 2. Anonymize profile
        await supabaseAdmin.from('profiles').update({ 
          full_name: 'Deactivated User',
          username: `deactivated_${user.id.substring(0, 8)}`
        }).eq('user_id', user.id);
        
        softDeleted++;
      } else {
        // Hard Delete
        console.log('ISOLATED -> Performing Hard Delete');
        await supabaseAdmin.auth.admin.deleteUser(user.id);
        hardDeleted++;
      }
    } else {
      console.log('✅ VALID -> Kept');
      validUsers++;
    }
  }
  
  console.log('\n--- Cleanup Summary ---');
  console.log(`Total users checked: ${users.length}`);
  console.log(`Valid users kept: ${validUsers}`);
  console.log(`Hard deleted (Isolated bots): ${hardDeleted}`);
  console.log(`Soft deleted (Attached bots): ${softDeleted}`);
}

run();
