import assert from "node:assert/strict";
import { simplifyGroupDebts, buildDebtBalances, aggregateDebtsByUser } from "../src/lib/debt-simplification.ts";

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const cents = (amount) => Math.round(Number(amount || 0) * 100);
const money = (amount) => cents(amount) / 100;

function computeNetMap(balances) {
  const map = new Map();
  for (const b of balances) {
    map.set(b.fromUserId, money((map.get(b.fromUserId) || 0) - b.amount));
    map.set(b.toUserId, money((map.get(b.toUserId) || 0) + b.amount));
  }
  return map;
}

test("returns original balances when enabled is false", () => {
  const original = [
    { fromUserId: "u1", toUserId: "u2", fromName: "Alice", toName: "Bob", amount: 20 },
    { fromUserId: "u2", toUserId: "u3", fromName: "Bob", toName: "Charlie", amount: 20 },
  ];
  const result = simplifyGroupDebts(original, false);
  assert.deepEqual(result, original);
});

test("returns single balance unchanged even when enabled is true", () => {
  const original = [
    { fromUserId: "u1", toUserId: "u2", fromName: "Alice", toName: "Bob", amount: 50 },
  ];
  const result = simplifyGroupDebts(original, true);
  assert.deepEqual(result, original);
});

test("simplifies 3-person chain (A owes B, B owes C -> A owes C directly)", () => {
  const chain = [
    { fromUserId: "uA", toUserId: "uB", fromName: "Alice", toName: "Bob", amount: 25 },
    { fromUserId: "uB", toUserId: "uC", fromName: "Bob", toName: "Charlie", amount: 25 },
  ];

  const simplified = simplifyGroupDebts(chain, true);

  // B is eliminated (net = 0), Alice pays Charlie directly
  assert.equal(simplified.length, 1);
  assert.equal(simplified[0].fromUserId, "uA");
  assert.equal(simplified[0].toUserId, "uC");
  assert.equal(simplified[0].amount, 25);
  assert.equal(simplified[0].fromName, "Alice");
  assert.equal(simplified[0].toName, "Charlie");
});

test("completely cancels out circular debts (A -> B -> C -> A)", () => {
  const circular = [
    { fromUserId: "uA", toUserId: "uB", fromName: "Alice", toName: "Bob", amount: 30 },
    { fromUserId: "uB", toUserId: "uC", fromName: "Bob", toName: "Charlie", amount: 30 },
  ];
  circular.push({ fromUserId: "uC", toUserId: "uA", fromName: "Charlie", toName: "Alice", amount: 30 });

  const simplified = simplifyGroupDebts(circular, true);
  assert.equal(simplified.length, 0, "All circular debts must cancel out to 0 transactions");
});

test("simplifies asymmetrical 3-way circular debt without altering net positions", () => {
  const debts = [
    { fromUserId: "uA", toUserId: "uB", fromName: "Alice", toName: "Bob", amount: 50 },
    { fromUserId: "uB", toUserId: "uC", fromName: "Bob", toName: "Charlie", amount: 30 },
    { fromUserId: "uC", toUserId: "uA", fromName: "Charlie", toName: "Alice", amount: 10 },
  ];

  const simplified = simplifyGroupDebts(debts, true);
  assert.equal(simplified.length, 2);

  const netBefore = computeNetMap(debts);
  const netAfter = computeNetMap(simplified);

  for (const [userId, net] of netBefore.entries()) {
    assert.equal(netAfter.get(userId), net, `User ${userId} net balance must match exactly`);
  }
});

test("guarantees net balance invariance across 4-person complex group expenses", () => {
  const complex = [
    { fromUserId: "uB", toUserId: "uA", fromName: "Bob", toName: "Alice", amount: 25 },
    { fromUserId: "uC", toUserId: "uA", fromName: "Charlie", toName: "Alice", amount: 25 },
    { fromUserId: "uD", toUserId: "uA", fromName: "David", toName: "Alice", amount: 25 },
    { fromUserId: "uC", toUserId: "uB", fromName: "Charlie", toName: "Bob", amount: 20 },
    { fromUserId: "uA", toUserId: "uD", fromName: "Alice", toName: "David", amount: 5 },
  ];

  const simplified = simplifyGroupDebts(complex, true);
  assert(simplified.length < complex.length, "Transactions must be reduced");

  const netBefore = computeNetMap(complex);
  const netAfter = computeNetMap(simplified);

  for (const [userId, net] of netBefore.entries()) {
    assert.equal(netAfter.get(userId), net, `User ${userId} net must be identical`);
  }
});

