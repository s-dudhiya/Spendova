import assert from "node:assert/strict";
import { buildDebtBalances, planSimplifiedGroupSettlementWrites } from "../src/lib/debt-simplification.ts";

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const cents = (amount) => Math.round(Number(amount || 0) * 100);
const money = (amount) => cents(amount) / 100;
const remaining = (split) => money(split.amount_owed - split.amount_paid);
const statusForSplit = (split) => remaining(split) <= 0 ? "settled" : split.amount_paid > 0 ? "partially_settled" : "pending";
const statusForExpense = (expense) => {
  const statuses = expense.splits.map(statusForSplit);
  if (statuses.every((status) => status === "settled")) return "settled";
  if (statuses.some((status) => status !== "pending")) return "partially_settled";
  return "pending";
};

function balance(expenses, groupId = null) {
  const totals = new Map();
  const add = (from, to, amount) => {
    if (money(amount) <= 0) return;
    const key = `${from}|${to}`;
    totals.set(key, money((totals.get(key) || 0) + amount));
  };

  for (const expense of expenses) {
    if ((expense.group_id || null) !== groupId) continue;
    for (const split of expense.splits) {
      add(split.user_id, expense.paid_by, remaining(split));
    }
  }

  const normalized = new Map();
  for (const [key, amount] of totals.entries()) {
    const [from, to] = key.split("|");
    const reverseKey = `${to}|${from}`;
    if (normalized.has(key) || normalized.has(reverseKey)) continue;
    const net = money(amount - (totals.get(reverseKey) || 0));
    if (Math.abs(net) < 0.01) continue;
    normalized.set(net > 0 ? key : reverseKey, Math.abs(net));
  }
  return normalized;
}

function settle(expenses, { from, to, amount, groupId = null, expenseId = null }) {
  const applications = [];
  const scoped = expenses.filter((expense) => {
    if (expenseId && expense.id !== expenseId) return false;
    return (expense.group_id || null) === groupId;
  });

  if (!expenseId) {
    const forward = scoped
      .filter((expense) => expense.paid_by === to)
      .flatMap((expense) => expense.splits.filter((split) => split.user_id === from))
      .reduce((sum, split) => sum + remaining(split), 0);
    const reverse = scoped
      .filter((expense) => expense.paid_by === from)
      .flatMap((expense) => expense.splits.filter((split) => split.user_id === to))
      .reduce((sum, split) => sum + remaining(split), 0);

    if (forward > 0 && forward >= reverse && Math.abs(amount - (forward - reverse)) <= 0.01) {
      for (const expense of scoped) {
        for (const split of expense.splits) {
          const inPair = (split.user_id === from && expense.paid_by === to) || (split.user_id === to && expense.paid_by === from);
          if (!inPair || remaining(split) <= 0) continue;
          const applied = remaining(split);
          split.amount_paid = split.amount_owed;
          applications.push({ expense_id: expense.id, split_id: split.id, amount: applied });
        }
      }
      return applications;
    }
  }

  let left = amount;
  for (const expense of scoped) {
    if (expense.paid_by !== to) continue;
    for (const split of expense.splits) {
      if (left <= 0 || split.user_id !== from || remaining(split) <= 0) continue;
      const applied = Math.min(left, remaining(split));
      split.amount_paid = money(split.amount_paid + applied);
      left = money(left - applied);
      applications.push({ expense_id: expense.id, split_id: split.id, amount: applied });
    }
  }
  return applications;
}

function reconcilePendingCycle(expenses, userA, userB, groupId = null) {
  const scoped = expenses.filter((expense) => (expense.group_id || null) === groupId);
  const aOwesB = scoped
    .filter((expense) => expense.paid_by === userB)
    .flatMap((expense) => expense.splits.filter((split) => split.user_id === userA))
    .reduce((sum, split) => sum + remaining(split), 0);
  const bOwesA = scoped
    .filter((expense) => expense.paid_by === userA)
    .flatMap((expense) => expense.splits.filter((split) => split.user_id === userB))
    .reduce((sum, split) => sum + remaining(split), 0);

  if (aOwesB <= 0 || bOwesA <= 0 || Math.abs(aOwesB - bOwesA) > 0.01) return false;

  for (const expense of scoped) {
    for (const split of expense.splits) {
      const inPair = (split.user_id === userA && expense.paid_by === userB) || (split.user_id === userB && expense.paid_by === userA);
      if (!inPair || remaining(split) <= 0) continue;
      split.amount_paid = split.amount_owed;
    }
  }
  return true;
}

