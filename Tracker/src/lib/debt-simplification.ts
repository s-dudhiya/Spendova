export type DebtBalance = {
  fromUserId: string;
  toUserId: string;
  fromName: string;
  toName: string;
  amount: number;
  groupId?: string | null;
  contextName?: string;
  isAggregate?: boolean;
  aggregateBalances?: DebtBalance[];
};

export type ProfileLike = {
  user_id?: string;
  full_name?: string | null;
  username?: string | null;
  email?: string | null;
};

export type ExpenseSplitLike = {
  id?: string;
  user_id: string;
  amount_owed: number;
  amount_paid?: number | null;
  has_paid?: boolean | null;
  profiles?: ProfileLike | null;
};

export type ExpenseRowLike = {
  id: string;
  user_id?: string;
  paid_by: string;
  amount?: number;
  group_id?: string | null;
  status?: string | null;
  expense_splits?: ExpenseSplitLike[];
  payer_profile?: ProfileLike | null;
  profiles?: ProfileLike | null;
};

export type SettlementRowLike = {
  id?: string;
  from_user_id: string;
  to_user_id: string;
  amount: number;
  group_id?: string | null;
  expense_id?: string | null;
  created_at?: string | null;
};

export type DebtCalculationOptions = {
  currentUserId?: string;
  groupId?: string | null;
  friendId?: string;
  simplifyDebts?: boolean;
  groupSimplifyMap?: Record<string, boolean>;
};

export function isGroupSimplifyEnabled(groupId: string, serverValue?: boolean | null): boolean {
  if (serverValue !== undefined && serverValue !== null) return Boolean(serverValue);
  if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
    try {
      const val = localStorage.getItem(`spendova_group_simplify_${groupId}`);
      if (val === "false") return false;
      if (val === "true") return true;
    } catch {}
  }
  return true;
}

export function setGroupSimplifyEnabled(groupId: string, enabled: boolean): void {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(`spendova_group_simplify_${groupId}`, String(enabled));
  } catch {}
}

/**
 * Simplifies a set of pairwise debt balances using the Min-Cash-Flow algorithm.
 * Guarantees that:
 * 1. The net balance for every individual user is 100% preserved (exact mathematical invariance).
 * 2. Total transactions needed to settle all debts is minimized (at most N - 1 payments for N members).
 * 3. Circular debts (A -> B -> C -> A) are completely canceled out to 0 transactions.
 * 4. Only operates on the provided balances (scoped strictly to a single group).
 */
export function simplifyGroupDebts(
  balances: DebtBalance[],
  enabled: boolean = true,
  nameLookup?: Record<string, string>
): DebtBalance[] {
  if (!enabled || balances.length <= 1) {
    return balances;
  }

  // 1. Calculate the net balance for each person involved in this group's balances
  const netBalances = new Map<string, number>();
  const names = new Map<string, string>();
  let groupId: string | null | undefined = undefined;

  for (const balance of balances) {
    if (groupId === undefined && balance.groupId !== undefined) {
      groupId = balance.groupId;
    }
    if (balance.fromUserId && balance.fromName) {
      names.set(balance.fromUserId, balance.fromName);
    }
    if (balance.toUserId && balance.toName) {
      names.set(balance.toUserId, balance.toName);
    }

    const currentFrom = netBalances.get(balance.fromUserId) || 0;
    const currentTo = netBalances.get(balance.toUserId) || 0;

    // fromUserId owes money -> decreases net balance
    netBalances.set(balance.fromUserId, currentFrom - balance.amount);
    // toUserId is owed money -> increases net balance
    netBalances.set(balance.toUserId, currentTo + balance.amount);
  }

  // 2. Separate into Debtors and Creditors (cleanly rounding cents to avoid floating-point drift)
  const debtors: Array<{ userId: string; amount: number }> = [];
  const creditors: Array<{ userId: string; amount: number }> = [];

  for (const [userId, net] of netBalances.entries()) {
    const rounded = Math.round(net * 100) / 100;
    if (rounded < -0.009) {
      debtors.push({ userId, amount: Math.abs(rounded) });
    } else if (rounded > 0.009) {
      creditors.push({ userId, amount: rounded });
    }
  }

  // If all net balances cancel out (e.g. perfect circular debts), no transactions are required!
  if (debtors.length === 0 || creditors.length === 0) {
    return [];
  }

  // 3. Sort descending by absolute amount (greedy approach matches largest amounts first)
  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const simplified: DebtBalance[] = [];
  let dIdx = 0;
  let cIdx = 0;

  const resolveName = (userId: string) => {
    return names.get(userId) || (nameLookup && nameLookup[userId]) || "Unknown";
  };

  // 4. Greedy Min-Cash-Flow matching
  while (dIdx < debtors.length && cIdx < creditors.length) {
    const debtor = debtors[dIdx];
    const creditor = creditors[cIdx];

    const settleAmount = Math.min(debtor.amount, creditor.amount);
    const roundedSettle = Math.round(settleAmount * 100) / 100;

    if (roundedSettle > 0.009) {
      simplified.push({
        fromUserId: debtor.userId,
        toUserId: creditor.userId,
        fromName: resolveName(debtor.userId),
        toName: resolveName(creditor.userId),
        amount: roundedSettle,
        groupId,
      });
    }

    debtor.amount = Math.round((debtor.amount - settleAmount) * 100) / 100;
    creditor.amount = Math.round((creditor.amount - settleAmount) * 100) / 100;

    if (debtor.amount <= 0.009) dIdx++;
    if (creditor.amount <= 0.009) cIdx++;
  }

  return simplified;
}

