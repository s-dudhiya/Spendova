import assert from "node:assert/strict";
import {
  getSpendingChartAverageLabel,
  getSpendingChartAxisLabels,
  getSpendingChartSummary,
  MAX_SPENDING_CHART_AXIS_LABELS,
} from "../src/lib/spending-chart.ts";

const timeline = (count, label = (index) => `Day ${index + 1}`) => Array.from({ length: count }, (_, index) => ({
  date: new Date(2026, 0, index + 1),
  label: label(index),
  value: index + 1,
}));

const cases = [
  ["today", timeline(1)],
  ["this week", timeline(7, (index) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][index])],
  ["this month", timeline(30)],
  ["last month", timeline(31)],
  ["custom high range", timeline(120, (index) => `Week ${index + 1}`)],
  ["all time", timeline(84, (index) => `${2020 + index}`)],
  ["empty data", []],
  ["single expense", timeline(1)],
  ["many expenses on same day", [{ date: new Date(2026, 0, 1), label: "1 Jan", value: 550 }]],
  ["expenses spread across many dates", timeline(365, (index) => `Month ${index + 1}`)],
];

for (const [name, data] of cases) {
  const labels = getSpendingChartAxisLabels(data);
  const expectedMaxLabels = data.length <= 7 ? data.length : MAX_SPENDING_CHART_AXIS_LABELS;
  assert.ok(labels.length <= expectedMaxLabels, `${name}: label count is bounded`);
  assert.equal(new Set(labels.map((item) => item.index)).size, labels.length, `${name}: label positions are unique`);
  if (data.length > 0) {
    assert.equal(labels[0].index, 0, `${name}: first label remains visible`);
    assert.equal(labels.at(-1).index, data.length - 1, `${name}: last label remains visible`);
  }
  console.log(`ok - ${name}`);
}

assert.deepEqual(
  getSpendingChartAxisLabels(timeline(7, (index) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][index])).map((item) => item.label),
  ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
);

const summary = getSpendingChartSummary([{ value: 25 }, { value: 75 }, { value: 50 }, { value: 50 }]);
assert.deepEqual(summary, { total: 200, average: 50 });
assert.deepEqual(getSpendingChartSummary([]), { total: 0, average: 0 });
assert.equal(getSpendingChartAverageLabel("day"), "Avg. per day");
assert.equal(getSpendingChartAverageLabel("week"), "Avg. per week");
assert.equal(getSpendingChartAverageLabel("month"), "Avg. per month");
assert.equal(getSpendingChartAverageLabel("year"), "Avg. per year");
console.log("ok - totals and per-period averages");
