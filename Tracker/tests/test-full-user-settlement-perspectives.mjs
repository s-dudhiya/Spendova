import assert from "node:assert/strict";
import { buildDebtBalances, aggregateDebtsByUser } from "../src/lib/debt-simplification.ts";

console.log("=== Comprehensive Multi-User Settlement Perspectives Test ===");

// Exact Tiffin Scenario (Group: "tiffin"):
// Abbas pays 11.46 for Shabbir
// Mustafa pays 56.41 for Shabbir
// Abbas pays 56.41 for Mustafa
// Abbas pays 22.09 for Qaid
// PLUS Shabbir's other balances (Flat group and Personal splits):
// Flat group: Mustafa owes Shabbir 33.20
// Personal split: Mustafa owes Shabbir 40.00
const expenses = [
  // Tiffin group
  {
    id: "exp-tiffin-1",
    paid_by: "abbas",
    amount: 11.46,
    group_id: "tiffin",
    payer_profile: { user_id: "abbas", full_name: "Abbas Limdi" },
    expense_splits: [
      { id: "s-t1", user_id: "shabbir", amount_owed: 11.46, amount_paid: 0, has_paid: false, profiles: { user_id: "shabbir", full_name: "Shabbir" } },
    ],
  },
  {
    id: "exp-tiffin-2",
    paid_by: "mustafa",
    amount: 56.41,
    group_id: "tiffin",
    payer_profile: { user_id: "mustafa", full_name: "Mustafa Chati" },
    expense_splits: [
      { id: "s-t2", user_id: "shabbir", amount_owed: 56.41, amount_paid: 0, has_paid: false, profiles: { user_id: "shabbir", full_name: "Shabbir" } },
    ],
  },
  {
    id: "exp-tiffin-3",
    paid_by: "abbas",
    amount: 56.41,
    group_id: "tiffin",
    payer_profile: { user_id: "mustafa", full_name: "Abbas Limdi" },
    expense_splits: [
      { id: "s-t3", user_id: "mustafa", amount_owed: 56.41, amount_paid: 0, has_paid: false, profiles: { user_id: "mustafa", full_name: "Mustafa Chati" } },
    ],
  },
  {
    id: "exp-tiffin-4",
    paid_by: "abbas",
    amount: 22.09,
    group_id: "tiffin",
    payer_profile: { user_id: "abbas", full_name: "Abbas Limdi" },
    expense_splits: [
      { id: "s-t4", user_id: "qaid", amount_owed: 22.09, amount_paid: 0, has_paid: false, profiles: { user_id: "qaid", full_name: "Qaid Johar" } },
    ],
  },
  // Flat group: Mustafa owes Shabbir 33.20
  {
    id: "exp-flat-1",
    paid_by: "shabbir",
    amount: 33.20,
    group_id: "flat",
    payer_profile: { user_id: "shabbir", full_name: "Shabbir" },
    expense_splits: [
      { id: "s-f1", user_id: "mustafa", amount_owed: 33.20, amount_paid: 0, has_paid: false, profiles: { user_id: "mustafa", full_name: "Mustafa Chati" } },
    ],
  },
  // Personal split: Mustafa owes Shabbir 40.00
  {
    id: "exp-pers-1",
    paid_by: "shabbir",
    amount: 40.00,
    group_id: null,
    payer_profile: { user_id: "shabbir", full_name: "Shabbir" },
    expense_splits: [
      { id: "s-p1", user_id: "mustafa", amount_owed: 40.00, amount_paid: 0, has_paid: false, profiles: { user_id: "mustafa", full_name: "Mustafa Chati" } },
    ],
  },
];

const groupMap = {
  tiffin: true, // Simplify ON
  flat: false,   // Simplify OFF
};

function getBalancesForAllUsers(expenseList, settlements = []) {
  const allDebts = buildDebtBalances(expenseList, settlements, {
    groupSimplifyMap: groupMap,
  });

  const users = ["shabbir", "abbas", "mustafa", "qaid"];
  const perspectives = {};

  for (const u of users) {
    const agg = aggregateDebtsByUser(allDebts, u);
    perspectives[u] = {
      youOwe: agg.youOweRows,
      youGet: agg.youGetRows,
      totalOwed: agg.totalOwed,
      totalLent: agg.totalLent,
      net: agg.net,
    };
  }
  return perspectives;
}