const split = (id, user_id, amount_owed, amount_paid = 0) => ({ id, user_id, amount_owed, amount_paid });
const expense = (id, paid_by, group_id, splits) => ({ id, paid_by, group_id, splits });
const createdSplit = (expense_id, split) => ({ ...split, expense_id, amount_paid: 0, has_paid: false });

function createGroupSplits({ expenseId, amount, participants, payer, strategy = "equal", values = {} }) {
  let splits = [];
  if (strategy === "equal") {
    const totalCents = cents(amount);
    const baseShare = Math.floor(totalCents / participants.length);
    let remainder = totalCents % participants.length;
    splits = participants
      .map((user_id) => {
        const share = baseShare + (remainder > 0 ? 1 : 0);
        remainder -= 1;
        return { id: `${expenseId}-${user_id}`, user_id, amount_owed: money(share / 100) };
      })
      .filter((item) => item.user_id !== payer && item.amount_owed > 0);
  } else if (strategy === "exact") {
    splits = participants
      .map((user_id) => ({ id: `${expenseId}-${user_id}`, user_id, amount_owed: Number(values[user_id] || 0) }))
      .filter((item) => item.user_id !== payer && item.amount_owed > 0);
  } else {
    splits = participants
      .map((user_id) => ({ id: `${expenseId}-${user_id}`, user_id, amount_owed: money((amount * Number(values[user_id] || 0)) / 100) }))
      .filter((item) => item.user_id !== payer && item.amount_owed > 0);
  }
  return splits.map((item) => createdSplit(expenseId, item));
}

function assertOnlyPayerCleared({ participants, payer, splits }) {
  assert.equal(splits.some((item) => item.user_id === payer), false);
  for (const user of participants) {
    if (user === payer) continue;
    const row = splits.find((item) => item.user_id === user);
    assert.ok(row, `${user} should have a debt row`);
    assert.equal(row.amount_paid, 0);
    assert.equal(row.has_paid, false);
    assert.equal(statusForSplit(row), "pending");
  }
}

test("equal split group expense starts with only payer cleared", () => {
  const participants = ["you", "moiz", "husain", "kaid"];
  const splits = createGroupSplits({ expenseId: "equal", amount: 80, participants, payer: "you" });

  assertOnlyPayerCleared({ participants, payer: "you", splits });
  assert.deepEqual(splits.map((item) => [item.user_id, item.amount_owed]), [["moiz", 20], ["husain", 20], ["kaid", 20]]);
});

test("exact split group expense starts with only payer cleared", () => {
  const participants = ["you", "moiz", "husain", "kaid"];
  const splits = createGroupSplits({
    expenseId: "exact",
    amount: 80,
    participants,
    payer: "you",
    strategy: "exact",
    values: { you: 20, moiz: 15, husain: 25, kaid: 20 },
  });

  assertOnlyPayerCleared({ participants, payer: "you", splits });
});

test("percentage split group expense starts with only payer cleared", () => {
  const participants = ["you", "moiz", "husain", "kaid"];
  const splits = createGroupSplits({
    expenseId: "percentage",
    amount: 80,
    participants,
    payer: "you",
    strategy: "percentage",
    values: { you: 25, moiz: 25, husain: 25, kaid: 25 },
  });

  assertOnlyPayerCleared({ participants, payer: "you", splits });
});

test("when another participant pays the full group expense only that participant is cleared", () => {
  const participants = ["you", "moiz", "husain", "kaid"];
  const splits = createGroupSplits({ expenseId: "other-payer", amount: 80, participants, payer: "moiz" });

  assertOnlyPayerCleared({ participants, payer: "moiz", splits });
  assert.deepEqual(splits.map((item) => item.user_id), ["you", "husain", "kaid"]);
});