test("handles cent rounding properly without losing pennies", () => {
  const splits = [
    { fromUserId: "uB", toUserId: "uA", fromName: "Bob", toName: "Alice", amount: 33.34 },
    { fromUserId: "uC", toUserId: "uA", fromName: "Charlie", toName: "Alice", amount: 33.33 },
    { fromUserId: "uA", toUserId: "uC", fromName: "Alice", toName: "Charlie", amount: 10.00 },
  ];

  const simplified = simplifyGroupDebts(splits, true);
  const netBefore = computeNetMap(splits);
  const netAfter = computeNetMap(simplified);

  for (const [userId, net] of netBefore.entries()) {
    assert.equal(netAfter.get(userId), net, `Precision check for ${userId}`);
  }
});

// Explicit test for the user's scenario
test("USER SCENARIO: 3 people where A pays 300 and B pays 600 (equal split)", () => {
  // Expense 1: A pays 300, split 100 each for A, B, C
  // Expense 2: B pays 600, split 200 each for A, B, C
  const groupExpenses = [
    {
      id: "exp-1",
      paid_by: "user-A",
      amount: 300,
      group_id: "group-123",
      payer_profile: { user_id: "user-A", full_name: "Alice" },
      expense_splits: [
        { user_id: "user-A", amount_owed: 100 },
        { user_id: "user-B", amount_owed: 100, profiles: { user_id: "user-B", full_name: "Bob" } },
        { user_id: "user-C", amount_owed: 100, profiles: { user_id: "user-C", full_name: "Charlie" } },
      ],
    },
    {
      id: "exp-2",
      paid_by: "user-B",
      amount: 600,
      group_id: "group-123",
      payer_profile: { user_id: "user-B", full_name: "Bob" },
      expense_splits: [
        { user_id: "user-A", amount_owed: 200, profiles: { user_id: "user-A", full_name: "Alice" } },
        { user_id: "user-B", amount_owed: 200 },
        { user_id: "user-C", amount_owed: 200, profiles: { user_id: "user-C", full_name: "Charlie" } },
      ],
    },
  ];

  // 1. With simplifyDebts: true
  const simplified = buildDebtBalances(groupExpenses, [], {
    simplifyDebts: true,
  });

  // Exactly 1 simplified transaction: Charlie owes Bob 300!
  assert.equal(simplified.length, 1, "There should be exactly 1 payment required");
  assert.equal(simplified[0].fromUserId, "user-C", "Charlie must be the debtor");
  assert.equal(simplified[0].toUserId, "user-B", "Bob must be the creditor");
  assert.equal(simplified[0].amount, 300, "Charlie must owe directly 300 to Bob");
  assert.equal(simplified[0].fromName, "Charlie");
  assert.equal(simplified[0].toName, "Bob");

  // Alice owes NOTHING and gets NOTHING
  const aliceOwes = simplified.filter((b) => b.fromUserId === "user-A");
  const aliceGets = simplified.filter((b) => b.toUserId === "user-A");
  assert.equal(aliceOwes.length, 0, "Alice must not owe anything");
  assert.equal(aliceGets.length, 0, "Alice must not get anything");

  // 2. With simplifyDebts: false (pairwise)
  const unsimplified = buildDebtBalances(groupExpenses, [], {
    simplifyDebts: false,
  });

  // In unsimplified mode:
  // A owes B 100
  // C owes A 100
  // C owes B 200
  assert.equal(unsimplified.length, 3);
  const cToB = unsimplified.find((b) => b.fromUserId === "user-C" && b.toUserId === "user-B");
  const cToA = unsimplified.find((b) => b.fromUserId === "user-C" && b.toUserId === "user-A");
  const aToB = unsimplified.find((b) => b.fromUserId === "user-A" && b.toUserId === "user-B");
  assert.equal(cToB?.amount, 200);
  assert.equal(cToA?.amount, 100);
  assert.equal(aToB?.amount, 100);

  // In BOTH cases, net balance is 100% invariant:
  // Net A = 0, Net B = +300, Net C = -300
  const netSimplified = computeNetMap(simplified);
  const netUnsimplified = computeNetMap(unsimplified);
  assert.equal(netSimplified.get("user-B"), 300);
  assert.equal(netSimplified.get("user-C"), -300);
  assert.equal(netUnsimplified.get("user-A"), 0);
  assert.equal(netUnsimplified.get("user-B"), 300);
  assert.equal(netUnsimplified.get("user-C"), -300);
});

