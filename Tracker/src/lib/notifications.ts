import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { supabase } from "@/integrations/supabase/client";

const firebaseConfig = {
  apiKey: "AIzaSyDk41B6pVQfYrm6KDkIoL32QKGxNzwmseM",
  authDomain: "spendova-1252.firebaseapp.com",
  projectId: "spendova-1252",
  storageBucket: "spendova-1252.firebasestorage.app",
  messagingSenderId: "600416942612",
  appId: "1:600416942612:web:e51021d51bf636f7344501"
};

const app = initializeApp(firebaseConfig);

/**
 * Initializes push notifications for the current user.
 * Automatically handles Web vs Native (Capacitor) implementations.
 */
export async function initializeNotifications(userId: string) {
  try {
    if (Capacitor.isNativePlatform()) {
      await initializeCapacitorNotifications(userId);
    } else {
      await initializeWebNotifications(userId);
    }
  } catch (error) {
    console.error("Error initializing notifications:", error);
  }
}

async function saveTokenToSupabase(userId: string, token: string, platform: string) {
  // @ts-expect-error user_push_tokens table types are not yet generated
  const { error } = await supabase.from("user_push_tokens").upsert(
    { user_id: userId, token, platform },
    { onConflict: 'user_id,token' }
  );
  if (error) {
    console.error("Failed to save push token to Supabase:", error);
  } else {
    console.log(`Push token saved for platform: ${platform}`);
  }
}

async function initializeWebNotifications(userId: string) {
  if (!("Notification" in window)) {
    console.log("This browser does not support web push notifications.");
    return;
  }

  const permission = await Notification.requestPermission();
  if (permission === "granted") {
    const messaging = getMessaging(app);
    try {
      // NOTE: We need the VAPID key to generate web tokens.
      const currentToken = await getToken(messaging, {
        vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
      });

      if (currentToken) {
        await saveTokenToSupabase(userId, currentToken, "web");
      }
    } catch (e) {
      console.warn("An error occurred while retrieving token. ", e);
    }

    // Handle incoming messages while the app is in the foreground
    onMessage(messaging, (payload) => {
      console.log("Message received in foreground: ", payload);
      // Optional: Show a custom toast/notification in the app UI
      if (payload.notification) {
        new Notification(payload.notification.title || "New Message", {
          body: payload.notification.body,
        });
      }
    });
  }
}

async function initializeCapacitorNotifications(userId: string) {
  let permStatus = await PushNotifications.checkPermissions();

  if (permStatus.receive === 'prompt') {
    permStatus = await PushNotifications.requestPermissions();
  }

  if (permStatus.receive !== 'granted') {
    console.log("User denied native push notification permissions");
    return;
  }

  await PushNotifications.register();

  PushNotifications.addListener('registration', async (token) => {
    console.log("Native Push registration success, token: " + token.value);
    await saveTokenToSupabase(userId, token.value, Capacitor.getPlatform());
  });

  PushNotifications.addListener('registrationError', (error: any) => {
    console.error("Error on native push registration: ", JSON.stringify(error));
  });

  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    console.log("Native Push received: ", notification);
  });
}