test("adding a group expense does not auto-clear debtor split rows", () => {
  const participants = ["you", "moiz", "husain", "kaid"];
  const splits = createGroupSplits({ expenseId: "pending-group", amount: 80, participants, payer: "you" });
  const item = expense("pending-group", "you", "group-1", splits);

  assert.equal(statusForExpense(item), "pending");
  assert.equal(balance([item], "group-1").get("moiz|you"), 20);
  assert.equal(balance([item], "group-1").get("husain|you"), 20);
  assert.equal(balance([item], "group-1").get("kaid|you"), 20);
});

test("settlement still clears pending group expense split rows", () => {
  const participants = ["you", "moiz"];
  const splits = createGroupSplits({ expenseId: "settle-group", amount: 80, participants, payer: "you" });
  const expenses = [expense("settle-group", "you", "group-1", splits)];

  settle(expenses, { from: "moiz", to: "you", amount: 40, groupId: "group-1" });

  assert.equal(statusForExpense(expenses[0]), "settled");
  assert.equal(balance(expenses, "group-1").size, 0);
});

test("equal opposite pending expenses auto-settle the active cycle", () => {
  const expenses = [
    expense("me-paid", "me", null, [split("friend-owes", "friend", 500)]),
    expense("friend-paid", "friend", null, [split("me-owes", "me", 500)]),
  ];

  assert.equal(reconcilePendingCycle(expenses, "friend", "me"), true);
  assert.equal(statusForExpense(expenses[0]), "settled");
  assert.equal(statusForExpense(expenses[1]), "settled");
  assert.equal(balance(expenses).size, 0);
});

test("partial opposite pending expenses stay dynamic until net is paid", () => {
  const expenses = [
    expense("me-paid", "me", null, [split("friend-owes", "friend", 600)]),
    expense("friend-paid", "friend", null, [split("me-owes", "me", 50)]),
  ];

  assert.equal(reconcilePendingCycle(expenses, "friend", "me"), false);
  assert.equal(balance(expenses).get("friend|me"), 550);

  settle(expenses, { from: "friend", to: "me", amount: 550 });
  assert.equal(statusForExpense(expenses[0]), "settled");
  assert.equal(statusForExpense(expenses[1]), "settled");
  assert.equal(balance(expenses).size, 0);
});

test("new expense after an auto-settled cycle starts a fresh pending cycle", () => {
  const expenses = [
    expense("cycle-a", "me", null, [split("a", "friend", 500)]),
    expense("cycle-b", "friend", null, [split("b", "me", 500)]),
  ];
  reconcilePendingCycle(expenses, "friend", "me");
  expenses.push(expense("new-cycle", "me", null, [split("c", "friend", 300)]));
  reconcilePendingCycle(expenses, "friend", "me");

  assert.equal(statusForExpense(expenses[0]), "settled");
  assert.equal(statusForExpense(expenses[1]), "settled");
  assert.equal(statusForExpense(expenses[2]), "pending");
  assert.equal(balance(expenses).get("friend|me"), 300);
});

test("old auto-settled expenses never reopen", () => {
  const expenses = [
    expense("old-a", "me", null, [split("old-a-split", "friend", 500)]),
    expense("old-b", "friend", null, [split("old-b-split", "me", 500)]),
  ];
  reconcilePendingCycle(expenses, "friend", "me");
  expenses.push(expense("later", "friend", null, [split("later-split", "me", 250)]));

  assert.equal(statusForExpense(expenses[0]), "settled");
  assert.equal(statusForExpense(expenses[1]), "settled");
  assert.equal(statusForExpense(expenses[2]), "pending");
  assert.equal(balance(expenses).get("me|friend"), 250);
});

