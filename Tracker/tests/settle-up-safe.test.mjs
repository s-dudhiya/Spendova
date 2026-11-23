import assert from "node:assert/strict";
import { buildDebtBalances, aggregateDebtsByUser } from "../src/lib/debt-simplification.ts";

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test("Settle Up Flow: pairwise settlement safely clears all splits and updates simplified view to 0", () => {
  // Scenario:
  // Expense 1: Alice pays 300, split 100 each for Alice, Bob, Charlie
  // Expense 2: Bob pays 600, split 200 each for Alice, Bob, Charlie
  const expenses = [
    {
      id: "exp-1",
      paid_by: "alice",
      amount: 300,
      group_id: "group-1",
      payer_profile: { user_id: "alice", full_name: "Alice" },
      expense_splits: [
        { id: "s1-a", user_id: "alice", amount_owed: 100, amount_paid: 100, has_paid: true },
        { id: "s1-b", user_id: "bob", amount_owed: 100, amount_paid: 0, has_paid: false },
        { id: "s1-c", user_id: "charlie", amount_owed: 100, amount_paid: 0, has_paid: false },
      ],
    },
    {
      id: "exp-2",
      paid_by: "bob",
      amount: 600,
      group_id: "group-1",
      payer_profile: { user_id: "bob", full_name: "Bob" },
      expense_splits: [
        { id: "s2-a", user_id: "alice", amount_owed: 200, amount_paid: 0, has_paid: false },
        { id: "s2-b", user_id: "bob", amount_owed: 200, amount_paid: 200, has_paid: true },
        { id: "s2-c", user_id: "charlie", amount_owed: 200, amount_paid: 0, has_paid: false },
      ],
    },
  ];

  // 1. Charlie views Group (Simplify ON):
  const groupSimplifiedBefore = buildDebtBalances(expenses, [], {
    groupId: "group-1",
    simplifyDebts: true,
  });
  // In simplified view: Charlie owes Bob 300
  const charlieSimplifiedDebt = groupSimplifiedBefore.find((b) => b.fromUserId === "charlie");
  assert.equal(charlieSimplifiedDebt?.toUserId, "bob");
  assert.equal(charlieSimplifiedDebt?.amount, 300);

  // 2. Charlie opens Settle Up (safe pairwise settlement generation):
  const charlieSettleUpBalances = buildDebtBalances(expenses, [], {
    currentUserId: "charlie",
    groupId: "group-1",
    simplifyDebts: false,
  });
  // In SettleForm, visibleBalances filters to balances involving Charlie:
  const charlieVisible = charlieSettleUpBalances.filter(
    (b) => b.fromUserId === "charlie" || b.toUserId === "charlie"
  );
  // Charlie sees his actual expense obligations: 100 to Alice, 200 to Bob
  assert.equal(charlieVisible.length, 2);
  const toAlice = charlieVisible.find((b) => b.toUserId === "alice");
  const toBob = charlieVisible.find((b) => b.toUserId === "bob");
  assert.equal(toAlice?.amount, 100);
  assert.equal(toBob?.amount, 200);

  // 3. Charlie settles both obligations:
  // Supabase record_split_settlement marks splits paid:
  expenses[0].expense_splits[2].amount_paid = 100;
  expenses[0].expense_splits[2].has_paid = true;
  expenses[1].expense_splits[2].amount_paid = 200;
  expenses[1].expense_splits[2].has_paid = true;

  // 4. Verify Charlie's view after settlement (Simplify ON):
  const groupSimplifiedAfter = buildDebtBalances(expenses, [], {
    groupId: "group-1",
    simplifyDebts: true,
  });
  const charlieDebtsAfterOn = groupSimplifiedAfter.filter((b) => b.fromUserId === "charlie" || b.toUserId === "charlie");
  assert.equal(charlieDebtsAfterOn.length, 0, "Charlie owes 0 and gets 0 in simplified view");

  // 5. Verify Charlie's friend (Bob) who has Simplify OFF:
  const groupBobViewAfter = buildDebtBalances(expenses, [], {
    groupId: "group-1",
    simplifyDebts: false,
  });
  const charlieDebtsInBobView = groupBobViewAfter.filter((b) => b.fromUserId === "charlie" || b.toUserId === "charlie");
  assert.equal(charlieDebtsInBobView.length, 0, "Bob confirms Charlie owes 0 in pairwise view as well!");

  // 6. Net balance of Charlie in both views:
  const aggOn = aggregateDebtsByUser(groupSimplifiedAfter, "charlie");
  const aggOff = aggregateDebtsByUser(groupBobViewAfter, "charlie");
  assert.equal(aggOn.net, 0);
  assert.equal(aggOff.net, 0);
  assert.equal(aggOn.totalOwed, 0);
  assert.equal(aggOff.totalOwed, 0);
});

test("Partial Settle Up: settling one expense leaves exact expected remaining balance in both modes", () => {
  const expenses = [
    {
      id: "exp-1",
      paid_by: "alice",
      amount: 300,
      group_id: "group-1",
      payer_profile: { user_id: "alice", full_name: "Alice" },
      expense_splits: [
        { id: "s1-a", user_id: "alice", amount_owed: 100, amount_paid: 100, has_paid: true },
        { id: "s1-b", user_id: "bob", amount_owed: 100, amount_paid: 0, has_paid: false },
        { id: "s1-c", user_id: "charlie", amount_owed: 100, amount_paid: 0, has_paid: false },
      ],
    },
    {
      id: "exp-2",
      paid_by: "bob",
      amount: 600,
      group_id: "group-1",
      payer_profile: { user_id: "bob", full_name: "Bob" },
      expense_splits: [
        { id: "s2-a", user_id: "alice", amount_owed: 200, amount_paid: 0, has_paid: false },
        { id: "s2-b", user_id: "bob", amount_owed: 200, amount_paid: 200, has_paid: true },
        { id: "s2-c", user_id: "charlie", amount_owed: 200, amount_paid: 0, has_paid: false },
      ],
    },
  ];

  // Charlie settles only exp-1 (100 to Alice):
  expenses[0].expense_splits[2].amount_paid = 100;
  expenses[0].expense_splits[2].has_paid = true;

  // Now in pairwise: Charlie owes Bob 200, Alice owes Bob 100 (net Bob is +300, Charlie is -200, Alice is -100)
  const pairwise = buildDebtBalances(expenses, [], { groupId: "group-1", simplifyDebts: false });
  const simplified = buildDebtBalances(expenses, [], { groupId: "group-1", simplifyDebts: true });

  const aggCharliePairwise = aggregateDebtsByUser(pairwise, "charlie");
  const aggCharlieSimplified = aggregateDebtsByUser(simplified, "charlie");

  assert.equal(aggCharliePairwise.net, -200);
  assert.equal(aggCharlieSimplified.net, -200);
  assert.equal(aggCharliePairwise.totalOwed, 200);
  assert.equal(aggCharlieSimplified.totalOwed, 200);
});

let failed = 0;
for (const t of tests) {
  try {
    t.fn();
    console.log(`ok - ${t.name}`);
  } catch (err) {
    failed++;
    console.error(`FAIL - ${t.name}:`, err);
  }
}

if (failed > 0) process.exit(1);
console.log(`All ${tests.length} settle-up safety tests passed.`);
