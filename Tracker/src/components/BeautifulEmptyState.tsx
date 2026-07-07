import React from "react";
import { Button } from "./ui/button";

interface BeautifulEmptyStateProps {
  icon?: React.ElementType;
  title: string;
  subtitle: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function BeautifulEmptyState({
  icon: Icon,
  title,
  subtitle,
  actionLabel,
  onAction,
}: BeautifulEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card p-8 text-center shadow-sm">
      {Icon && (
        <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="size-6" />
        </div>
      )}
      <h3 className="mb-1 text-base font-bold text-foreground">{title}</h3>
      <p className="mb-5 max-w-[250px] text-sm text-muted-foreground">{subtitle}</p>
      {actionLabel && onAction && (
        <Button onClick={onAction} variant="outline" className="rounded-full shadow-sm">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