test("personal and friend page remain synced after auto-reconciliation", () => {
  const expenses = [
    expense("personal-a", "me", null, [split("friend-share", "friend", 500)]),
    expense("personal-b", "friend", null, [split("my-share", "me", 500)]),
  ];
  reconcilePendingCycle(expenses, "friend", "me");

  for (const item of expenses) {
    const personalStatus = statusForSplit(item.splits[0]);
    const friendStatus = statusForExpense(item);
    assert.equal(personalStatus, "settled");
    assert.equal(friendStatus, "settled");
  }
});

test("old settled expenses stay settled after a new split expense", () => {
  const expenses = [expense("old", "me", null, [split("old-friend", "friend", 500)])];
  settle(expenses, { from: "friend", to: "me", amount: 500 });
  expenses.push(expense("new", "me", null, [split("new-friend", "friend", 500)]));

  assert.equal(statusForExpense(expenses[0]), "settled");
  assert.equal(statusForExpense(expenses[1]), "pending");
  assert.equal(balance(expenses).get("friend|me"), 500);
});

test("personal and friend detail status use the same split lifecycle", () => {
  const item = expense("dinner", "me", null, [split("friend-share", "friend", 500, 200)]);
  const personalStatus = statusForSplit(item.splits[0]);
  const friendStatus = statusForExpense(item);

  assert.equal(personalStatus, "partially_settled");
  assert.equal(friendStatus, "partially_settled");
});

test("deleting or editing one expense does not unlock unrelated settled expenses", () => {
  const old = expense("old", "me", null, [split("old-friend", "friend", 500)]);
  const editable = expense("editable", "me", null, [split("editable-friend", "friend", 250)]);
  const expenses = [old, editable];
  settle(expenses, { from: "friend", to: "me", amount: 500, expenseId: "old" });
  editable.splits[0].amount_owed = 300;

  assert.equal(statusForExpense(old), "settled");
  assert.equal(statusForExpense(editable), "pending");
});

test("multiple settlement cycles stay independent", () => {
  const expenses = [expense("cycle-1", "me", null, [split("c1", "friend", 500)])];
  settle(expenses, { from: "friend", to: "me", amount: 500 });
  expenses.push(expense("cycle-2", "friend", null, [split("c2", "me", 300)]));
  settle(expenses, { from: "me", to: "friend", amount: 300 });
  expenses.push(expense("cycle-3", "me", null, [split("c3", "friend", 200)]));

  assert.equal(statusForExpense(expenses[0]), "settled");
  assert.equal(statusForExpense(expenses[1]), "settled");
  assert.equal(statusForExpense(expenses[2]), "pending");
  assert.equal(balance(expenses).get("friend|me"), 200);
});

test("partial settlements only partially settle the targeted lifecycle", () => {
  const expenses = [expense("cab", "me", null, [split("cab-friend", "friend", 500)])];
  settle(expenses, { from: "friend", to: "me", amount: 200 });

  assert.equal(statusForExpense(expenses[0]), "partially_settled");
  assert.equal(remaining(expenses[0].splits[0]), 300);
});

test("group settlements use the same ledger rules as friend splits", () => {
  const expenses = [expense("group-old", "me", "group-1", [split("group-old-friend", "friend", 400)])];
  settle(expenses, { from: "friend", to: "me", amount: 400, groupId: "group-1" });
  expenses.push(expense("group-new", "me", "group-1", [split("group-new-friend", "friend", 150)]));

  assert.equal(statusForExpense(expenses[0]), "settled");
  assert.equal(statusForExpense(expenses[1]), "pending");
  assert.equal(balance(expenses, "group-1").get("friend|me"), 150);
});

test("net settlement closes opposite-direction expenses without reopening later", () => {
  const expenses = [
    expense("a-paid", "me", null, [split("friend-owes", "friend", 500)]),
    expense("friend-paid", "friend", null, [split("me-owes", "me", 300)]),
  ];
  const apps = settle(expenses, { from: "friend", to: "me", amount: 200 });
  expenses.push(expense("after-net", "me", null, [split("new-friend", "friend", 100)]));

  assert.equal(apps.length, 2);
  assert.equal(statusForExpense(expenses[0]), "settled");
  assert.equal(statusForExpense(expenses[1]), "settled");
  assert.equal(statusForExpense(expenses[2]), "pending");
});

