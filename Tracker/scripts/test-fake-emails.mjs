import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load .env from project root
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const SUPABASE_URL = "https://kmllvchwuhrnnahksurt.supabase.co";
// Need service role key to access auth.users
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!SERVICE_KEY) {
  console.error("❌ ERROR: Please add SUPABASE_SERVICE_ROLE_KEY to your .env file to fetch users.");
  console.log("You can find this key in your Supabase Dashboard -> Project Settings -> API -> service_role secret.");
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
            text: `Analyze this email address: "${email}". Is it from a known temporary, disposable, or fake email service (like 10minutemail, mailinator, telegram bot emails, etc)? Reply with ONLY "true" if it is fake/disposable, or "false" if it is a standard/valid email provider.`
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

async function run() {
  console.log('Fetching users from database...');
  const { data, error } = await supabaseAdmin.auth.admin.listUsers();
  
  if (error) {
    console.error('Error fetching users:', error);
    return;
  }

  const users = data?.users || [];
  console.log(`Found ${users.length} users. Checking emails against Gemini...\n`);

  let fakeCount = 0;
  for (const user of users) {
    const email = user.email;
    if (!email) continue;
    const domain = email.split('@')[1];
    if (!domain) continue;

    process.stdout.write(`Checking ${email}... `);
    
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
      
      // Save to cache (using upsert)
      await supabaseAdmin.from('email_domains').upsert({ domain, is_fake: isFake }, { onConflict: 'domain' });
      
      // Add a 4.2s delay to avoid Gemini API free-tier rate limits only when API is called
      await new Promise(resolve => setTimeout(resolve, 4200));
    }
    
    if (isFake) {
      console.log('❌ FAKE');
      fakeCount++;
    } else {
      console.log('✅ VALID');
    }
    

  }
  
  console.log('\n--- Summary ---');
  console.log(`Total users checked: ${users.length}`);
  console.log(`Fake emails detected: ${fakeCount}`);
}

run();
