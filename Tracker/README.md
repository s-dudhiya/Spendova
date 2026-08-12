# Spendova (ExpenseMate) - Developer Documentation

Welcome to the Developer Documentation for **Spendova**. This document is designed to help you understand the architecture, database tables, edge functions, and folder structure of the app so you can debug and expand features easily.

---

## 🏗️ Tech Stack
- **Frontend**: React (Vite) + Tailwind CSS + Capacitor (for Native Android/iOS builds)
- **Backend**: Supabase (PostgreSQL, Auth, Edge Functions, Database Webhooks)
- **Push Notifications**: Firebase Cloud Messaging (FCM) + Capacitor Push Notifications

---

## 📁 Folder Structure

### 1. Frontend (`/src` & `/public`)
The frontend is a React Single Page Application (SPA) located primarily in the `src/` directory.

- **`public/`**: Contains static assets like images, `manifest.json`, and importantly, `firebase-messaging-sw.js` which handles background push notifications on the web.
- **`scripts/`**: Node.js utility scripts for database maintenance outside the main app (e.g., `cleanup-fake-users.mjs`).
- **`src/components/`**: Reusable UI elements (buttons, modals, forms).
- **`src/hooks/`**: Custom React hooks. `useAuth.tsx` is the most critical one, handling session state.
- **`src/lib/`**: Core utilities. 
  - `notifications.ts`: The brains of the Push Notification system (handles both Web FCM and Capacitor Native permissions).
- **`src/pages/`**: The main screens of the app.
  - `Auth.tsx`: Login / Signup / Forgot Password.
  - `VerifyOtp.tsx`: Universally handles 6-digit OTP verification for both account creation and password resets.
  - `Index.tsx`: The main Split Dashboard (Friends & Groups).
  - `Ledger/`: Folder containing all code for the Budgeting/Ledger feature.
  - `Admin.tsx`: The Admin dashboard for managing the site.

### 2. Backend (`/supabase`)
- **`supabase/migrations/`**: Contains all the SQL files that define your database tables, RLS policies, and cron jobs.
- **`supabase/functions/`**: Contains all the Deno Edge Functions.

---

## 🚀 Core Features & Architecture

Below is a breakdown of every major feature, where the code lives, which tables it uses, and which Edge Functions it relies on.

### 1. Authentication & User Management
Handles logging in, signing up, OTPs, and device sessions.
- **Frontend Files**: `src/pages/Auth.tsx`, `src/pages/VerifyOtp.tsx`, `src/pages/Profile.tsx`
- **Database Tables**:
  - `auth.users`: Core Supabase auth table.
  - `public.profiles`: Stores public user data (name, avatar, username, email_verified).
  - `public.device_sessions`: Tracks logged-in devices.
  - `public.auth_device_sessions`: (Key Table) Strictly tracks active devices to enforce the Single Device Policy.
  - `public.email_domains`: Caches domain validation results (fake vs real) to save Gemini API calls.
- **Edge Functions**: 
  - `send-auth-otp`, `verify-auth-otp`, `reset-password-with-otp`: A custom Resend-based pipeline that bypasses Supabase's native OTP rate limits for a seamless Email Login and Verification experience.
  - `manage-device-session`, `delete-account`

**Architecture Note - Single Device Policy:**
Spendova strictly enforces that a user can only be active on one device at a time. This is achieved via a robust combination of:
1. **Database Tracking**: The `auth_device_sessions` table and `manage-device-session` edge function coordinate to mark only the latest device as active.
2. **Realtime Broadcasts**: `useAuth.tsx` utilizes Supabase Realtime (`device-sync-uid` channel) to instantly broadcast a "sync_check" signal when a new login occurs, forcing all other active browser tabs to log out instantly.
3. **Polling Fallback**: A 60-second polling interval ensures devices that miss the broadcast are eventually logged out.

