import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { BrowserRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { Fingerprint, LockKeyhole, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { registerBackHandler } from "@/lib/back-handler";
import { ForceUpdateModal } from "@/components/ForceUpdateModal";
import { normalizePhone } from "@/lib/phone";
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
const CACHE_VERSION = "v2.4.5-cache-bust-20261124";

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

const PhoneCompletionGate = ({ children }: { children: React.ReactNode }) => {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const [checking, setChecking] = useState(true);
  const [needsPhone, setNeedsPhone] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    if (!user) {
      setChecking(false);
      setNeedsPhone(false);
      return;
    }

    setChecking(true);
    supabase
      .from("profiles")
      .select("phone")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data, error: fetchErr }) => {
        if (!active) return;
        if (fetchErr) {
          console.warn("Phone check failed:", fetchErr.message);
          setNeedsPhone(false);
        } else {
          setNeedsPhone(!data?.phone);
        }
        setChecking(false);
      });

    return () => {
      active = false;
    };
  }, [user]);

  const handleSavePhone = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;
    setError("");

    const normalized = normalizePhone(phoneInput);
    if (!normalized) {
      setError("Please enter a valid 10-digit mobile number (e.g. 9876543210).");
      return;
    }

    setSaving(true);
    try {
      const { data: available, error: checkErr } = await (supabase.rpc as any)("is_phone_available", {
        target_phone: normalized,
      });
      if (!checkErr && available === false) {
        setError("This mobile number is already linked to another Spendova account.");
        setSaving(false);
        return;
      }

      const { error: updateErr } = await supabase
        .from("profiles")
        .update({ phone: normalized })
        .eq("user_id", user.id);

      if (updateErr) {
        if (updateErr.code === "23505") {
          setError("This mobile number is already linked to another Spendova account.");
        } else {
          setError(updateErr.message || "Could not save mobile number.");
        }
        return;
      }

      toast({ title: "Mobile number saved", description: "You can now find friends from your contacts." });
      setNeedsPhone(false);
    } catch (err: any) {
      setError(err?.message || "Failed to save mobile number.");
    } finally {
      setSaving(false);
    }
  };

  if (checking) return <LoadingFallback />;
  if (!needsPhone) return <>{children}</>;

  return (
    <main className="grid min-h-screen place-items-center bg-background px-5 text-foreground">
      <section className="w-full max-w-sm rounded-[1.25rem] bg-card p-6 text-center shadow-panel">
        <div className="mx-auto grid size-16 place-items-center rounded-full bg-primary/15 text-primary">
          <Phone className="size-7" />
        </div>
        <h1 className="mt-5 text-2xl font-bold tracking-tight">Add your mobile number</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Link your mobile number to continue using Spendova, find friends from contacts, and receive payment reminders.
        </p>
        <form onSubmit={handleSavePhone} className="mt-5 space-y-3 text-left">
          <Input
            type="tel"
            required
            value={phoneInput}
            onChange={(e) => setPhoneInput(e.target.value.replace(/[^\d+\s-]/g, ""))}
            placeholder="e.g. 9876543210 or +91 9876543210"
            className="h-12 rounded-xl bg-elevated px-4 text-sm font-medium"
          />
          {error && <p className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">{error}</p>}
          <Button type="submit" disabled={saving} className="h-12 w-full rounded-full shadow-primary-action">
            {saving ? "Saving..." : "Continue"}
          </Button>
        </form>
        <button type="button" onClick={signOut} className="mt-4 text-sm font-bold text-muted-foreground">
          Sign out
        </button>
      </section>
    </main>
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
  return (
    <PhoneCompletionGate>
      <Index />
    </PhoneCompletionGate>
  );
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

const AppRoutes = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [maintenance, setMaintenance] = useState(false);
  const isAdminRoute = location.pathname.startsWith("/admin");

  useEffect(() => {
    return registerBackHandler(() => {
      const path = location.pathname;
      if (
        path === "/register" ||
        path === "/forgot-password" ||
        path === "/reset-password" ||
        path === "/verify-otp"
      ) {
        navigate("/login");
        return true;
      }
      return false;
    });
  }, [location.pathname, navigate]);

  useEffect(() => {
    let active = true;
    const fetchSiteSettings = async () => {
      try {
        bootLog("site_settings check start");
        type SiteSettingsQueryBuilder = {
          select: (cols: string) => {
            eq: (col: string, val: number | string) => {
              single: () => PromiseLike<{ data: { is_maintenance_mode?: boolean | null } | null; error: { message: string } | null }>;
            };
          };
        };
        const settingsTable = (supabase as unknown as { from: (name: string) => SiteSettingsQueryBuilder }).from("site_settings");
        const { data, error } = await withTimeout(
          settingsTable
            .select("is_maintenance_mode")
            .eq("id", 1)
            .single(),
          5000,
          "site_settings check"
        );
        if (error) throw error;
        if (active && data) {
          setMaintenance(Boolean(data.is_maintenance_mode));
        }
      } catch (error) {
        console.error("Failed to check site settings", error);
        if (active) setMaintenance(false);
      }
    };

    fetchSiteSettings();
    const interval = window.setInterval(fetchSiteSettings, 30000);

    // Instant Realtime updates for maintenance mode
    const channel = supabase
      .channel("site-settings-maintenance")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "site_settings", filter: "id=eq.1" },
        (payload) => {
          const row = payload.new as { is_maintenance_mode?: boolean } | null;
          if (row && active) {
            setMaintenance(Boolean(row.is_maintenance_mode));
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
            <ForceUpdateModal />
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
