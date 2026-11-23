import assert from "node:assert/strict";
import { simplifyGroupDebts, buildDebtBalances } from "../src/lib/debt-simplification.ts";

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

test("Scenario 1: User 3-person scenario (A pays 300, B pays 600, 3 members)", () => {
  const expenses = [
    {
      id: "e1",
      paid_by: "user-A",
      amount: 300,
      group_id: "g1",
      expense_splits: [
        { user_id: "user-A", amount_owed: 100 },
        { user_id: "user-B", amount_owed: 100 },
        { user_id: "user-C", amount_owed: 100 },
      ],
    },
    {
      id: "e2",
      paid_by: "user-B",
      amount: 600,
      group_id: "g1",
      expense_splits: [
        { user_id: "user-A", amount_owed: 200 },
        { user_id: "user-B", amount_owed: 200 },
        { user_id: "user-C", amount_owed: 200 },
      ],
    },
  ];

  const simplified = buildDebtBalances(expenses, [], { simplifyDebts: true });
  assert.equal(simplified.length, 1);
  assert.equal(simplified[0].fromUserId, "user-C");
  assert.equal(simplified[0].toUserId, "user-B");
  assert.equal(simplified[0].amount, 300);

  assert.equal(simplified.filter((b) => b.fromUserId === "user-A" || b.toUserId === "user-A").length, 0);

  const net = computeNetMap(simplified);
  assert.equal(net.get("user-B"), 300);
  assert.equal(net.get("user-C"), -300);
  assert.equal(net.get("user-A") || 0, 0);
});

test("Scenario 2: Perfect circular debt completely cancels to 0 payments", () => {
  const expenses = [
    {
      id: "e1",
      paid_by: "user-A",
      amount: 50,
      group_id: "g1",
      expense_splits: [{ user_id: "user-B", amount_owed: 50 }],
    },
    {
      id: "e2",
      paid_by: "user-B",
      amount: 50,
      group_id: "g1",
      expense_splits: [{ user_id: "user-C", amount_owed: 50 }],
    },
    {
      id: "e3",
      paid_by: "user-C",
      amount: 50,
      group_id: "g1",
      expense_splits: [{ user_id: "user-A", amount_owed: 50 }],
    },
  ];

  const simplified = buildDebtBalances(expenses, [], { simplifyDebts: true });
  assert.equal(simplified.length, 0, "All circular debts must cancel out completely");
});

test("Scenario 3: Asymmetrical 3-way circular debt minimized", () => {
  const expenses = [
    {
      id: "e1",
      paid_by: "user-A",
      amount: 100,
      group_id: "g1",
      expense_splits: [{ user_id: "user-B", amount_owed: 100 }],
    },
    {
      id: "e2",
      paid_by: "user-B",
      amount: 60,
      group_id: "g1",
      expense_splits: [{ user_id: "user-C", amount_owed: 60 }],
    },
    {
      id: "e3",
      paid_by: "user-C",
      amount: 20,
      group_id: "g1",
      expense_splits: [{ user_id: "user-A", amount_owed: 20 }],
    },
  ];

  const simplified = buildDebtBalances(expenses, [], { simplifyDebts: true });
  assert.equal(simplified.length, 2, "Should be resolved in 2 payments instead of 3");

  const net = computeNetMap(simplified);
  assert.equal(net.get("user-A"), 80);
  assert.equal(net.get("user-B"), -40);
  assert.equal(net.get("user-C"), -40);
});

test("Scenario 4: Multi-payer 5-person trip with multiple shared expenses", () => {
  const members = ["uA", "uB", "uC", "uD", "uE"];
  const expenses = [
    {
      id: "hotel",
      paid_by: "uA",
      amount: 1500,
      group_id: "trip",
      expense_splits: members.map((u) => ({ user_id: u, amount_owed: 300 })),
    },
    {
      id: "food",
      paid_by: "uB",
      amount: 1000,
      group_id: "trip",
      expense_splits: members.map((u) => ({ user_id: u, amount_owed: 200 })),
    },
    {
      id: "cab",
      paid_by: "uC",
      amount: 500,
      group_id: "trip",
      expense_splits: members.map((u) => ({ user_id: u, amount_owed: 100 })),
    },
  ];

  const unsimplified = buildDebtBalances(expenses, [], { simplifyDebts: false });
  const simplified = buildDebtBalances(expenses, [], { simplifyDebts: true });

  assert(unsimplified.length >= 6);
  assert(simplified.length <= 4, `Expected at most 4 transactions, got ${simplified.length}`);

  const netUnsimplified = computeNetMap(unsimplified);
  const netSimplified = computeNetMap(simplified);

  assert.equal(netSimplified.get("uA"), 900);
  assert.equal(netSimplified.get("uB"), 400);
  assert.equal(netSimplified.get("uC"), -100);
  assert.equal(netSimplified.get("uD"), -600);
  assert.equal(netSimplified.get("uE"), -600);

  for (const m of members) {
    assert.equal(netSimplified.get(m), netUnsimplified.get(m), `Net mismatch for member ${m}`);
  }
});

test("Scenario 5: Strict Group Isolation (2 Different Groups)", () => {
  const expenses = [
    {
      id: "e-g1",
      paid_by: "user-B",
      amount: 200,
      group_id: "group-1",
      expense_splits: [{ user_id: "user-A", amount_owed: 200 }],
    },
    {
      id: "e-g2",
      paid_by: "user-A",
      amount: 200,
      group_id: "group-2",
      expense_splits: [{ user_id: "user-B", amount_owed: 200 }],
    },
  ];

  const balances = buildDebtBalances(expenses, [], { simplifyDebts: true });

  assert.equal(balances.length, 2, "Debts must not cancel out across separate groups");
  const g1Debt = balances.find((b) => b.groupId === "group-1");
  const g2Debt = balances.find((b) => b.groupId === "group-2");

  assert.equal(g1Debt?.fromUserId, "user-A");
  assert.equal(g1Debt?.toUserId, "user-B");
  assert.equal(g1Debt?.amount, 200);

  assert.equal(g2Debt?.fromUserId, "user-B");
  assert.equal(g2Debt?.toUserId, "user-A");
  assert.equal(g2Debt?.amount, 200);
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
  console.log(`All ${tests.length} comprehensive Splitwise scenarios passed with 0 errors!`);
}
