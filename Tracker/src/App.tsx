import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { Fingerprint, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { consumeFreshLoginUnlocked, isBiometricLockEnabled, unlockWithBiometric } from "@/lib/biometric-lock";
import Auth from "./pages/Auth.tsx";

const Admin = lazy(() => import("./pages/Admin.tsx"));
const Index = lazy(() => import("./pages/Index.tsx"));
const InviteAccept = lazy(() => import("./pages/InviteAccept.tsx"));
const Maintenance = lazy(() => import("./pages/Maintenance.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));
const VerifyOtp = lazy(() => import("./pages/VerifyOtp.tsx"));

const queryClient = new QueryClient();

const ProtectedIndex = () => {
  const { user, loading } = useAuth();
  if (loading) return <div className="grid min-h-screen place-items-center bg-background text-foreground">Loading Spendova...</div>;
  if (!user) return <Auth mode="login" />;
  return <Index />;
};

const BiometricLockGate = ({ children }: { children: React.ReactNode }) => {
  const { user, loading, signOut } = useAuth();
  const [unlocked, setUnlocked] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState("");
  const needsUnlock = Boolean(user && isBiometricLockEnabled(user.id) && !unlocked);

  useEffect(() => {
    setUnlocked(false);
    setError("");
  }, [user?.id]);

  useEffect(() => {
    if (user && consumeFreshLoginUnlocked(user.id)) setUnlocked(true);
  }, [user]);

  const unlock = async () => {
    if (!user) return;
    setUnlocking(true);
    setError("");
    try {
      const success = await unlockWithBiometric(user.id);
      if (!success) throw new Error("Unlock was cancelled.");
      setUnlocked(true);
    } catch (unlockError) {
      console.error("Biometric unlock failed", unlockError);
      setError(unlockError instanceof Error ? unlockError.message : "Could not unlock Spendova.");
    } finally {
      setUnlocking(false);
    }
  };

  if (loading || !needsUnlock) return <>{children}</>;

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
  const [maintenance, setMaintenance] = useState(false);
  const isAdminRoute = location.pathname.startsWith("/admin");

  useEffect(() => {
    let active = true;
    const checkMaintenance = async () => {
      try {
        const { data, error } = await supabase.from("site_settings").select("is_maintenance_mode").eq("id", 1).single();
        if (error) throw error;
        // if (active) setMaintenance(Boolean(data?.is_maintenance_mode));
      } catch (error) {
        console.error("Failed to check maintenance mode", error);
        if (active) setMaintenance(false);
      }
    };

    checkMaintenance();
    const interval = window.setInterval(checkMaintenance, 30000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  if (maintenance && !isAdminRoute) {
    return (
      <Suspense fallback={<div className="grid min-h-screen place-items-center bg-background text-foreground">Loading Spendova...</div>}>
        <Maintenance />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<div className="grid min-h-screen place-items-center bg-background text-foreground">Loading Spendova...</div>}>
      <Routes>
        <Route path="/" element={<ProtectedIndex />} />
        <Route path="/dashboard" element={<ProtectedIndex />} />
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
        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
};

const App = () => (
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
);

export default App;