const applySimplifiedTestSettlement = (groupExpenses, fromUserId, toUserId, amount) => {
  // Plan indirect/reconciliation updates from pre-RPC snapshot (matching Index.tsx)
  const updates = planSimplifiedGroupSettlementWrites(groupExpenses, fromUserId, toUserId, amount);
  // Simulate record_split_settlement direct splits
  let rem = amount;
  for (const exp of groupExpenses) {
    if (exp.paid_by !== toUserId) continue;
    for (const sp of exp.expense_splits || []) {
      if (sp.user_id !== fromUserId || sp.has_paid) continue;
      const unpaid = Number(sp.amount_owed) - Number(sp.amount_paid || 0);
      if (unpaid <= 0.009 || rem <= 0.009) continue;
      const take = Math.min(rem, unpaid);
      sp.amount_paid = Math.round((Number(sp.amount_paid || 0) + take) * 100) / 100;
      sp.has_paid = sp.amount_paid >= Number(sp.amount_owed) - 0.009;
      rem -= take;
    }
  }
  const byId = new Map(updates.map((u) => [u.id, u]));
  for (const exp of groupExpenses) {
    for (const sp of exp.expense_splits || []) {
      const u = byId.get(sp.id);
      if (u) {
        sp.amount_paid = u.amount_paid;
        sp.has_paid = u.has_paid;
      }
    }
  }
};

test("simplified multi-hop chain works whether payer or receiver initiates settle", () => {
  // Charlie -> Bob (100), Bob -> Alice (100) => Simplified: Charlie -> Alice (100)
  const groupExpenses = [
    {
      id: "e1",
      paid_by: "bob",
      group_id: "g1",
      expense_splits: [{ id: "s1", user_id: "charlie", amount_owed: 100, amount_paid: 0, has_paid: false }],
    },
    {
      id: "e2",
      paid_by: "alice",
      group_id: "g1",
      expense_splits: [{ id: "s2", user_id: "bob", amount_owed: 100, amount_paid: 0, has_paid: false }],
    },
  ];
  const before = buildDebtBalances(groupExpenses, [], { groupId: "g1", simplifyDebts: true });
  assert.deepEqual(before.map((b) => [b.fromUserId, b.toUserId, b.amount]), [["charlie", "alice", 100]]);

  // Receiver (Alice) or Payer (Charlie) settles charlie -> alice for 100
  applySimplifiedTestSettlement(groupExpenses, "charlie", "alice", 100);

  const afterSim = buildDebtBalances(groupExpenses, [], { groupId: "g1", simplifyDebts: true });
  const afterRaw = buildDebtBalances(groupExpenses, [], { groupId: "g1", simplifyDebts: false });
  assert.equal(afterSim.length, 0);
  assert.equal(afterRaw.length, 0);
});

test("simplified N-member group (5 members) isolates unrelated members during settlement", () => {
  // Chain: Alice -> Bob (100), Charlie -> Alice (100) => Charlie -> Bob (100)
  // Unrelated: Dave -> Alice (50), Eve -> Dave (30)
  const groupExpenses = [
    {
      id: "e1",
      paid_by: "bob",
      group_id: "g1",
      expense_splits: [{ id: "s1", user_id: "alice", amount_owed: 100, amount_paid: 0, has_paid: false }],
    },
    {
      id: "e2",
      paid_by: "alice",
      group_id: "g1",
      expense_splits: [{ id: "s2", user_id: "charlie", amount_owed: 100, amount_paid: 0, has_paid: false }],
    },
    {
      id: "e3",
      paid_by: "alice",
      group_id: "g1",
      expense_splits: [{ id: "s3", user_id: "dave", amount_owed: 50, amount_paid: 0, has_paid: false }],
    },
    {
      id: "e4",
      paid_by: "dave",
      group_id: "g1",
      expense_splits: [{ id: "s4", user_id: "eve", amount_owed: 30, amount_paid: 0, has_paid: false }],
    },
  ];

  // Settle Charlie -> Bob (100)
  applySimplifiedTestSettlement(groupExpenses, "charlie", "bob", 100);

  const afterRaw = buildDebtBalances(groupExpenses, [], { groupId: "g1", simplifyDebts: false });
  assert.deepEqual(
    afterRaw.map((b) => [b.fromUserId, b.toUserId, b.amount]),
    [
      ["dave", "alice", 50],
      ["eve", "dave", 30],
    ]
  );
  const afterSim = buildDebtBalances(groupExpenses, [], { groupId: "g1", simplifyDebts: true });
  assert.deepEqual(
    afterSim.map((b) => [b.fromUserId, b.toUserId, b.amount]),
    [
      ["eve", "alice", 30],
      ["dave", "alice", 20],
    ]
  );
});