console.log("\n=================== 1. BEFORE SETTLEMENT ===================");
const before = getBalancesForAllUsers(expenses);
console.log("Shabbir:", JSON.stringify(before.shabbir, null, 2));
console.log("Abbas Limdi:", JSON.stringify(before.abbas, null, 2));
console.log("Mustafa Chati:", JSON.stringify(before.mustafa, null, 2));
console.log("Qaid Johar:", JSON.stringify(before.qaid, null, 2));

// Check expectations BEFORE settlement:
// Shabbir owes Abbas 67.87 (Tiffin)
assert.equal(before.shabbir.totalOwed, 67.87);
assert.equal(before.shabbir.youOwe.length, 1);
assert.equal(before.shabbir.youOwe[0].settleId, "abbas");
assert.equal(before.shabbir.youOwe[0].amount, 67.87);

// Shabbir gets 73.20 from Mustafa (33.20 Flat + 40 Personal)
assert.equal(before.shabbir.totalLent, 73.20);
assert.equal(before.shabbir.youGet.length, 1);
assert.equal(before.shabbir.youGet[0].settleId, "mustafa");
assert.equal(before.shabbir.youGet[0].amount, 73.20);

// Abbas is owed 89.96 (67.87 from Shabbir + 22.09 from Qaid)
assert.equal(before.abbas.totalLent, 89.96);
assert.equal(before.abbas.totalOwed, 0);

// Mustafa owes Shabbir 73.20 (Flat + Personal) and net 0 in Tiffin
assert.equal(before.mustafa.totalOwed, 73.20);
assert.equal(before.mustafa.totalLent, 0);

// Qaid owes Abbas 22.09
assert.equal(before.qaid.totalOwed, 22.09);
assert.equal(before.qaid.totalLent, 0);

console.log("\n=================== 2. SHABBIR SETTLES 67.87 WITH ABBAS ===================");
// Settlement is recorded:
const settlements = [
  { id: "settle-1", from_user_id: "shabbir", to_user_id: "abbas", amount: 67.87, group_id: "tiffin" }
];

// In database:
// 1. Direct split to Abbas cleared:
expenses[0].expense_splits[0].amount_paid = 11.46;
expenses[0].expense_splits[0].has_paid = true;

// 2. Transitive split from Shabbir on Mustafa's expense cleared:
expenses[1].expense_splits[0].amount_paid = 56.41;
expenses[1].expense_splits[0].has_paid = true;

// 3. Mustafa's debt to Abbas cleared:
expenses[2].expense_splits[0].amount_paid = 56.41;
expenses[2].expense_splits[0].has_paid = true;

const after = getBalancesForAllUsers(expenses, settlements);
console.log("Shabbir AFTER:", JSON.stringify(after.shabbir, null, 2));
console.log("Abbas Limdi AFTER:", JSON.stringify(after.abbas, null, 2));
console.log("Mustafa Chati AFTER:", JSON.stringify(after.mustafa, null, 2));
console.log("Qaid Johar AFTER:", JSON.stringify(after.qaid, null, 2));

// Test Case 1: Does Shabbir owe anyone anything in Tiffin?
assert.equal(after.shabbir.totalOwed, 0, "Shabbir total owed must be exactly 0!");
assert.equal(after.shabbir.youOwe.length, 0, "Shabbir 'You Owe' must be empty!");

// Test Case 2: Does Shabbir still get his money from Mustafa (Flat + Personal = 73.20)?
assert.equal(after.shabbir.totalLent, 73.20, "Shabbir still gets 73.20 from Mustafa!");
assert.equal(after.shabbir.youGet.length, 1);
assert.equal(after.shabbir.youGet[0].settleId, "mustafa");
assert.equal(after.shabbir.youGet[0].amount, 73.20);

