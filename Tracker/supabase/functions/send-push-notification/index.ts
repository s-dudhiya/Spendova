// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { initializeApp, cert } from 'npm:firebase-admin/app'
import { getMessaging } from 'npm:firebase-admin/messaging'

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
      initializeApp({
        credential: cert(serviceAccount)
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

    const notificationRow = record;
    if (!notificationRow || !notificationRow.title) {
      console.log("Invalid payload or not a notification", record);
      throw new Error("Invalid payload");
    }

    console.log(`Processing notification for user ${notificationRow.user_id}`);

    // The notifications table already contains the exact user to notify, 
    // and the exact title and message to send!
    const userIdToNotify = notificationRow.user_id;

    // 1. Fetch device tokens for this specific user
    const { data: tokensData } = await supabaseAdmin
      .from('user_push_tokens')
      .select('token')
      .eq('user_id', userIdToNotify);

    const tokens = tokensData?.map(t => t.token) || [];
    console.log(`Found ${tokens.length} tokens for user ${userIdToNotify}`);

    if (tokens.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0, reason: "No tokens found" }), { status: 200, headers: corsHeaders });
    }

    // 2. Send Firebase Push Notification
    const payload = {
      data: {
        title: notificationRow.title,
        body: notificationRow.message,
        notificationId: notificationRow.id,
        path: '/dashboard', // Default path
      },
      tokens: tokens,
    };

    console.log("Sending FCM data payload...", payload.data);
    const response = await getMessaging().sendEachForMulticast(payload);
    console.log(`FCM success count: ${response.successCount}, failure count: ${response.failureCount}`);

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
