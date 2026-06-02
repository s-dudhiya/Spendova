import assert from "node:assert/strict";
import { getFriendlyErrorMessage, getFriendlyErrorTitle } from "../src/lib/friendly-error.ts";

const cases = [
  {
    name: "duplicate signup edge function response",
    error: { message: "Edge Function returned a non-2xx status code", context: { status: 409 } },
    context: "signup",
    expected: "An account with this email already exists. Please sign in instead.",
  },
  {
    name: "invalid login credentials",
    error: { message: "Invalid login credentials" },
    context: "auth",
    expected: "Invalid email or password.",
  },
  {
    name: "invalid email",
    error: "invalid email",
    context: "signup",
    expected: "Please enter a valid email address.",
  },
  {
    name: "weak password",
    error: "Password should be at least 6 characters",
    context: "signup",
    expected: "Password is too weak. Please use a stronger password.",
  },
  {
    name: "password mismatch",
    error: "passwords do not match",
    context: "signup",
    expected: "Passwords do not match.",
  },
  {
    name: "email not confirmed",
    error: { message: "Email not confirmed" },
    context: "auth",
    expected: "Please verify your email before signing in.",
  },
  {
    name: "rate limit",
    error: { message: "over email send rate limit", status: 429 },
    context: "otp_resend",
    expected: "Too many attempts. Please wait a moment and try again.",
  },
  {
    name: "invalid otp",
    error: { message: "Invalid verification code." },
    context: "otp",
    expected: "Invalid code. Please check the 6-digit code and try again.",
  },
  {
    name: "network failure",
    error: { message: "Failed to fetch" },
    context: "network",
    expected: "Network issue. Please check your connection and try again.",
  },
  {
    name: "RLS failure",
    error: { message: "new row violates row-level security policy" },
    context: "expense",
    expected: "We could not save this change. Please check the details and try again.",
  },
  {
    name: "device timeout is not reported as network failure",
    error: { message: "The operation either timed out or was not allowed." },
    context: "device",
    expected: "Device verification was cancelled or timed out. Please try again.",
  },
  {
    name: "expired session",
    error: { message: "Invalid JWT: JWT expired", status: 401 },
    context: "profile",
    expected: "Your session has expired. Please sign in again.",
  },
  {
    name: "missing invite",
    error: { message: "Invite not found", status: 404 },
    context: "invite",
    expected: "This invite is unavailable or has expired.",
  },
  {
    name: "upload too large",
    error: { message: "Payload too large", status: 413 },
    context: "admin",
    expected: "This file is too large to upload. Please choose a smaller file.",
  },
  {
    name: "validation failure",
    error: { message: "Validation failed", status: 422 },
    context: "profile",
    expected: "Some details are invalid. Please review them and try again.",
  },
  {
    name: "server unavailable",
    error: { message: "Internal Server Error", status: 500 },
    context: "expense",
    expected: "The service is temporarily unavailable. Please try again shortly.",
  },
  {
    name: "admin email configuration",
    error: { message: "Missing SMTP credentials", status: 500 },
    context: "admin",
    expected: "Email service is not configured. Please add the SMTP credentials and try again.",
  },
];

for (const item of cases) {
  assert.equal(getFriendlyErrorMessage(item.error, item.context), item.expected, item.name);
}

assert.equal(
  getFriendlyErrorTitle({ message: "Edge Function returned a non-2xx status code", context: { status: 409 } }, "signup"),
  "Account already exists",
);

console.log(`ok - ${cases.length} friendly error mappings`);
