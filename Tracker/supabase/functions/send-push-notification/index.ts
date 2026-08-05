// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import admin from 'npm:firebase-admin'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

let firebaseInitialized = false;

function initFirebase() {
  if (!firebaseInitialized) {
    const serviceAccountStr = Deno.env.get('FIREBASE_SERVICE_ACCOUNT');
    if (serviceAccountStr) {
      const serviceAccount = JSON.parse(serviceAccountStr);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      firebaseInitialized = true;
    } else {
      console.warn("FIREBASE_SERVICE_ACCOUNT secret is missing");
    }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    initFirebase();
    if (!firebaseInitialized) {
      throw new Error("Firebase is not initialized");
    }

    const { record, type } = await req.json()
    // This expects a webhook payload from Supabase

    if (type !== 'INSERT') {
      return new Response(JSON.stringify({ message: "Ignored non-insert event" }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const expense = record;
    if (!expense || !expense.amount) {
      throw new Error("Invalid payload");
    }

    // 1. Fetch payer details
    const { data: payer } = await supabaseAdmin.from('profiles').select('full_name, username').eq('user_id', expense.paid_by).single();
    const payerName = payer?.full_name || payer?.username || 'Someone';

    // 2. Determine who needs to be notified
    let userIdsToNotify: string[] = [];

    // If it's a splitwise expense
    if (expense.group_id) {
        const { data: members } = await supabaseAdmin.from('group_members').select('user_id').eq('group_id', expense.group_id);
        if (members) {
            userIdsToNotify = members.map(m => m.user_id).filter(id => id !== expense.paid_by);
        }
    } 
    // If it's a ledger expense
    else if (expense.ledger_id) {
        const { data: members } = await supabaseAdmin.from('ledger_members').select('user_id').eq('ledger_id', expense.ledger_id);
        if (members) {
            userIdsToNotify = members.map(m => m.user_id).filter(id => id !== expense.paid_by);
        }
    }

    if (userIdsToNotify.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0 }), { status: 200, headers: corsHeaders });
    }

    // 3. Fetch device tokens
    const { data: tokensData } = await supabaseAdmin
      .from('user_push_tokens')
      .select('token')
      .in('user_id', userIdsToNotify);

    const tokens = tokensData?.map(t => t.token) || [];

    if (tokens.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0, reason: "No tokens found" }), { status: 200, headers: corsHeaders });
    }

    // 4. Send Firebase Push Notification
    const payload = {
      notification: {
        title: `New Expense Added`,
        body: `${payerName} added a new expense for ${expense.amount}`,
      },
      data: {
        expenseId: expense.id,
        path: expense.ledger_id ? `/ledger/${expense.ledger_id}` : '/dashboard',
      },
      tokens: tokens,
    };

    const response = await admin.messaging().sendEachForMulticast(payload);

    return new Response(JSON.stringify({ success: true, successCount: response.successCount }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error: any) {
    console.error('send-push-notification error:', error)
    return new Response(JSON.stringify({ error: error?.message || 'Server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
