import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { AlertTriangle, Bell, Fingerprint, LockKeyhole, Radio, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppLoader } from "@/components/AppLoader";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { consumeFreshLoginUnlocked, isBiometricLockEnabled, unlockWithBiometric } from "@/lib/biometric-lock";
import { getFriendlyErrorMessage } from "@/lib/friendly-error";
import { bootLog, safeStorage, withTimeout } from "@/lib/startup-safety";
import { initializeNotifications } from "@/lib/notifications";
import Auth from "./pages/Auth";

const Admin = lazy(() => import("./pages/Admin"));
const Index = lazy(() => import("./pages/Index"));
const InviteAccept = lazy(() => import("./pages/InviteAccept"));
const InviteLedgerAccept = lazy(() => import("./pages/Ledger/InviteLedgerAccept"));
const Maintenance = lazy(() => import("./pages/Maintenance"));
const NotFound = lazy(() => import("./pages/NotFound"));
const VerifyOtp = lazy(() => import("./pages/VerifyOtp"));

const queryClient = new QueryClient();
const STARTUP_FALLBACK_DELAY = 5000;
const CACHE_VERSION_KEY = "spendova_cache_version";
const CACHE_VERSION = "startup-resume-fix-20260526";

const clearSessionAndRestart = async () => {
  await supabase.auth.signOut().catch(() => undefined);
  window.location.assign("/login");
};

const LoadingFallback = ({ label = "Preparing your workspace..." }: { label?: string }) => {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setSlow(true), STARTUP_FALLBACK_DELAY);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <AppLoader
      message={slow ? "Taking longer than expected..." : label}
      showFallbackActions={slow}
      onRetry={() => window.location.reload()}
      onGoToLogin={clearSessionAndRestart}
    />
  );
};

const ProtectedIndex = () => {
  const { user, loading } = useAuth();
  
  useEffect(() => {
    if (user) {
      initializeNotifications(user.id);
    }
  }, [user]);

  if (loading) return <LoadingFallback />;
  if (!user) return <Auth mode="login" />;
  return <Index />;
};

