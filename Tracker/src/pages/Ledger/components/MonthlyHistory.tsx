// ============================================================
// Budget Ledger – Monthly History Drawer
// ============================================================

import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { TrendingUp, PiggyBank, History } from "lucide-react";
import type { LedgerMonthlyClosure } from "../types";
import { MONTH_NAMES } from "../types";
import { money } from "../utils";

interface MonthlyHistoryDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  monthlyClosures: LedgerMonthlyClosure[];
  totalSavings: number;
  ledgerName: string;
}

const MonthRow = ({ closure }: { closure: LedgerMonthlyClosure }) => {
  const monthName = MONTH_NAMES[(closure.month ?? 1) - 1];
  const saved = closure.saved_amount;
  const deficit = closure.deficit;

  return (
    <div className="rounded-2xl bg-card p-4 shadow-soft">
      <div className="flex items-center justify-between">
        <span className="text-base font-bold text-foreground">
          {monthName} {closure.year}
        </span>
        {saved > 0 && (
          <span className="flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-1 text-xs font-bold text-success">
            <PiggyBank className="size-3" />
            +{money(saved)}
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div className="flex flex-col">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Savings</p>
          <p className="mt-0.5 text-sm font-black text-success">{money(saved)}</p>
        </div>
        <div className="flex flex-col text-right">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Deficit</p>
          <p className="mt-0.5 text-sm font-black text-destructive">{money(deficit)}</p>
        </div>
      </div>
    </div>
  );
};

export const MonthlyHistoryDrawer = ({
  open,
  onOpenChange,
  monthlyClosures,
  totalSavings,
  ledgerName,
}: MonthlyHistoryDrawerProps) => (
  <Drawer open={open} onOpenChange={onOpenChange}>
    <DrawerContent className="mx-auto flex max-h-[calc(100svh_-_env(safe-area-inset-top)_-_0.75rem)] max-h-[calc(100dvh_-_env(safe-area-inset-top)_-_0.75rem)] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border-border bg-card px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
      <DrawerHeader className="shrink-0 px-0 pb-2 text-left">
        <DrawerTitle>Monthly History</DrawerTitle>
        <DrawerDescription>Past months for {ledgerName}</DrawerDescription>
      </DrawerHeader>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {totalSavings > 0 && (
          <div className="mb-4 shrink-0 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 p-4 border border-primary/10">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-primary">
                  Total Accumulated Savings
                </p>
                <p className="mt-0.5 text-2xl font-black text-foreground">
                  {money(totalSavings)}
                </p>
              </div>
              <div className="flex size-12 items-center justify-center rounded-full bg-primary/20 text-primary">
                <TrendingUp className="size-6" />
              </div>
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
          <div className="space-y-3 pb-4">
            {monthlyClosures.length === 0 ? (
              <div className="rounded-[1.25rem] bg-elevated p-6 text-center shadow-soft">
                <div className="mx-auto grid size-14 place-items-center rounded-full bg-primary/15 text-primary">
                  <History className="size-7" />
                </div>
                <p className="mt-4 text-base font-black text-foreground">No history yet</p>
                <p className="mt-1 text-sm font-medium text-muted-foreground">
                  Past months will appear here after they are closed.
                </p>
              </div>
            ) : (
              monthlyClosures.map((closure) => (
                <MonthRow key={closure.id} closure={closure} />
              ))
            )}
          </div>
        </div>
      </div>

      <div className="shrink-0 border-t border-border/60 bg-card pt-3">
        <Button
          variant="quiet"
          className="w-full h-12 rounded-full"
          onClick={() => onOpenChange(false)}
        >
          Close
        </Button>
      </div>
    </DrawerContent>
  </Drawer>
);
