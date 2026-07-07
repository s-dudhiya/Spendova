import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { User, Users, Home, Wallet, ChevronRight } from "lucide-react";

export type UniversalAddOption = "personal" | "friend" | "group" | "ledger";

interface UniversalAddDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectOption: (option: UniversalAddOption) => void;
}

export function UniversalAddDrawer({ open, onOpenChange, onSelectOption }: UniversalAddDrawerProps) {
  const options = [
    {
      id: "personal" as const,
      title: "Personal Expense",
      desc: "Track a personal, un-split expense",
      icon: User,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      id: "friend" as const,
      title: "Split with Friend",
      desc: "Add an expense to split with a friend",
      icon: Users,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      id: "group" as const,
      title: "Group Expense",
      desc: "Add an expense to a Split group",
      icon: Home,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      id: "ledger" as const,
      title: "Ledger Expense",
      desc: "Log an expense to a shared budget",
      icon: Wallet,
      color: "text-primary",
      bg: "bg-primary/10",
    },
  ];

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto flex flex-col max-h-[calc(100dvh_-_env(safe-area-inset-top)_-_0.75rem)] w-full max-w-3xl overflow-hidden rounded-t-3xl border-border bg-card px-4 pb-0">
        <DrawerHeader className="px-0 pb-3 pt-4 text-left">
          <DrawerTitle className="text-xl font-bold">What would you like to add?</DrawerTitle>
        </DrawerHeader>
        <div className="space-y-3 pb-8 pt-2">
          {options.map((opt) => {
            const Icon = opt.icon;
            return (
              <button
                key={opt.id}
                type="button"
                className="flex w-full items-center justify-between rounded-2xl border border-border/50 bg-elevated p-4 text-left shadow-soft transition-colors hover:bg-elevated/80 active:scale-[0.98]"
                onClick={() => {
                  onSelectOption(opt.id);
                  onOpenChange(false);
                }}
              >
                <div className="flex items-center gap-4">
                  <div className={`grid size-12 place-items-center rounded-full ${opt.bg} ${opt.color}`}>
                    <Icon className="size-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground">{opt.title}</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">{opt.desc}</p>
                  </div>
                </div>
                <ChevronRight className="size-5 text-muted-foreground/50" />
              </button>
            );
          })}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
