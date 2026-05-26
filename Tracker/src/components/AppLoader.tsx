import { CircleDollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";

type AppLoaderProps = {
  message?: string;
  showFallbackActions?: boolean;
  onRetry?: () => void;
  onGoToLogin?: () => void;
};

export const AppLoader = ({
  message = "Preparing your workspace...",
  showFallbackActions = false,
  onRetry,
  onGoToLogin,
}: AppLoaderProps) => (
  <main className="grid min-h-screen place-items-center bg-background px-5 text-foreground [padding-bottom:calc(1.25rem+env(safe-area-inset-bottom))] [padding-top:calc(1.25rem+env(safe-area-inset-top))]">
    <section className="flex w-full max-w-sm flex-col items-center text-center">
      <div className="relative grid size-20 place-items-center sm:size-24">
        <span className="absolute inset-0 rounded-full border border-primary/15" />
        <span className="absolute inset-1 rounded-full border border-primary/25 border-t-primary/70 animate-[spin_2.8s_linear_infinite]" />
        <span className="grid size-16 animate-[spendova-pulse_2.4s_ease-in-out_infinite] place-items-center rounded-full bg-card text-primary shadow-panel sm:size-20">
          <CircleDollarSign className="size-8 sm:size-9" strokeWidth={1.8} />
        </span>
      </div>

      <h1 className="mt-5 text-2xl font-black tracking-tight text-foreground">Spendova</h1>
      <p className="mt-2 text-sm font-semibold leading-6 text-muted-foreground">{message}</p>

      <div className="mt-5 flex items-center gap-1.5" aria-hidden="true">
        <span className="size-1.5 animate-[spendova-dot_1.2s_ease-in-out_infinite] rounded-full bg-primary/45" />
        <span className="size-1.5 animate-[spendova-dot_1.2s_ease-in-out_0.18s_infinite] rounded-full bg-primary/45" />
        <span className="size-1.5 animate-[spendova-dot_1.2s_ease-in-out_0.36s_infinite] rounded-full bg-primary/45" />
      </div>

      {showFallbackActions ? (
        <div className="mt-7 grid w-full gap-2">
          <Button onClick={onRetry} className="h-11 rounded-full shadow-primary-action">Retry</Button>
          <Button onClick={onGoToLogin} variant="quiet" className="h-11 rounded-full">Go to Login</Button>
        </div>
      ) : null}
    </section>
  </main>
);

export default AppLoader;