test("simplified 3-member cycle with remainder settles to exact zero without double-charging", () => {
  // Alice -> Bob (100), Bob -> Charlie (100), Charlie -> Alice (50)
  // Net: Alice -50, Bob 0, Charlie +50 => Simplified: Alice -> Charlie (50)
  const groupExpenses = [
    {
      id: "e1",
      paid_by: "bob",
      group_id: "g1",
      expense_splits: [{ id: "s1", user_id: "alice", amount_owed: 100, amount_paid: 0, has_paid: false }],
    },
    {
      id: "e2",
      paid_by: "charlie",
      group_id: "g1",
      expense_splits: [{ id: "s2", user_id: "bob", amount_owed: 100, amount_paid: 0, has_paid: false }],
    },
    {
      id: "e3",
      paid_by: "alice",
      group_id: "g1",
      expense_splits: [{ id: "s3", user_id: "charlie", amount_owed: 50, amount_paid: 0, has_paid: false }],
    },
  ];

  applySimplifiedTestSettlement(groupExpenses, "alice", "charlie", 50);

  const afterSim = buildDebtBalances(groupExpenses, [], { groupId: "g1", simplifyDebts: true });
  assert.equal(afterSim.length, 0);
});

test("test group scenario (t1=600 by Thunder, t2=300 by TestUser): Spendova->Thunder 300 settles all splits with zero Pending left", () => {
  const groupExpenses = [
    {
      id: "t2",
      paid_by: "testuser",
      group_id: "g1",
      expense_splits: [
        { id: "s_thunder_t2", user_id: "thunder", amount_owed: 100, amount_paid: 0, has_paid: false },
        { id: "s_spendova_t2", user_id: "spendova", amount_owed: 100, amount_paid: 0, has_paid: false },
      ],
    },
    {
      id: "t1",
      paid_by: "thunder",
      group_id: "g1",
      expense_splits: [
        { id: "s_spendova_t1", user_id: "spendova", amount_owed: 200, amount_paid: 0, has_paid: false },
        { id: "s_testuser_t1", user_id: "testuser", amount_owed: 200, amount_paid: 0, has_paid: false },
      ],
    },
  ];

  const before = buildDebtBalances(groupExpenses, [], { groupId: "g1", simplifyDebts: true });
  assert.deepEqual(before.map((b) => [b.fromUserId, b.toUserId, b.amount]), [["spendova", "thunder", 300]]);

  applySimplifiedTestSettlement(groupExpenses, "spendova", "thunder", 300);

  const afterSim = buildDebtBalances(groupExpenses, [], { groupId: "g1", simplifyDebts: true });
  const afterRaw = buildDebtBalances(groupExpenses, [], { groupId: "g1", simplifyDebts: false });
  assert.equal(afterSim.length, 0);
  assert.equal(afterRaw.length, 0);
  for (const exp of groupExpenses) {
    for (const sp of exp.expense_splits) {
      assert.equal(sp.has_paid, true, `split ${sp.id} should be marked paid`);
      assert.equal(sp.amount_paid, sp.amount_owed, `split ${sp.id} should have full amount_paid`);
    }
  }
});