/**
 * Builds all debt balances across expenses, applying group-level debt simplification
 * when enabled on each respective group.
 * Ensures strict isolation:
 * - Group debts are simplified only within each group and never mixed across groups.
 * - Non-group (personal friend) splits are netted pairwise and never mixed with groups.
 * - If friendId is specified, filters the final simplified debts to those involving that friend.
 */
export function buildDebtBalances(
  expenses: ExpenseRowLike[],
  _settlements: SettlementRowLike[] = [],
  options: DebtCalculationOptions = {}
): DebtBalance[] {
  const profiles: Record<string, string> = {};
  const addName = (profile?: ProfileLike | null) => {
    if (profile?.user_id) {
      profiles[profile.user_id] = profile.full_name || profile.username || profile.email || "User";
    }
  };

  expenses.forEach((expense) => {
    addName(expense.payer_profile);
    addName(expense.profiles);
    expense.expense_splits?.forEach((split) => {
      addName(split.profiles);
    });
  });

  const getProfileName = (userId: string) => {
    if (options.currentUserId && userId === options.currentUserId) return "You";
    return profiles[userId] || "Unknown";
  };

  // Helper to compute pairwise debts for a slice of expenses.
  // In Spendova, expense_splits is the single source of truth for unpaid balance.
  // Settlements recorded via record_split_settlement automatically set has_paid = true and amount_paid on expense_splits.
  const computePairwise = (list: ExpenseRowLike[], gid: string | null): DebtBalance[] => {
    const pairTotals: Record<string, number> = {};
    const addDebt = (from: string, to: string, amount: number) => {
      if (!from || !to || from === to || Math.abs(amount) < 0.01) return;
      const key = `${from}|${to}`;
      pairTotals[key] = (pairTotals[key] || 0) + amount;
    };

    list.forEach((expense) => {
      expense.expense_splits?.forEach((split) => {
        if (split.has_paid || Number(split.amount_paid || 0) >= Number(split.amount_owed || 0)) return;
        const unpaid = Math.max(Number(split.amount_owed || 0) - Number(split.amount_paid || 0), 0);
        if (unpaid > 0.009) {
          addDebt(split.user_id, expense.paid_by, unpaid);
        }
      });
    });

    const normalized: Record<string, number> = {};
    Object.entries(pairTotals).forEach(([key, amount]) => {
      const [from, to] = key.split("|");
      const reverseKey = `${to}|${from}`;
      if (normalized[key] !== undefined || normalized[reverseKey] !== undefined) return;
      const net = amount - (pairTotals[reverseKey] || 0);
      if (Math.abs(net) < 0.01) return;
      if (net > 0) normalized[key] = net;
      else normalized[reverseKey] = Math.abs(net);
    });

    return Object.entries(normalized).map(([key, amount]) => {
      const [fromUserId, toUserId] = key.split("|");
      return {
        fromUserId,
        toUserId,
        fromName: getProfileName(fromUserId),
        toName: getProfileName(toUserId),
        amount: Number(amount.toFixed(2)),
        groupId: gid,
      };
    });
  };

  // Partition expenses into groups and personal splits
  const groupExpensesMap = new Map<string, ExpenseRowLike[]>();
  const personalExpenses: ExpenseRowLike[] = [];

  expenses.forEach((expense) => {
    if (options.groupId !== undefined) {
      if (options.groupId === null && expense.group_id) return;
      if (options.groupId !== null && expense.group_id !== options.groupId) return;
    }

    if (expense.group_id) {
      const list = groupExpensesMap.get(expense.group_id) || [];
      list.push(expense);
      groupExpensesMap.set(expense.group_id, list);
    } else {
      personalExpenses.push(expense);
    }
  });

  const allBalances: DebtBalance[] = [];

  // 1. Process group expenses per group
  groupExpensesMap.forEach((gExpenses, gid) => {
    const shouldSimplify = options.groupSimplifyMap && options.groupSimplifyMap[gid] !== undefined
      ? options.groupSimplifyMap[gid]
      : options.simplifyDebts !== undefined
      ? options.simplifyDebts
      : isGroupSimplifyEnabled(gid);

    const pairwise = computePairwise(gExpenses, gid);
    if (shouldSimplify) {
      const simplified = simplifyGroupDebts(pairwise, true);
      allBalances.push(...simplified);
    } else {
      allBalances.push(...pairwise);
    }
  });

  // 2. Process personal expenses (pairwise netting, no cross-person multi-hop simplification)
  if (personalExpenses.length > 0) {
    const personalDebts = computePairwise(personalExpenses, null);
    allBalances.push(...personalDebts);
  }

  // 3. Filter by friendId and currentUserId if specified
  let result = allBalances;
  if (options.friendId) {
    result = result.filter((b) => {
      const involvesFriend = b.fromUserId === options.friendId || b.toUserId === options.friendId;
      if (!involvesFriend) return false;
      if (options.currentUserId) {
        return b.fromUserId === options.currentUserId || b.toUserId === options.currentUserId;
      }
      return true;
    });
  }

  return result;
}