test("strict isolation: group debts and personal splits do not merge", () => {
  const mixedExpenses = [
    // Group expense: Charlie owes Bob 300 (simplified)
    {
      id: "exp-group",
      paid_by: "user-B",
      amount: 300,
      group_id: "group-1",
      expense_splits: [
        { user_id: "user-B", amount_owed: 0 },
        { user_id: "user-C", amount_owed: 300 },
      ],
    },
    // Personal split: Bob owes Charlie 50
    {
      id: "exp-personal",
      paid_by: "user-C",
      amount: 50,
      group_id: null,
      expense_splits: [
        { user_id: "user-B", amount_owed: 50 },
      ],
    },
  ];

  const balances = buildDebtBalances(mixedExpenses, [], { simplifyDebts: true });

  // Must have 2 separate balances: 1 for group-1 (C owes B 300), 1 for personal (B owes C 50)
  assert.equal(balances.length, 2, "Group and personal must remain isolated");
  const groupDebt = balances.find((b) => b.groupId === "group-1");
  const personalDebt = balances.find((b) => b.groupId === null);

  assert.equal(groupDebt?.fromUserId, "user-C");
  assert.equal(groupDebt?.toUserId, "user-B");
  assert.equal(groupDebt?.amount, 300);

  assert.equal(personalDebt?.fromUserId, "user-B");
  assert.equal(personalDebt?.toUserId, "user-C");
  assert.equal(personalDebt?.amount, 50);
});

test("friendId filter accurately isolates pairwise settlement debts after simplification", () => {
  const groupExpenses = [
    {
      id: "exp-1",
      paid_by: "user-A",
      amount: 300,
      group_id: "group-123",
      expense_splits: [
        { user_id: "user-A", amount_owed: 100 },
        { user_id: "user-B", amount_owed: 100 },
        { user_id: "user-C", amount_owed: 100 },
      ],
    },
    {
      id: "exp-2",
      paid_by: "user-B",
      amount: 600,
      group_id: "group-123",
      expense_splits: [
        { user_id: "user-A", amount_owed: 200 },
        { user_id: "user-B", amount_owed: 200 },
        { user_id: "user-C", amount_owed: 200 },
      ],
    },
  ];

  // User C opening Settle Up with User B:
  const cWithB = buildDebtBalances(groupExpenses, [], {
    currentUserId: "user-C",
    friendId: "user-B",
    groupId: "group-123",
    simplifyDebts: true,
  });
  assert.equal(cWithB.length, 1);
  assert.equal(cWithB[0].fromUserId, "user-C");
  assert.equal(cWithB[0].toUserId, "user-B");
  assert.equal(cWithB[0].amount, 300);

  // User C opening Settle Up with User A:
  const cWithA = buildDebtBalances(groupExpenses, [], {
    currentUserId: "user-C",
    friendId: "user-A",
    groupId: "group-123",
    simplifyDebts: true,
  });
  assert.equal(cWithA.length, 0, "C has 0 simplified debt with A");

  // User A opening Settle Up with User B:
  const aWithB = buildDebtBalances(groupExpenses, [], {
    currentUserId: "user-A",
    friendId: "user-B",
    groupId: "group-123",
    simplifyDebts: true,
  });
  assert.equal(aWithB.length, 0, "A has 0 simplified debt with B");
});

test("aggregateDebtsByUser nets out owe and get for the same user across groups and personal splits", () => {
  const currentUserId = "me";
  const balances = [
    // Mustafa owes me 40 (Personal)
    { fromUserId: "mustafa", toUserId: "me", fromName: "Mustafa", toName: "Me", amount: 40, groupId: null, contextName: "Personal split" },
    // I owe Mustafa 46.66 (Tiffin group)
    { fromUserId: "me", toUserId: "mustafa", fromName: "Me", toName: "Mustafa", amount: 46.66, groupId: "g-tiffin", contextName: "Tiffin" },
    // Moiz owes me 130 (Personal)
    { fromUserId: "moiz", toUserId: "me", fromName: "Moiz", toName: "Me", amount: 130, groupId: null, contextName: "Personal split" },
    // I owe Moiz 10.36 (Tiffin group)
    { fromUserId: "me", toUserId: "moiz", fromName: "Me", toName: "Moiz", amount: 10.36, groupId: "g-tiffin", contextName: "Tiffin" },
    // Qaid owes me 22.20 (Flat group)
    { fromUserId: "qaid", toUserId: "me", fromName: "Qaid", toName: "Me", amount: 22.20, groupId: "g-flat", contextName: "Flat" },
    // I owe Qaid 20.00 (Personal)
    { fromUserId: "me", toUserId: "qaid", fromName: "Me", toName: "Qaid", amount: 20.00, groupId: null, contextName: "Personal split" },
  ];

  const { youOweRows, youGetRows, totalOwed, totalLent, net } = aggregateDebtsByUser(balances, currentUserId);

  // Mustafa: 40 - 46.66 = -6.66 -> ONLY in youOweRows
  assert.equal(youOweRows.length, 1);
  assert.equal(youOweRows[0].settleId, "mustafa");
  assert.equal(youOweRows[0].amount, 6.66);

  // Moiz: 130 - 10.36 = +119.64 -> in youGetRows
  // Qaid: 22.20 - 20 = +2.20 -> in youGetRows
  assert.equal(youGetRows.length, 2);
  const moizRow = youGetRows.find((r) => r.settleId === "moiz");
  const qaidRow = youGetRows.find((r) => r.settleId === "qaid");
  assert.equal(moizRow?.amount, 119.64);
  assert.equal(qaidRow?.amount, 2.2);

  // Totals:
  assert.equal(totalOwed, 6.66);
  assert.equal(totalLent, 121.84);
  assert.equal(net, 115.18);
});

