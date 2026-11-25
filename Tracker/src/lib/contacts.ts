import { Capacitor } from "@capacitor/core";
import { Contacts } from "@capacitor-community/contacts";
import { supabase } from "@/integrations/supabase/client";
import { normalizePhone } from "@/lib/phone";

export type MatchedSpendovaContact = {
  userId: string;
  fullName: string | null;
  username: string | null;
  phone: string;
  contactName: string;
  isSelf?: boolean;
};

export type UnmatchedPhoneContact = {
  contactName: string;
  phone: string;
};

export async function requestContactsPermissionOnBoot(userId: string): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const perm = await Contacts.checkPermissions();
    if (perm.contacts === "granted") return true;

    const promptedKey = `spendova_contacts_prompted_${userId}`;
    if (typeof localStorage !== "undefined" && localStorage.getItem(promptedKey) === "true") {
      return false;
    }
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(promptedKey, "true");
    }

    const req = await Contacts.requestPermissions();
    return req.contacts === "granted";
  } catch (err) {
    console.warn("Contacts permission request failed:", err);
    return false;
  }
}

export async function syncAndMatchContacts(): Promise<{
  supported: boolean;
  permissionDenied?: boolean;
  matched: MatchedSpendovaContact[];
  unmatched: UnmatchedPhoneContact[];
}> {
  if (!Capacitor.isNativePlatform()) {
    return { supported: false, matched: [], unmatched: [] };
  }

  let perm = await Contacts.checkPermissions();
  if (perm.contacts !== "granted") {
    perm = await Contacts.requestPermissions();
  }
  if (perm.contacts !== "granted") {
    return { supported: true, permissionDenied: true, matched: [], unmatched: [] };
  }

  const result = await Contacts.getContacts({
    projection: {
      name: true,
      phones: true,
    },
  });

  const phoneToContactName = new Map<string, string>();
  for (const contact of result.contacts || []) {
    const displayName =
      contact.name?.display ||
      [contact.name?.given, contact.name?.family].filter(Boolean).join(" ").trim() ||
      "";
    if (!displayName) continue;

    for (const p of contact.phones || []) {
      const normalized = normalizePhone(p.number || "");
      if (normalized && !phoneToContactName.has(normalized)) {
        phoneToContactName.set(normalized, displayName);
      }
    }
  }

  const allPhones = Array.from(phoneToContactName.keys());
  if (allPhones.length === 0) {
    return { supported: true, matched: [], unmatched: [] };
  }

  const matchedMap = new Map<string, MatchedSpendovaContact>();
  const matchedPhones = new Set<string>();

  // Query in chunks of 500 to keep RPC payloads light
  for (let i = 0; i < allPhones.length; i += 500) {
    const chunk = allPhones.slice(i, i + 500);
    const { data, error } = await (supabase.rpc as any)("match_spendova_contacts", {
      phone_numbers: chunk,
    });
    if (error) throw error;
    for (const row of data || []) {
      if (row.phone) matchedPhones.add(row.phone);
      if (row.user_id && !matchedMap.has(row.user_id)) {
        matchedMap.set(row.user_id, {
          userId: row.user_id,
          fullName: row.full_name,
          username: row.username,
          phone: row.phone,
          contactName: phoneToContactName.get(row.phone) || row.full_name || row.username || "Spendova User",
        });
      }
    }
  }

  const { data: authData } = await supabase.auth.getUser();
  const currentUserId = authData?.user?.id;
  if (currentUserId) {
    const { data: myProfile } = await supabase
      .from("profiles")
      .select("user_id, full_name, username, phone")
      .eq("user_id", currentUserId)
      .maybeSingle();
    const myNormalized = normalizePhone(myProfile?.phone || "");
    if (myNormalized && phoneToContactName.has(myNormalized)) {
      matchedPhones.add(myNormalized);
      matchedMap.set(currentUserId, {
        userId: currentUserId,
        fullName: myProfile?.full_name || null,
        username: myProfile?.username || null,
        phone: myNormalized,
        contactName: phoneToContactName.get(myNormalized) || myProfile?.full_name || "You",
        isSelf: true,
      });
    }
  }

  const unmatched: UnmatchedPhoneContact[] = [];
  for (const [phone, contactName] of phoneToContactName.entries()) {
    if (!matchedPhones.has(phone)) {
      unmatched.push({ contactName, phone });
    }
  }
  unmatched.sort((a, b) => a.contactName.localeCompare(b.contactName));

  const matched = Array.from(matchedMap.values()).sort((a, b) =>
    a.contactName.localeCompare(b.contactName)
  );

  return { supported: true, matched, unmatched };
}
