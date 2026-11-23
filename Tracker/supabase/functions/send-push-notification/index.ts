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
      throw new Error("Firebase is not initialized. Please ensure FIREBASE_SERVICE_ACCOUNT is set.");
    }

    const body = await req.json();

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    let title = "";
    let messageBody = "";
    let tokens: string[] = [];
    let targetUserId: string | null = null;
    let targetUserInfo: any = null;

    const isWebhook = Boolean(body.type === 'INSERT' && body.record);
    const isBroadcast = Boolean(body.broadcast || body.sendToAll);

    if (isWebhook) {
      // Webhook payload from Supabase notifications table
      const notificationRow = body.record;
      if (!notificationRow || !notificationRow.title) {
        return new Response(JSON.stringify({ message: "Invalid payload or not a notification" }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      targetUserId = notificationRow.user_id;
      title = notificationRow.title;
      messageBody = notificationRow.message || "";
    } else {
      // Direct invocation from Admin Console or App Services
      title = body.title || "Spendova Notification";
      messageBody = body.body || body.message || "";

      if (body.username) {
        const cleanUsername = String(body.username).replace(/^@/, '').trim().toLowerCase();
        const { data: profile, error: profErr } = await supabaseAdmin
          .from('profiles')
          .select('user_id, full_name, username')
          .ilike('username', cleanUsername)
          .maybeSingle();

        if (profErr || !profile) {
          return new Response(JSON.stringify({
            success: false,
            error: `User with username '@${cleanUsername}' not found in Spendova profiles.`,
          }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        targetUserId = profile.user_id;
        targetUserInfo = profile;
      } else if (body.userId) {
        targetUserId = body.userId;
      } else if (isBroadcast) {
        // Broadcast to all users
        targetUserId = null;
      } else {
        return new Response(JSON.stringify({
          success: false,
          error: "Either username, userId, broadcast, or webhook record is required.",
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Also persist to in-app notifications table so the user sees it in their notification inbox modal
    try {
      const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();

      if (isBroadcast) {
        const { data: allProfiles, error: profsErr } = await supabaseAdmin
          .from('profiles')
          .select('user_id');

        if (!profsErr && allProfiles && allProfiles.length > 0) {
          // Check if duplicate broadcast was already inserted in the last 60 seconds
          const { data: existingNotifs } = await supabaseAdmin
            .from('notifications')
            .select('id')
            .eq('title', title)
            .eq('message', messageBody)
            .gte('created_at', oneMinuteAgo)
            .limit(1);

          if (!existingNotifs || existingNotifs.length === 0) {
            const notifRows = allProfiles.map((p: any) => ({
              user_id: p.user_id,
              type: 'admin_broadcast',
              title: title,
              message: messageBody,
              entity_type: 'admin_alert',
              is_read: false,
            }));

            for (let i = 0; i < notifRows.length; i += 200) {
              const chunk = notifRows.slice(i, i + 200);
              const { error: insErr } = await supabaseAdmin.from('notifications').insert(chunk);
              if (insErr) console.warn("Failed inserting broadcast notifications chunk to DB:", insErr);
            }
            console.log(`Persisted in-app broadcast notifications to DB for ${allProfiles.length} users.`);
          } else {
            console.log("Broadcast notification already persisted in DB (deduplicated).");
          }
        }
      } else if (targetUserId) {
        // Check if duplicate targeted notification was already inserted in the last 60 seconds
        const { data: existingNotif } = await supabaseAdmin
          .from('notifications')
          .select('id')
          .eq('user_id', targetUserId)
          .eq('title', title)
          .eq('message', messageBody)
          .gte('created_at', oneMinuteAgo)
          .limit(1);

        if (!existingNotif || existingNotif.length === 0) {
          const { error: insErr } = await supabaseAdmin.from('notifications').insert({
            user_id: targetUserId,
            type: 'admin_alert',
            title: title,
            message: messageBody,
            entity_type: 'admin_alert',
            is_read: false,
          });
          if (insErr) {
            console.warn("Could not insert targeted notification to DB:", insErr);
          } else {
            console.log(`Persisted in-app targeted notification for user: ${targetUserId}`);
          }
        } else {
          console.log(`Targeted notification already persisted for user: ${targetUserId} (deduplicated).`);
        }
      }
    } catch (dbErr) {
      console.warn("Could not insert notification into DB:", dbErr);
    }

    // Fetch device tokens for the recipient(s)
    let tokensQuery = supabaseAdmin.from('user_push_tokens').select('token, platform, user_id');
    if (targetUserId) {
      tokensQuery = tokensQuery.eq('user_id', targetUserId);
    }
    const { data: tokensData, error: tokensErr } = await tokensQuery;

    if (tokensErr) {
      console.error("Error querying user_push_tokens:", tokensErr);
    }

    const devicePlatforms = (tokensData || []).map((t: any) => t.platform || 'unknown');
    tokens = Array.from(new Set((tokensData || []).map((t: any) => t.token).filter(Boolean)));
    console.log(`Found ${tokens.length} device tokens for target: ${targetUserId || 'ALL'}`);

    if (tokens.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        sent: 0,
        tokensFound: 0,
        user: targetUserInfo,
        reason: targetUserInfo
          ? `User @${targetUserInfo.username} exists, but has 0 active device push tokens registered. The user must open Spendova on Android/iOS APK or allow push notifications in their browser.`
          : "No device push tokens registered in the system.",
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Send Firebase Cloud Messaging Multicast
    const payload = {
      notification: {
        title: title,
        body: messageBody,
      },
      data: {
        path: '/dashboard',
        level: body.level || 'info',
        ...(body.data || {}),
      },
      tokens: tokens,
    };

    console.log("Sending FCM payload...", payload.notification);
    const response = await getMessaging().sendEachForMulticast(payload);
    console.log(`FCM success count: ${response.successCount}, failure count: ${response.failureCount}`);

    return new Response(JSON.stringify({
      success: true,
      tokensFound: tokens.length,
      platforms: devicePlatforms,
      successCount: response.successCount,
      failureCount: response.failureCount,
      user: targetUserInfo,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('send-push-notification error:', error);
    return new Response(JSON.stringify({ error: error?.message || 'Server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