test("SETTLEMENT RESOLUTION: C settles their full 300 debt in group (splits marked paid)", () => {
  // In Spendova, record_split_settlement updates expense_splits: has_paid = true, amount_paid = amount_owed.
  // After C settles all debts:
  const expenses = [
    {
      id: "exp-1",
      paid_by: "user-A",
      amount: 300,
      group_id: "group-1",
      expense_splits: [
        { user_id: "user-A", amount_owed: 100, amount_paid: 100, has_paid: true },
        { user_id: "user-B", amount_owed: 100, amount_paid: 100, has_paid: true },
        { user_id: "user-C", amount_owed: 100, amount_paid: 100, has_paid: true },
      ],
    },
    {
      id: "exp-2",
      paid_by: "user-B",
      amount: 600,
      group_id: "group-1",
      expense_splits: [
        { user_id: "user-A", amount_owed: 200, amount_paid: 200, has_paid: true },
        { user_id: "user-B", amount_owed: 200, amount_paid: 200, has_paid: true },
        { user_id: "user-C", amount_owed: 200, amount_paid: 200, has_paid: true },
      ],
    },
  ];

  const settlements = [
    {
      id: "settle-1",
      from_user_id: "user-C",
      to_user_id: "user-B",
      amount: 300,
      group_id: "group-1",
    },
  ];

  const balances = buildDebtBalances(expenses, settlements, { groupId: "group-1", simplifyDebts: true });
  assert.equal(balances.length, 0, "After settling, all group debts MUST be 0");

  const aggregatedC = aggregateDebtsByUser(balances, "user-C");
  assert.equal(aggregatedC.youOweRows.length, 0);
  assert.equal(aggregatedC.youGetRows.length, 0);
  assert.equal(aggregatedC.totalOwed, 0);
  assert.equal(aggregatedC.totalLent, 0);

  const aggregatedA = aggregateDebtsByUser(balances, "user-A");
  assert.equal(aggregatedA.totalOwed, 0);
  assert.equal(aggregatedA.totalLent, 0);

  const aggregatedB = aggregateDebtsByUser(balances, "user-B");
  assert.equal(aggregatedB.totalOwed, 0);
  assert.equal(aggregatedB.totalLent, 0);
});

test("PARTIAL SETTLEMENT RESOLUTION: C pays 250 of 300 (remaining unpaid is 50)", () => {
  // In Spendova, when C partially settles 250 of 300:
  // exp-2 (200) is fully settled, exp-1 has 50 paid out of 100 owed -> 50 remaining unpaid
  const expenses = [
    {
      id: "exp-1",
      paid_by: "user-A",
      amount: 300,
      group_id: "group-1",
      expense_splits: [
        { user_id: "user-A", amount_owed: 100, amount_paid: 100, has_paid: true },
        { user_id: "user-B", amount_owed: 100, amount_paid: 100, has_paid: true },
        { user_id: "user-C", amount_owed: 100, amount_paid: 50, has_paid: false }, // 50 unpaid
      ],
    },
    {
      id: "exp-2",
      paid_by: "user-B",
      amount: 600,
      group_id: "group-1",
      expense_splits: [
        { user_id: "user-A", amount_owed: 200, amount_paid: 200, has_paid: true },
        { user_id: "user-B", amount_owed: 200, amount_paid: 200, has_paid: true },
        { user_id: "user-C", amount_owed: 200, amount_paid: 200, has_paid: true },
      ],
    },
  ];

  const settlements = [
    {
      id: "settle-1",
      from_user_id: "user-C",
      to_user_id: "user-B",
      amount: 250,
      group_id: "group-1",
    },
  ];

  const balances = buildDebtBalances(expenses, settlements, { groupId: "group-1", simplifyDebts: true });
  assert.equal(balances.length, 1, "Only 1 simplified debt remaining");
  assert.equal(balances[0].fromUserId, "user-C");
  assert.equal(balances[0].toUserId, "user-A");
  assert.equal(balances[0].amount, 50);
});

let failed = 0;
for (const t of tests) {
  try {
    t.fn();
    console.log(`ok - ${t.name}`);
  } catch (error) {
    failed++;
    console.error(`FAIL - ${t.name}:`, error);
  }
}

if (failed > 0) {
  process.exit(1);
} else {
  console.log(`All ${tests.length} debt simplification tests passed.`);
}
