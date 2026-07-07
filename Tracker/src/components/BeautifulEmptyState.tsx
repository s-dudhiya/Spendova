import React from "react";
import { Button } from "./ui/button";

interface BeautifulEmptyStateProps {
  icon: string;
  title: string;
  subtitle: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function BeautifulEmptyState({
  icon,
  title,
  subtitle,
  actionLabel,
  onAction,
}: BeautifulEmptyStateProps) {
  return (
    <div className="flex min-h-[300px] flex-col items-center justify-center rounded-3xl border border-dashed border-border/60 bg-card p-8 text-center shadow-sm">
      <div className="mb-4 grid size-16 place-items-center rounded-full bg-elevated text-3xl shadow-soft">
        {icon}
      </div>
      <h3 className="mb-1 text-lg font-bold text-foreground">{title}</h3>
      <p className="mb-6 max-w-[250px] text-sm text-muted-foreground">{subtitle}</p>
      {actionLabel && onAction && (
        <Button onClick={onAction} className="rounded-full px-6 shadow-primary-action">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
