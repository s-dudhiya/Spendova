import assert from "node:assert/strict";

const toPaise = (amount) => Math.round((Number.isFinite(amount) ? amount : 0) * 100);
const fromPaise = (paise) => Number((paise / 100).toFixed(2));

const allocateSharesSplitDebts = (
  amount,
  participantIds,
  payerId,
  sharesByUserId
) => {
  const totalPaise = toPaise(amount);
  const count = participantIds.length;
  if (!count) return [];

  const sharesList = participantIds.map((user_id) => {
    const raw = sharesByUserId[user_id];
    const val = raw !== undefined && raw !== "" ? Number(raw) : 1;
    const shares = Number.isFinite(val) && val >= 0 ? val : 1;
    return { user_id, shares };
  });

  const totalShares = sharesList.reduce((sum, item) => sum + item.shares, 0);
  if (totalShares <= 0) return [];

  let allocatedPaise = 0;
  const splitCalculations = sharesList.map((item) => {
    const paise = Math.round((totalPaise * item.shares) / totalShares);
    allocatedPaise += paise;
    return { user_id: item.user_id, shares: item.shares, paise };
  });

  // Distribute rounding remainder (in paise) to members with non-zero shares
  let remainder = totalPaise - allocatedPaise;
  if (remainder !== 0) {
    for (const item of splitCalculations) {
      if (item.shares > 0) {
        const adjustment = remainder > 0 ? 1 : -1;
        item.paise += adjustment;
        remainder -= adjustment;
        if (remainder === 0) break;
      }
    }
  }

  return splitCalculations
    .map((item) => ({
      user_id: item.user_id,
      amount_owed: fromPaise(item.paise),
    }))
    .filter((split) => split.user_id !== payerId && split.amount_owed > 0);
};

// Test 1: User's exact example:
// 3 persons: Person 1 (payer) has 1 share, Person 2 has 1 share, Person 3 has 2 shares.
// Amount = 100.
// Total shares = 4.
// Person 1 (payer) owes 25 (paid 100, payer gets back 75).
// Person 2 owes 25.
// Person 3 owes 50.
const splits1 = allocateSharesSplitDebts(
  100,
  ["p1", "p2", "p3"],
  "p1",
  { p1: 1, p2: 1, p3: 2 }
);
assert.deepEqual(splits1, [
  { user_id: "p2", amount_owed: 25 },
  { user_id: "p3", amount_owed: 50 },
]);
console.log("ok - 3 persons 1,1,2 shares with $100 correctly allocates 25 and 50");

// Test 2: Default shares (1 each):
// Equivalent to equal split of 100 among 3: 33.34, 33.33, 33.33
const splits2 = allocateSharesSplitDebts(
  100,
  ["p1", "p2", "p3"],
  "p1",
  {} // empty object defaults to 1 share each
);
assert.equal(splits2.length, 2);
assert.equal(splits2[0].amount_owed + splits2[1].amount_owed, 66.66); // 100 - 33.34 = 66.66
console.log("ok - default shares correctly defaults each person to 1 share");

// Test 3: Someone with 0 shares:
const splits3 = allocateSharesSplitDebts(
  100,
  ["p1", "p2", "p3"],
  "p1",
  { p1: 1, p2: 0, p3: 1 }
);
assert.deepEqual(splits3, [
  { user_id: "p3", amount_owed: 50 },
]);
console.log("ok - 0 shares participant owes 0");
