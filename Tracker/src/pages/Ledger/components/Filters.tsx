import React, { ReactNode } from "react";
import { Filter } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const FilterTrigger = ({ count, onClick }: { count: number; onClick: () => void }) => (
  <button type="button" onClick={onClick} className="inline-flex items-center gap-1 text-xs font-bold text-primary">
    <Filter className="size-3.5" />Filter{count > 0 ? ` (${count})` : ""}
  </button>
);

export const FilterSheet = ({ open, onOpenChange, title, onClear, children }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; onClear: () => void; children: ReactNode }) => (
  <Drawer open={open} onOpenChange={onOpenChange}>
    <DrawerContent className="mx-auto flex flex-col max-h-[calc(100dvh_-_env(safe-area-inset-top)_-_0.75rem)] w-full max-w-3xl overflow-hidden rounded-t-3xl border-border bg-card px-4 pb-0">
      <DrawerHeader className="px-0 pb-3 pt-4 text-left">
        <DrawerTitle>{title}</DrawerTitle>
        <DrawerDescription>Filters update the list immediately.</DrawerDescription>
      </DrawerHeader>
      <div className="min-h-0 overflow-y-auto overscroll-contain pr-1">
        <div className="space-y-3 pb-4">
          {children}
        </div>
      </div>
      <div className="-mx-4 flex gap-2 border-t border-border/60 bg-card px-4 pb-[max(0.875rem,env(safe-area-inset-bottom))] pt-3">
        <Button type="button" variant="quiet" className="flex-1" onClick={onClear}>Clear filters</Button>
        <Button type="button" className="flex-1" onClick={() => onOpenChange(false)}>Apply</Button>
      </div>
    </DrawerContent>
  </Drawer>
);

export const AppSelect = ({ value, onChange, options, disabled, placeholder = "Select" }: { value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }>; disabled?: boolean; placeholder?: string }) => (
  <Select value={value} onValueChange={onChange} disabled={disabled}>
    <SelectTrigger className="min-h-11 rounded-full border-input bg-background px-4 py-3 text-sm font-normal focus:ring-2 focus:ring-inset focus:ring-ring focus:ring-offset-0">
      <SelectValue placeholder={placeholder} />
    </SelectTrigger>
    <SelectContent>
      {options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
    </SelectContent>
  </Select>
);

export const FilterField = ({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) => (
  <label className="block text-sm font-semibold text-foreground">
    {label}
    <div className="mt-2">
      <AppSelect value={value} onChange={onChange} options={options} />
    </div>
  </label>
);

export const FilterDateField = ({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) => (
  <label className="block min-w-0 text-xs font-semibold text-muted-foreground">
    <span className="mb-1 block">{label}</span>
    <span className="relative block">
      <input
        type="date"
        value={value}
        data-vaul-no-drag
        onClick={(e) => {
          try {
            if ("showPicker" in e.target) {
              (e.target as HTMLInputElement).showPicker();
            }
          } catch (err) {}
        }}
        onChange={(event) => onChange(event.target.value)}
        className={`block h-10 w-full min-w-0 rounded-full border border-input bg-background px-3 text-left text-xs font-medium outline-none [color-scheme:light] focus:ring-2 focus:ring-inset focus:ring-ring dark:[color-scheme:dark] text-foreground`}
      />
    </span>
  </label>
);

export const defaultDateFilterOptions = [
  { value: "all", label: "All dates" },
  { value: "today", label: "Today" },
  { value: "this_week", label: "This week" },
  { value: "this_month", label: "This month" },
  { value: "previous_month", label: "Previous month" },
  { value: "custom", label: "Custom date" },
];

export const DateFilterControls = ({
  value,
  start,
  end,
  onDateChange,
  onStartChange,
  onEndChange,
  options = defaultDateFilterOptions
}: {
  value: string;
  start?: string;
  end?: string;
  onDateChange: (value: string) => void;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  options?: Array<{ value: string; label: string }>;
}) => (
  <div className="space-y-2.5">
    <FilterField label="Date" value={value} onChange={onDateChange} options={options} />
    {value === "custom" ? (
      <div className="grid grid-cols-2 gap-2">
        <FilterDateField label="From" value={start || ""} onChange={onStartChange} />
        <FilterDateField label="To" value={end || ""} onChange={onEndChange} />
      </div>
    ) : null}
  </div>
);
