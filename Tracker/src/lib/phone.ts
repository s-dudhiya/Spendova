/**
 * Phone number normalization, formatting, and WhatsApp link helpers.
 */

export function normalizePhone(raw: string, defaultCountryCode = "+91"): string | null {
  const trimmed = String(raw || "")
    .replace(/[\u200B-\u200F\u202A-\u202E\uFEFF\u00A0]/g, "")
    .trim();
  if (!trimmed) return null;

  const hasPlus = trimmed.startsWith("+");
  let digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  if (hasPlus) {
    if (digits.length < 10 || digits.length > 15) return null;
    return `+${digits}`;
  }

  if (digits.startsWith("00")) {
    digits = digits.slice(2);
    if (digits.length < 10 || digits.length > 15) return null;
    return `+${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("0")) {
    digits = digits.slice(1);
  }

  if (digits.length === 10) {
    return `${defaultCountryCode}${digits}`;
  }

  if (digits.length === 12 && digits.startsWith("91")) {
    return `+${digits}`;
  }

  if (digits.length >= 10 && digits.length <= 15) {
    return `+${digits}`;
  }

  return null;
}

export function formatPhoneDisplay(phone?: string | null): string {
  if (!phone) return "";
  if (phone.startsWith("+91") && phone.length === 13) {
    return `+91 ${phone.slice(3, 8)} ${phone.slice(8)}`;
  }
  return phone;
}

export function buildWhatsAppUrl(phone: string, message: string): string {
  const digits = String(phone || "").replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export const SPENDOVA_WEBSITE_URL = "https://spendova.vercel.app";