// Test Case 3: Does Abbas or Mustafa show up in Shabbir's 'You Get' as phantom credit?
const phantomGet = after.shabbir.youGet.find(r => r.settleId === "abbas");
assert.equal(phantomGet, undefined, "Abbas must NOT appear in Shabbir's 'You Get'!");

// Test Case 4: In Abbas Limdi's view:
// Does Shabbir show up in Abbas's 'You Get'?
const abbasGetShabbir = after.abbas.youGet.find(r => r.settleId === "shabbir");
assert.equal(abbasGetShabbir, undefined, "Shabbir must NOT appear in Abbas's 'You Get'!");
// Does Shabbir show up in Abbas's 'You Owe'?
const abbasOweShabbir = after.abbas.youOwe.find(r => r.settleId === "shabbir");
assert.equal(abbasOweShabbir, undefined, "Shabbir must NOT appear in Abbas's 'You Owe'!");
// Abbas only gets 22.09 from Qaid Johar:
assert.equal(after.abbas.totalLent, 22.09, "Abbas total lent must be 22.09!");
assert.equal(after.abbas.youGet.length, 1);
assert.equal(after.abbas.youGet[0].settleId, "qaid");
assert.equal(after.abbas.youGet[0].amount, 22.09);
assert.equal(after.abbas.totalOwed, 0, "Abbas owes nothing!");

// Test Case 5: In Mustafa Chati's view:
// Does Shabbir show up in Mustafa's 'You Owe' or 'You Get'?
// Mustafa owes Shabbir 73.20 for Flat + Personal:
assert.equal(after.mustafa.totalOwed, 73.20, "Mustafa owes Shabbir 73.20 for Flat + Personal!");
assert.equal(after.mustafa.youOwe.length, 1);
assert.equal(after.mustafa.youOwe[0].settleId, "shabbir");
assert.equal(after.mustafa.youOwe[0].amount, 73.20);
// In Tiffin, Mustafa owes 0 and gets 0:
assert.equal(after.mustafa.totalLent, 0, "Mustafa total lent is 0 in Tiffin!");

// Test Case 6: In Qaid Johar's view:
// Qaid still owes Abbas 22.09:
assert.equal(after.qaid.totalOwed, 22.09, "Qaid still owes Abbas 22.09!");
assert.equal(after.qaid.youOwe.length, 1);
assert.equal(after.qaid.youOwe[0].settleId, "abbas");
assert.equal(after.qaid.youOwe[0].amount, 22.09);
// Does Qaid owe Shabbir? NO!
const qaidOweShabbir = after.qaid.youOwe.find(r => r.settleId === "shabbir");
assert.equal(qaidOweShabbir, undefined, "Qaid must NOT owe Shabbir!");

console.log("\n=================== 3. VERIFYING IF SOMEONE TURNS SIMPLIFY OFF ===================");
// If a user (e.g. Abbas or Mustafa or Shabbir) turns Simplify OFF for Tiffin:
groupMap.tiffin = false;
const afterSimplifyOff = getBalancesForAllUsers(expenses, settlements);
console.log("Shabbir with Simplify OFF:", JSON.stringify(afterSimplifyOff.shabbir, null, 2));
console.log("Abbas with Simplify OFF:", JSON.stringify(afterSimplifyOff.abbas, null, 2));

// Test Case 7: With Simplify OFF:
// Shabbir still owes 0!
assert.equal(afterSimplifyOff.shabbir.totalOwed, 0, "Shabbir still owes 0 with Simplify OFF!");
// Shabbir still gets 73.20 from Mustafa!
assert.equal(afterSimplifyOff.shabbir.totalLent, 73.20, "Shabbir still gets 73.20 with Simplify OFF!");
// Abbas still gets 22.09 from Qaid!
assert.equal(afterSimplifyOff.abbas.totalLent, 22.09, "Abbas still gets 22.09 with Simplify OFF!");
assert.equal(afterSimplifyOff.abbas.totalOwed, 0, "Abbas still owes 0 with Simplify OFF!");

console.log("\n🎉 ALL MULTI-USER PERSPECTIVE TEST CASES PASSED WITH 100% ZERO ERRORS!");
