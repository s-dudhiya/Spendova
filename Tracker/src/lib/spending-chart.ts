export type SpendingChartBucketUnit = "day" | "week" | "month" | "year";

export type SpendingChartTimelineItem = {
  label: string;
  date: Date;
};

export const MAX_SPENDING_CHART_AXIS_LABELS = 5;

export function getSpendingChartAxisLabels(
  chartData: SpendingChartTimelineItem[],
  maxLabels = MAX_SPENDING_CHART_AXIS_LABELS,
) {
  if (chartData.length === 0 || maxLabels <= 0) return [];
  const labelCount = chartData.length;
  if (labelCount === 1) return [{ index: 0, label: chartData[0].label, position: 0 }];

  return Array.from({ length: labelCount }, (_, slot) => {
    const index = Math.round((slot * (chartData.length - 1)) / (labelCount - 1));
    return {
      index,
      label: chartData[index].label,
      position: (index / (chartData.length - 1)) * 100,
    };
  });
}

export function getSpendingChartSummary(chartData: Array<{ value: number }>) {
  const total = chartData.reduce((sum, item) => sum + item.value, 0);
  return {
    total,
    average: total / Math.max(chartData.length, 1),
  };
}

export function getSpendingChartAverageLabel(unit?: SpendingChartBucketUnit) {
  if (unit === "year") return "Avg. per year";
  if (unit === "month") return "Avg. per month";
  if (unit === "week") return "Avg. per week";
  return "Avg. per day";
}