### 2. Friends & Group Splitting (Splitwise-style)
Allows users to split expenses with friends or within groups.
- **Frontend Files**: `src/pages/Index.tsx` (Main Dashboard), `src/pages/Group/`
- **Database Tables**:
  - `groups`: The groups users create.
  - `group_members`: Maps users to groups.
  - `expenses`: The core expense record. For group expenses, `group_id` is populated. For "Friends splits", `group_id` is null.
  - `expense_splits`: Calculates exactly who owes what for a specific expense.
  - `settlements`: Records when users pay each other back.
- **Edge Functions**:
  - `send-invite`: Sends an email invite to join a group.

### 3. Ledgers (Budgeting)
A separate feature for tracking shared budgets (like a household ledger).
- **Frontend Files**: `src/pages/Ledger/`
- **Database Tables**:
  - `ledgers`: The main ledger record.
  - `ledger_members`: Maps users to the ledger.
  - `expenses`: Ledger expenses will have `ledger_id` populated.
- **Edge Functions**:
  - `send-ledger-invite`: Invites a user via email to a ledger.
  - `send-ledger-export`: Exports the ledger data as a PDF/CSV via email.

### 4. Push Notifications & Alerts
A unified system for sending native push notifications to Web and Android.
- **Frontend Files**: `src/lib/notifications.ts`, `public/firebase-messaging-sw.js`, `src/pages/Index.tsx` (contains Profile view manual Push Notification toggle button).
- **Database Tables**:
  - `user_push_tokens`: Stores secret Firebase/Capacitor device tokens for each user.
  - `notifications`: Stores in-app notifications (powers the bell icon).
- **Edge Functions**:
  - `send-push-notification`: **CRITICAL FUNCTION**. Triggered automatically by a Supabase Database Webhook whenever a new row is inserted into `notifications`. It grabs the user's token from `user_push_tokens` and sends the push notification via Firebase.
  - `send-ledger-notification`: Triggered when an expense is added or paid in a Ledger:
    - **Expense Added**: Notifies **all members** of the ledger (excluding the payer).
    - **Marked Paid**: Notifies **only the payer**.
    - **Reminders**: Sent only to the **Budget Admin**.

### 5. Admin & Background Tasks
- **Frontend Files**: `src/pages/Admin.tsx`
- **Database Tables**: `site_settings`, `feedback_tickets`
- **Edge Functions / Cron Jobs**: 
  - `generate-monthly-reports` (Triggered automatically by `pg_cron` in the database).
  - `cleanup_unverified_users`: Triggered hourly via `pg_cron` to instantly delete any users who haven't verified their email within 24 hours.
  - `cron-ledger-reminders`: Triggered daily at **10:00 PM IST** (`30 16 * * *` UTC) via `pg_cron` (Migration `20260806100000_fix_ledger_reminders_cron.sql`) using hardcoded project credentials to notify Budget Admins of pending ledger expenses.
  - `feedback-ticket-email`, `send-admin-mail`, `toggle-maintenance`.

---

## 🛠️ How to Debug Common Issues

**1. A user isn't receiving push notifications!**
- Check the `user_push_tokens` table. Does their `user_id` have a token listed? If not, their device didn't grant permissions.
- Check the `notifications` table. Was a notification row actually created for them?
- Check the Supabase Edge Function logs for `send-push-notification`. It will tell you exactly if the Firebase request succeeded or failed.

**2. OTP UI looks weird on mobile!**
- The OTP boxes are built in `src/pages/VerifyOtp.tsx`. They use `flex-1` and `aspect-square` with `max-w-[3.5rem]` to automatically stretch and fit perfectly on all screen sizes.

**3. Emails are sending twice!**
- Remember that Push Notifications are your primary method now. If users start getting emails again, check `send-shared-notification` and `send-expense-notification` to ensure the `nodemailer` SMTP logic is still wrapped in `/* comments */`.

---
*Generated for Spendova. Keep this document updated as new features are added!*
