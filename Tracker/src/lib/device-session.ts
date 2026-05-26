import { supabase } from "@/integrations/supabase/client";
import { bootLog, safeStorage, withTimeout } from "@/lib/startup-safety";

const DEVICE_ID_KEY = "spendova_device_id";

export type DeviceSession = {
  id: string;
  device_id: string;
  device_name: string;
  device_type: string;
  platform: string | null;
  active: boolean;
  revoked_at: string | null;
  revoked_reason: string | null;
  created_at: string;
  last_seen_at: string;
};

const randomId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export function getDeviceId() {
  let deviceId = safeStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = randomId();
    safeStorage.setItem(DEVICE_ID_KEY, deviceId);
    bootLog("fallback device id created");
  }
  return deviceId;
}

async function sha256(value: string) {
  try {
    if (!crypto?.subtle) return btoa(value).slice(0, 64);
    const bytes = await withTimeout(crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)), 1500, "device fingerprint");
    return Array.from(new Uint8Array(bytes)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch (error) {
    bootLog("fingerprint fallback", error);
    return btoa(`${getDeviceId()}|${value}`).slice(0, 64);
  }
}

function getDeviceType() {
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipod|android.*mobile|windows phone/.test(ua)) return "phone";
  if (/ipad|tablet|android(?!.*mobile)/.test(ua)) return "tablet";
  return "desktop";
}

function getBrowserName() {
  const ua = navigator.userAgent;
  if (/CriOS|Chrome/.test(ua) && !/Edg/.test(ua)) return "Chrome";
  if (/Safari/.test(ua) && !/Chrome|CriOS/.test(ua)) return "Safari";
  if (/Firefox/.test(ua)) return "Firefox";
  if (/Edg/.test(ua)) return "Edge";
  return "Browser";
}

function getPlatformName() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return "iOS";
  if (/Android/.test(ua)) return "Android";
  if (/Windows/.test(ua)) return "Windows";
  if (/Macintosh|Mac OS/.test(ua)) return "macOS";
  if (/Linux/.test(ua)) return "Linux";
  return navigator.platform || "Unknown platform";
}

export async function getDeviceInfo() {
  const platform = getPlatformName();
  const deviceType = getDeviceType();
  let fingerprintSource = getDeviceId();
  try {
    fingerprintSource = [
      navigator.userAgent,
      navigator.language,
      navigator.platform,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      screen.width,
      screen.height,
      screen.colorDepth,
      navigator.maxTouchPoints,
    ].join("|");
  } catch (error) {
    bootLog("device fingerprint source fallback", error);
  }

  return {
    deviceId: getDeviceId(),
    deviceName: `${platform} ${getBrowserName()}`,
    deviceType,
    fingerprintHash: await sha256(fingerprintSource),
    platform,
    userAgent: navigator.userAgent,
  };
}

export async function registerDeviceSession() {
  bootLog("manage-device-session register start");
  const device = await withTimeout(getDeviceInfo(), 2500, "device identification");
  const { data, error } = await withTimeout(supabase.functions.invoke("manage-device-session", {
    body: { action: "register", ...device },
  }), 6000, "device session register");
  if (error) throw error;
  bootLog("manage-device-session register end");
  return data;
}

export async function checkDeviceSession() {
  bootLog("manage-device-session check start");
  const { data, error } = await withTimeout(supabase.functions.invoke("manage-device-session", {
    body: { action: "check", deviceId: getDeviceId() },
  }), 5000, "device session check");
  if (error) throw error;
  bootLog("manage-device-session check end", data);
  return data as { valid: boolean; reason?: string };
}

export async function revokeCurrentDeviceSession() {
  const { error } = await withTimeout(supabase.functions.invoke("manage-device-session", {
    body: { action: "revoke-current", deviceId: getDeviceId() },
  }), 5000, "device session revoke");
  if (error) throw error;
}

export async function listDeviceSessions() {
  const { data, error } = await withTimeout(supabase.functions.invoke("manage-device-session", {
    body: { action: "list" },
  }), 6000, "device session list");
  if (error) throw error;
  return (data?.sessions || []) as DeviceSession[];
}
