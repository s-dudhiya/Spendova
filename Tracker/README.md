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
  - `public.profiles`: Stores public user data (name, avatar, username).
  - `public.device_sessions`: Tracks logged-in devices.
- **Edge Functions**: 
  - `send-auth-otp`, `verify-auth-otp`, `reset-password-with-otp`
  - `manage-device-session`, `delete-account`

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
- **Frontend Files**: `src/lib/notifications.ts`, `public/firebase-messaging-sw.js`
- **Database Tables**:
  - `user_push_tokens`: Stores the secret Firebase/Capacitor device tokens for each user.
  - `notifications`: Stores the actual in-app notifications (powers the bell icon).
- **Edge Functions**:
  - `send-push-notification`: **CRITICAL FUNCTION**. This function is automatically triggered by a Supabase **Database Webhook** every time a new row is inserted into the `notifications` table. It grabs the user's token from `user_push_tokens` and sends the push via Firebase.
  - `send-ledger-notification`: Triggered when an expense is added or paid in a Ledger to notify the Budget Admin or the submitting user.
  - *(Note: `send-shared-notification` and `send-expense-notification` exist but have had their email logic disabled to prevent spam. They only exist to insert rows into the `notifications` table).*

### 5. Admin & Background Tasks
- **Frontend Files**: `src/pages/Admin.tsx`
- **Database Tables**: `site_settings`, `feedback_tickets`
- **Edge Functions / Cron Jobs**: 
  - `generate-monthly-reports` (Triggered automatically by `pg_cron` in the database).
  - `cron-ledger-reminders` (Triggered daily at 10 PM IST by `pg_cron` to remind Budget Admins of unpaid ledger expenses).
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
