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
];

for (const item of cases) {
  assert.equal(getFriendlyErrorMessage(item.error, item.context), item.expected, item.name);
}

assert.equal(
  getFriendlyErrorTitle({ message: "Edge Function returned a non-2xx status code", context: { status: 409 } }, "signup"),
  "Account already exists",
);

console.log(`ok - ${cases.length} friendly error mappings`);