test("hard test: 6-member group with mixed expenses settles step-by-step to exact zero", () => {
  const groupExpenses = [
    {
      id: "g6_e1",
      paid_by: "u1",
      group_id: "g6",
      expense_splits: [
        { id: "g6_s1", user_id: "u2", amount_owed: 120, amount_paid: 0, has_paid: false },
        { id: "g6_s2", user_id: "u3", amount_owed: 120, amount_paid: 0, has_paid: false },
        { id: "g6_s3", user_id: "u4", amount_owed: 120, amount_paid: 0, has_paid: false },
      ],
    },
    {
      id: "g6_e2",
      paid_by: "u2",
      group_id: "g6",
      expense_splits: [
        { id: "g6_s4", user_id: "u1", amount_owed: 80, amount_paid: 0, has_paid: false },
        { id: "g6_s5", user_id: "u5", amount_owed: 160, amount_paid: 0, has_paid: false },
      ],
    },
    {
      id: "g6_e3",
      paid_by: "u5",
      group_id: "g6",
      expense_splits: [
        { id: "g6_s6", user_id: "u6", amount_owed: 200, amount_paid: 0, has_paid: false },
      ],
    },
  ];

  // Expected nets: u1: +360-80=+280, u2: +240-120=+120, u3: -120, u4: -120, u5: +200-160=+40, u6: -200
  const netOf = (bals) => {
    const m = {};
    for (const b of bals) {
      m[b.fromUserId] = Math.round(((m[b.fromUserId] || 0) - b.amount) * 100) / 100;
      m[b.toUserId] = Math.round(((m[b.toUserId] || 0) + b.amount) * 100) / 100;
    }
    return m;
  };

  let sim = buildDebtBalances(groupExpenses, [], { groupId: "g6", simplifyDebts: true });
  assert.deepEqual(netOf(sim), { u1: 280, u2: 120, u3: -120, u4: -120, u5: 40, u6: -200 });

  while (sim.length > 0) {
    const next = sim[0];
    applySimplifiedTestSettlement(groupExpenses, next.fromUserId, next.toUserId, next.amount);
    sim = buildDebtBalances(groupExpenses, [], { groupId: "g6", simplifyDebts: true });
  }

  assert.equal(sim.length, 0);
  const rawAfter = buildDebtBalances(groupExpenses, [], { groupId: "g6", simplifyDebts: false });
  assert.equal(rawAfter.length, 0);
});

test("hard test: partial settlement in simplified group preserves exact remaining balance", () => {
  const groupExpenses = [
    {
      id: "p1",
      paid_by: "bob",
      group_id: "gp",
      expense_splits: [{ id: "ps1", user_id: "alice", amount_owed: 300, amount_paid: 0, has_paid: false }],
    },
  ];
  applySimplifiedTestSettlement(groupExpenses, "alice", "bob", 150);
  const after = buildDebtBalances(groupExpenses, [], { groupId: "gp", simplifyDebts: true });
  assert.deepEqual(after.map((b) => [b.fromUserId, b.toUserId, b.amount]), [["alice", "bob", 150]]);
});

test("hard test: settling in simplified group g1 never affects unsimplified group g2", () => {
  const g1 = [
    {
      id: "g1_e1",
      paid_by: "thunder",
      group_id: "g1",
      expense_splits: [{ id: "g1_s1", user_id: "spendova", amount_owed: 200, amount_paid: 0, has_paid: false }],
    },
  ];
  const g2 = [
    {
      id: "g2_e1",
      paid_by: "thunder",
      group_id: "g2",
      expense_splits: [{ id: "g2_s1", user_id: "spendova", amount_owed: 150, amount_paid: 0, has_paid: false }],
    },
  ];
  applySimplifiedTestSettlement(g1, "spendova", "thunder", 200);
  assert.equal(buildDebtBalances(g1, [], { groupId: "g1", simplifyDebts: true }).length, 0);
  assert.deepEqual(
    buildDebtBalances(g2, [], { groupId: "g2", simplifyDebts: false }).map((b) => [b.fromUserId, b.toUserId, b.amount]),
    [["spendova", "thunder", 150]]
  );
});

for (const { name, fn } of tests) {
  fn();
  console.log(`ok - ${name}`);
}