export type AggregatedDebtRow = {
  settleId: string;
  name: string;
  amount: number;
  direction: "owe" | "get";
  contextName: string;
  details?: Array<{ context: string; amount: number; direction: "owe" | "get" }>;
};

/**
 * Aggregates debts by user:
 * For each user, combines all expenses across groups and personal splits,
 * subtracting what they owe you from what you owe them (or vice versa),
 * and placing each person into either "You Owe" or "You Get" with their final net amount.
 */
export function aggregateDebtsByUser(
  balances: DebtBalance[],
  currentUserId: string,
  groupNames: Record<string, string> = {}
): {
  youOweRows: AggregatedDebtRow[];
  youGetRows: AggregatedDebtRow[];
  totalOwed: number;
  totalLent: number;
  net: number;
} {
  const personMap = new Map<
    string,
    {
      name: string;
      net: number;
      items: Array<{ context: string; amount: number; direction: "owe" | "get" }>;
    }
  >();

  balances.forEach((b) => {
    let otherId: string | null = null;
    let otherName = "Unknown";
    let isGet = false;

    if (b.toUserId === currentUserId) {
      otherId = b.fromUserId;
      otherName = b.fromName;
      isGet = true;
    } else if (b.fromUserId === currentUserId) {
      otherId = b.toUserId;
      otherName = b.toName;
      isGet = false;
    }

    if (!otherId || otherId === currentUserId) return;

    // Identify existing person by otherId or matching display name / username
    let targetKey = otherId;
    if (!personMap.has(otherId)) {
      for (const [key, val] of personMap.entries()) {
        if (
          otherName &&
          val.name &&
          otherName !== "Unknown" &&
          val.name !== "Unknown" &&
          val.name.trim().toLowerCase() === otherName.trim().toLowerCase()
        ) {
          targetKey = key;
          break;
        }
      }
    }

    const existing = personMap.get(targetKey) || {
      name: otherName,
      net: 0,
      items: [],
    };

    if (otherName && otherName !== "Unknown") {
      existing.name = otherName;
    }

    const context = b.contextName || (b.groupId ? groupNames[b.groupId] || "Group" : "Personal split");
    existing.net += isGet ? b.amount : -b.amount;
    existing.items.push({
      context,
      amount: b.amount,
      direction: isGet ? "get" : "owe",
    });

    personMap.set(targetKey, existing);
  });

  const youOweRows: AggregatedDebtRow[] = [];
  const youGetRows: AggregatedDebtRow[] = [];

  personMap.forEach((entry, otherId) => {
    const net = Math.round(entry.net * 100) / 100;
    if (Math.abs(net) < 0.01) return;

    let contextName = "";
    if (entry.items.length === 1) {
      contextName = entry.items[0].context;
    } else {
      const parts = entry.items.map(
        (it) => `${it.context}: ${it.direction === "get" ? "+" : "-"}₹${it.amount}`
      );
      contextName = parts.join(" • ");
    }

    if (net > 0) {
      youGetRows.push({
        settleId: otherId,
        name: entry.name,
        amount: net,
        direction: "get",
        contextName,
        details: entry.items,
      });
    } else {
      youOweRows.push({
        settleId: otherId,
        name: entry.name,
        amount: Math.abs(net),
        direction: "owe",
        contextName,
        details: entry.items,
      });
    }
  });

  youOweRows.sort((a, b) => b.amount - a.amount);
  youGetRows.sort((a, b) => b.amount - a.amount);

  const totalOwed = Math.round(youOweRows.reduce((sum, r) => sum + r.amount, 0) * 100) / 100;
  const totalLent = Math.round(youGetRows.reduce((sum, r) => sum + r.amount, 0) * 100) / 100;
  const net = Math.round((totalLent - totalOwed) * 100) / 100;

  return {
    youOweRows,
    youGetRows,
    totalOwed,
    totalLent,
    net,
  };
}

