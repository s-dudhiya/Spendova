import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/202606010001_group_share_invite_links.sql", import.meta.url), "utf8");
const inviteFunction = readFileSync(new URL("../supabase/functions/send-invite/index.ts", import.meta.url), "utf8");
const inviteUi = readFileSync(new URL("../src/pages/Index.tsx", import.meta.url), "utf8");
const inviteAccept = readFileSync(new URL("../src/pages/InviteAccept.tsx", import.meta.url), "utf8");

const checks = [
  ["share links expire after one day", migration, /now\(\) \+ interval '1 day'/],
  ["share links require an authenticated app user", migration, /IF v_auth IS NULL THEN[\s\S]*Authentication required/],
  ["only group members can generate share links", migration, /Only group members can generate invite links/],
  ["share links remain reusable until expiry", migration, /IF v_invite\.invite_type = 'email' THEN[\s\S]*UPDATE public\.group_invites[\s\S]*SET status = 'accepted'/],
  ["email invites remain recipient-bound", migration, /lower\(v_auth_email\) <> lower\(v_invite\.email\)/],
  ["shared links do not silently create friendships", migration, /IF v_invite\.invite_type = 'email'[\s\S]*INSERT INTO public\.connections/],
  ["email invites expire after one day", inviteFunction, /Date\.now\(\) \+ 24 \* 60 \* 60 \* 1000/],
  ["invite email explains one-day expiry", inviteFunction, /invitation is valid for 1 day/],
  ["invite UI generates links through the backend", inviteUi, /generate_group_invite_link/],
  ["invite UI has a clipboard fallback", inviteUi, /document\.execCommand\("copy"\)/],
  ["invite acceptance preserves the token through registration", inviteAccept, /pending_invite_token/],
  ["invite acceptance calls the authenticated join RPC", inviteAccept, /accept_group_invite/],
];

for (const [name, source, pattern] of checks) {
  assert.match(source, pattern, name);
  console.log(`ok - ${name}`);
}
