import { supabase } from "@/integrations/supabase/client";

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
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = randomId();
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}

async function sha256(value: string) {
  if (!crypto?.subtle) return btoa(value).slice(0, 64);
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
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
  const fingerprintSource = [
    navigator.userAgent,
    navigator.language,
    navigator.platform,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    screen.width,
    screen.height,
    screen.colorDepth,
    navigator.maxTouchPoints,
  ].join("|");

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
  const device = await getDeviceInfo();
  const { data, error } = await supabase.functions.invoke("manage-device-session", {
    body: { action: "register", ...device },
  });
  if (error) throw error;
  return data;
}

export async function checkDeviceSession() {
  const { data, error } = await supabase.functions.invoke("manage-device-session", {
    body: { action: "check", deviceId: getDeviceId() },
  });
  if (error) throw error;
  return data as { valid: boolean; reason?: string };
}

export async function revokeCurrentDeviceSession() {
  const { error } = await supabase.functions.invoke("manage-device-session", {
    body: { action: "revoke-current", deviceId: getDeviceId() },
  });
  if (error) throw error;
}

export async function listDeviceSessions() {
  const { data, error } = await supabase.functions.invoke("manage-device-session", {
    body: { action: "list" },
  });
  if (error) throw error;
  return (data?.sessions || []) as DeviceSession[];
}
