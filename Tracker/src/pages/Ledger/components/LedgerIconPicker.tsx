import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { LEDGER_ICONS, DEFAULT_LEDGER_ICON } from "./LedgerIcon";
import { ChevronDown } from "lucide-react";

export const LedgerIconPicker = ({
  icon,
  onIconChange,
}: {
  icon: string | null;
  onIconChange: (icon: string) => void;
}) => {
  const [open, setOpen] = useState(false);

  const activeIconKey = icon || DEFAULT_LEDGER_ICON;
  const ActiveIcon = LEDGER_ICONS[activeIconKey] || LEDGER_ICONS[DEFAULT_LEDGER_ICON];

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-bold text-foreground">Icon</label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex h-[44px] w-full items-center justify-between rounded-full border border-input bg-background px-4 py-2 text-sm text-foreground hover:bg-elevated transition-colors"
          >
            <div className="flex items-center gap-3">
              <ActiveIcon className="size-5 text-primary" />
              <span className="capitalize">{activeIconKey}</span>
            </div>
            <ChevronDown className="size-4 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[280px] p-3 rounded-2xl" align="start">
          <div className="grid grid-cols-5 gap-2">
            {Object.entries(LEDGER_ICONS).map(([key, Icon]) => (
              <button
                key={key}
                type="button"
                className={`grid aspect-square place-items-center rounded-xl transition-colors ${
                  activeIconKey === key
                    ? "bg-primary text-primary-foreground shadow-primary-action"
                    : "bg-elevated text-muted-foreground hover:bg-primary/10 hover:text-primary"
                }`}
                onClick={() => {
                  onIconChange(key);
                  setOpen(false);
                }}
                title={key}
              >
                <Icon className="size-5" />
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};
