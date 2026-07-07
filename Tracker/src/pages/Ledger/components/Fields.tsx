import React, { ReactNode } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Field = ({
  label,
  hint,
  type = "text",
  className = "",
  ...props
}: {
  label: string;
  hint?: ReactNode;
  type?: string;
  className?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) => (
  <label className={`block text-sm font-semibold text-foreground ${className}`}>
    {label}
    <input
      type={type}
      className="mt-2 block min-h-11 min-w-0 max-w-full w-full rounded-full border border-input bg-background px-4 py-3 text-sm font-normal outline-none focus:ring-2 focus:ring-inset focus:ring-ring focus:ring-offset-0 disabled:opacity-50"
      {...props}
    />
    {hint && <div className="mt-1.5 text-xs font-medium text-muted-foreground">{hint}</div>}
  </label>
);

export const Textarea = ({
  label,
  hint,
  className = "",
  ...props
}: {
  label: string;
  hint?: ReactNode;
  className?: string;
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <label className={`block text-sm font-semibold text-foreground ${className}`}>
    {label}
    <textarea
      className="mt-2 block w-full rounded-3xl border border-input bg-background px-4 py-3 text-sm font-normal outline-none focus:ring-2 focus:ring-inset focus:ring-ring focus:ring-offset-0 disabled:opacity-50"
      {...props}
    />
    {hint && <div className="mt-1.5 text-xs font-medium text-muted-foreground">{hint}</div>}
  </label>
);

export const SelectField = ({
  label,
  hint,
  value,
  onChange,
  options,
  placeholder,
  disabled,
  className = "",
}: {
  label: string;
  hint?: ReactNode;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) => (
  <label className={`block text-sm font-semibold text-foreground ${className}`}>
    {label}
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="mt-2 min-h-11 rounded-full border-input bg-background px-4 py-3 text-sm font-normal focus:ring-2 focus:ring-inset focus:ring-ring focus:ring-offset-0">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
    {hint && <div className="mt-1.5 text-xs font-medium text-muted-foreground">{hint}</div>}
  </label>
);