export type SimplifiedSplitUpdate = {
  id: string;
  amount_paid: number;
  has_paid: boolean;
  applied: number;
};

/**
 * Computes the exact indirect expense_splits updates needed when settling a
 * simplified group balance (`fromUserId -> toUserId` for `settledAmount`).
 * Works identically whether initiated by the payer or the receiver, and for
 * any N-member group without touching unrelated members' splits.
 */
export function planSimplifiedGroupSettlementWrites(
  groupExpenses: ExpenseRowLike[],
  fromUserId: string,
  toUserId: string,
  settledAmount: number
): SimplifiedSplitUpdate[] {
  if (!fromUserId || !toUserId || fromUserId === toUserId || settledAmount <= 0.009) {
    return [];
  }

  const payerUnpaidSplits = groupExpenses.flatMap((e) =>
    (e.expense_splits || [])
      .filter((s) => s.user_id === fromUserId && !s.has_paid && Number(s.amount_paid || 0) < Number(s.amount_owed || 0))
      .map((s) => ({ ...s, expensePaidBy: e.paid_by }))
  );

  const directOwed = payerUnpaidSplits
    .filter((s) => s.expensePaidBy === toUserId)
    .reduce((sum, s) => sum + (Number(s.amount_owed || 0) - Number(s.amount_paid || 0)), 0);

  let excess = Math.max(0, settledAmount - directOwed);
  if (excess <= 0.009) {
    return [];
  }

  const updates: SimplifiedSplitUpdate[] = [];

  // 1. Apply excess credit across splits where fromUserId owed other creditors in the group
  const otherPayerSplits = payerUnpaidSplits.filter((s) => s.expensePaidBy !== toUserId);
  for (const split of otherPayerSplits) {
    if (excess <= 0.009) break;
    if (!split.id) continue;
    const unpaid = Number(split.amount_owed || 0) - Number(split.amount_paid || 0);
    const apply = Math.min(excess, unpaid);
    const newAmountPaid = Math.round((Number(split.amount_paid || 0) + apply) * 100) / 100;
    const hasPaid = newAmountPaid >= Number(split.amount_owed || 0) - 0.009;

    updates.push({
      id: split.id,
      amount_paid: newAmountPaid,
      has_paid: hasPaid,
      applied: Math.round(apply * 100) / 100,
    });
    split.amount_paid = newAmountPaid;
    split.has_paid = hasPaid;
    excess -= apply;
  }

  // 2. Apply matching receiver credit across splits where other debtors owed toUserId in the group
  let receiverCredit = Math.max(0, settledAmount - directOwed);
  if (receiverCredit > 0.009) {
    const intermediarySplits = groupExpenses.flatMap((e) =>
      (e.expense_splits || [])
        .filter(
          (s) =>
            e.paid_by === toUserId &&
            s.user_id !== fromUserId &&
            !s.has_paid &&
            Number(s.amount_paid || 0) < Number(s.amount_owed || 0)
        )
        .map((s) => ({ ...s, expensePaidBy: e.paid_by }))
    );
    for (const split of intermediarySplits) {
      if (receiverCredit <= 0.009) break;
      if (!split.id) continue;
      const unpaid = Number(split.amount_owed || 0) - Number(split.amount_paid || 0);
      const apply = Math.min(receiverCredit, unpaid);
      const newAmountPaid = Math.round((Number(split.amount_paid || 0) + apply) * 100) / 100;
      const hasPaid = newAmountPaid >= Number(split.amount_owed || 0) - 0.009;

      updates.push({
        id: split.id,
        amount_paid: newAmountPaid,
        has_paid: hasPaid,
        applied: Math.round(apply * 100) / 100,
      });
      split.amount_paid = newAmountPaid;
      split.has_paid = hasPaid;
      receiverCredit -= apply;
    }
  }

  // 3. Reconcile any mutually canceling opposite-direction splits (e.g. A->B and B->A)
  // created after Step 1 & Step 2 so settled expenses don't stay marked "Pending".
  const virtualPaidById = new Map<string, { amount_paid: number; has_paid: boolean }>();
  for (const u of updates) {
    virtualPaidById.set(u.id, { amount_paid: u.amount_paid, has_paid: u.has_paid });
  }
  const getSplitPaid = (s: ExpenseSplitLike) => {
    if (s.id && virtualPaidById.has(s.id)) return virtualPaidById.get(s.id)!;
    return { amount_paid: Number(s.amount_paid || 0), has_paid: Boolean(s.has_paid) };
  };

  type OpenSplit = { id: string; from: string; to: string; owed: number; paid: number };
  const openSplits: OpenSplit[] = [];
  for (const e of groupExpenses) {
    for (const s of e.expense_splits || []) {
      if (!s.id || s.user_id === e.paid_by) continue;
      const st = getSplitPaid(s);
      if (st.has_paid) continue;
      const owed = Number(s.amount_owed || 0);
      if (owed - st.amount_paid > 0.009) {
        openSplits.push({ id: s.id, from: s.user_id, to: e.paid_by, owed, paid: st.amount_paid });
      }
    }
  }

  const pairOpenTotals = new Map<string, number>();
  for (const os of openSplits) {
    const key = `${os.from}|${os.to}`;
    pairOpenTotals.set(key, (pairOpenTotals.get(key) || 0) + (os.owed - os.paid));
  }

  const handledPairs = new Set<string>();
  for (const [key, fwdTotal] of pairOpenTotals.entries()) {
    const [a, b] = key.split("|");
    const revKey = `${b}|${a}`;
    if (handledPairs.has(key) || handledPairs.has(revKey)) continue;
    handledPairs.add(key);
    handledPairs.add(revKey);

    const revTotal = pairOpenTotals.get(revKey) || 0;
    const cancelAmt = Math.round(Math.min(fwdTotal, revTotal) * 100) / 100;
    if (cancelAmt <= 0.009) continue;

    for (const [f, t] of [
      [a, b],
      [b, a],
    ]) {
      let rem = cancelAmt;
      for (const os of openSplits) {
        if (rem <= 0.009) break;
        if (os.from !== f || os.to !== t) continue;
        const unpaid = os.owed - os.paid;
        if (unpaid <= 0.009) continue;
        const apply = Math.min(rem, unpaid);
        os.paid = Math.round((os.paid + apply) * 100) / 100;
        const hasPaid = os.paid >= os.owed - 0.009;
        virtualPaidById.set(os.id, { amount_paid: os.paid, has_paid: hasPaid });
        const existingIdx = updates.findIndex((u) => u.id === os.id);
        const nextEntry: SimplifiedSplitUpdate = {
          id: os.id,
          amount_paid: os.paid,
          has_paid: hasPaid,
          applied: Math.round(apply * 100) / 100,
        };
        if (existingIdx >= 0) updates[existingIdx] = nextEntry;
        else updates.push(nextEntry);
        rem -= apply;
      }
    }
  }

  return updates;
}