const BiometricLockGate = ({ children }: { children: React.ReactNode }) => {
  const { user, loading, signOut } = useAuth();
  const { toast } = useToast();
  const [unlocked, setUnlocked] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState("");
  const [showFallbackUnlock, setShowFallbackUnlock] = useState(false);
  const hasAutoPromptedRef = useRef(false);
  const freshLoginUnlockedRef = useRef(false);
  const needsUnlock = Boolean(user && isBiometricLockEnabled(user.id) && !unlocked);

  useEffect(() => {
    setUnlocked(false);
    setError("");
    setShowFallbackUnlock(false);
    hasAutoPromptedRef.current = false;
    freshLoginUnlockedRef.current = false;
  }, [user?.id]);

  useEffect(() => {
    if (user && consumeFreshLoginUnlocked(user.id)) {
      freshLoginUnlockedRef.current = true;
      setUnlocked(true);
    }
  }, [user]);

  const unlock = useCallback(async () => {
    if (!user) return;
    setUnlocking(true);
    setError("");
    try {
      const success = await unlockWithBiometric(user.id);
      if (!success) throw new Error("Unlock was cancelled.");
      setUnlocked(true);
      setShowFallbackUnlock(false);
    } catch (unlockError) {
      console.error("Biometric unlock failed", unlockError);
      const message = getFriendlyErrorMessage(unlockError, "device");
      setError(message);
      setShowFallbackUnlock(true);
      toast({ title: "Unlock failed", description: message });
    } finally {
      setUnlocking(false);
    }
  }, [toast, user]);

  useEffect(() => {
    if (loading || !needsUnlock || !user || unlocking || hasAutoPromptedRef.current || freshLoginUnlockedRef.current) return;
    hasAutoPromptedRef.current = true;
    void unlock();
  }, [loading, needsUnlock, unlock, unlocking, user]);

  if (loading || !needsUnlock) return <>{children}</>;

  if (!showFallbackUnlock) {
    return (
      <main className="grid min-h-screen place-items-center bg-background px-5 text-foreground">
        <div className="grid place-items-center gap-3 text-center">
          <div className="size-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
          <p className="text-sm font-semibold text-muted-foreground">Preparing secure unlock...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="grid min-h-screen place-items-center bg-background px-5 text-foreground">
      <section className="w-full max-w-sm rounded-[1.25rem] bg-card p-6 text-center shadow-panel">
        <div className="mx-auto grid size-16 place-items-center rounded-full bg-primary/15 text-primary">
          <LockKeyhole className="size-7" />
        </div>
        <h1 className="mt-5 text-2xl font-bold tracking-tight">Unlock Spendova</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Use your device fingerprint, Face ID, Touch ID, or screen lock to continue.</p>
        {error && <p className="mt-4 rounded-2xl bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">{error}</p>}
        <Button onClick={unlock} disabled={unlocking} className="mt-5 h-12 w-full rounded-full shadow-primary-action">
          <Fingerprint className="size-4" />
          {unlocking ? "Unlocking..." : "Unlock"}
        </Button>
        <button onClick={signOut} className="mt-4 text-sm font-bold text-muted-foreground">Sign out</button>
      </section>
    </main>
  );
};

interface AnnouncementState {
  active: boolean;
  message: string;
  level: "info" | "warning" | "emergency";
  updatedAt?: string;
}

interface SiteSettingsRow {
  id?: number;
  is_maintenance_mode?: boolean | null;
  announcement_active?: boolean | null;
  announcement_message?: string | null;
  announcement_level?: AnnouncementState["level"] | null;
  announcement_updated_at?: string | null;
}

const GlobalAnnouncementBanner = ({ announcement }: { announcement: AnnouncementState }) => {
  const [dismissed, setDismissed] = useState(false);
  const storageKey = `spendova_announcement_dismissed_${announcement.updatedAt || "v1"}`;

  useEffect(() => {
    // Emergency alerts can never be dismissed
    if (announcement.level === "emergency") {
      setDismissed(false);
      return;
    }
    const isDismissed = safeStorage.getItem(storageKey) === "true";
    setDismissed(isDismissed);
  }, [announcement.updatedAt, announcement.level, storageKey]);

  if (!announcement.active || !announcement.message || dismissed) return null;

  const handleDismiss = () => {
    safeStorage.setItem(storageKey, "true");
    setDismissed(true);
  };

  const isEmergency = announcement.level === "emergency";
  const isWarning = announcement.level === "warning";

  return (
    <div
      role="alert"
      className={`relative z-50 w-full px-3 py-2 text-xs sm:text-sm font-medium transition-all shadow-md ${
        isEmergency
          ? "bg-gradient-to-r from-red-600 via-rose-600 to-red-600 text-white animate-pulse"
          : isWarning
          ? "bg-gradient-to-r from-amber-600 via-yellow-600 to-amber-600 text-white"
          : "bg-gradient-to-r from-violet-600 via-primary to-indigo-600 text-white"
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-white/20">
            {isEmergency ? (
              <Radio className="size-3.5 text-white animate-ping" />
            ) : isWarning ? (
              <AlertTriangle className="size-3.5 text-white" />
            ) : (
              <Bell className="size-3.5 text-white" />
            )}
          </span>
          <div className="min-w-0">
            <span className="mr-2 inline-block rounded-md bg-white/25 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white">
              {isEmergency ? "Priority Emergency" : isWarning ? "System Notice" : "Spendova Update"}
            </span>
            <span className="truncate leading-tight text-white drop-shadow-sm font-semibold">
              {announcement.message}
            </span>
          </div>
        </div>

        {!isEmergency && (
          <button
            type="button"
            onClick={handleDismiss}
            className="grid size-6 shrink-0 place-items-center rounded-lg bg-white/10 text-white hover:bg-white/20 transition"
            aria-label="Dismiss announcement"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};

const AppRoutes = () => {
  const location = useLocation();
  const [maintenance, setMaintenance] = useState(false);
  const [announcement, setAnnouncement] = useState<AnnouncementState>({
    active: false,
    message: "",
    level: "info",
  });
  const isAdminRoute = location.pathname.startsWith("/admin");

  useEffect(() => {
    let active = true;
    const fetchSiteSettings = async () => {
      try {
        bootLog("site_settings check start");
        type SiteSettingsQueryBuilder = {
          select: (cols: string) => {
            eq: (col: string, val: number | string) => {
              single: () => PromiseLike<{ data: SiteSettingsRow | null; error: { message: string } | null }>;
            };
          };
        };
        const settingsTable = (supabase as unknown as { from: (name: string) => SiteSettingsQueryBuilder }).from("site_settings");
        const { data, error } = await withTimeout(
          settingsTable
            .select("is_maintenance_mode, announcement_active, announcement_message, announcement_level, announcement_updated_at")
            .eq("id", 1)
            .single(),
          5000,
          "site_settings check"
        );
        if (error) throw error;
        const settings = data;
        if (active && settings) {
          setMaintenance(Boolean(settings.is_maintenance_mode));
          setAnnouncement({
            active: Boolean(settings.announcement_active),
            message: settings.announcement_message || "",
            level: settings.announcement_level || "info",
            updatedAt: settings.announcement_updated_at || undefined,
          });
        }
      } catch (error) {
        console.error("Failed to check site settings", error);
        if (active) setMaintenance(false);
      }
    };

    fetchSiteSettings();
    const interval = window.setInterval(fetchSiteSettings, 30000);

    // Instant Realtime updates for emergency announcements
    const channel = supabase
      .channel("site-settings-announcements")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "site_settings", filter: "id=eq.1" },
        (payload) => {
          const row = payload.new as SiteSettingsRow | null;
          if (row && active) {
            setMaintenance(Boolean(row.is_maintenance_mode));
            setAnnouncement({
              active: Boolean(row.announcement_active),
              message: row.announcement_message || "",
              level: row.announcement_level || "info",
              updatedAt: row.announcement_updated_at || undefined,
            });
          }
        }
      )
      .subscribe();

    return () => {
      active = false;
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, []);

  if (maintenance && !isAdminRoute) {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <Maintenance />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<LoadingFallback />}>
      {!isAdminRoute && <GlobalAnnouncementBanner announcement={announcement} />}
      <Routes>
        <Route path="/" element={<ProtectedIndex />} />
        <Route path="/dashboard" element={<ProtectedIndex />} />
        <Route path="/ledger/:id" element={<ProtectedIndex />} />
        <Route path="/profile" element={<ProtectedIndex />} />
        <Route path="/split" element={<ProtectedIndex />} />
        <Route path="/split/friend/:id" element={<ProtectedIndex />} />
        <Route path="/split/group/:id" element={<ProtectedIndex />} />
        <Route path="/split/expense/:id" element={<ProtectedIndex />} />
        <Route path="/split/settlement/:id" element={<ProtectedIndex />} />
        <Route path="/admin" element={<Admin view="root" />} />
        <Route path="/admin/login" element={<Admin view="login" />} />
        <Route path="/admin/dashboard" element={<Admin view="dashboard" />} />
        <Route path="/login" element={<Auth mode="login" />} />
        <Route path="/register" element={<Auth mode="register" />} />
        <Route path="/forgot-password" element={<Auth mode="forgot" />} />
        <Route path="/reset-password" element={<Auth mode="reset" />} />
        <Route path="/verify-otp" element={<VerifyOtp />} />
        <Route path="/auth" element={<Auth mode="login" />} />
        <Route path="/invite" element={<InviteAccept />} />
        <Route path="/accept-invite" element={<InviteAccept />} />
        <Route path="/invite-ledger" element={<InviteLedgerAccept />} />
        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
};

const App = () => {
  useEffect(() => {
    bootLog("app boot start");
    const currentVersion = safeStorage.getItem(CACHE_VERSION_KEY);
    if (currentVersion === CACHE_VERSION) return;
    safeStorage.setItem(CACHE_VERSION_KEY, CACHE_VERSION);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations()
        .then((registrations) => registrations.forEach((registration) => registration.unregister()))
        .catch((error) => console.warn("Service worker cleanup failed", error));
    }
    if ("caches" in window) {
      caches.keys()
        .then((keys) => keys.forEach((key) => caches.delete(key)))
        .catch((error) => console.warn("Cache cleanup failed", error));
    }
  }, []);

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <BiometricLockGate>
                <AppRoutes />
              </BiometricLockGate>
            </BrowserRouter>
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
};

export default App;
