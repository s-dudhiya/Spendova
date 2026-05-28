import { createContext, useContext, useEffect, useState, ReactNode, useRef, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { markFreshLoginUnlocked } from '@/lib/biometric-lock';
import { checkDeviceSession, registerDeviceSession, revokeCurrentDeviceSession } from '@/lib/device-session';
import { getFriendlyErrorMessage, getFriendlyErrorTitle } from '@/lib/friendly-error';
import { bootLog, safeStorage, withTimeout } from '@/lib/startup-safety';

interface Profile {
  id: string;
  user_id: string;
  full_name: string | null;
  username: string | null;
  email_verified?: boolean | null;
  created_at: string;
  updated_at: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const INACTIVITY_TIMEOUT = 7 * 24 * 60 * 60 * 1000; // 7 days
const DEVICE_SESSION_CHECK_INTERVAL = 60 * 1000;
const STARTUP_TIMEOUT = 5000;
const LAST_ACTIVITY_PREFIX = "spendova_last_activity_at";

const getLastActivityKey = (userId: string) => `${LAST_ACTIVITY_PREFIX}_${userId}`;

const getStoredLastActivity = (userId: string) => {
  const value = Number(safeStorage.getItem(getLastActivityKey(userId)) || "0");
  return Number.isFinite(value) && value > 0 ? value : null;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const registeringRef = useRef(false);
  const lastRegisteredUserRef = useRef<string | null>(null);
  const currentUserIdRef = useRef<string | null>(null);

  // Auto-logout due to inactivity
  const clearLocalAuthState = useCallback(() => {
    if (currentUserIdRef.current) {
      safeStorage.removeItem(getLastActivityKey(currentUserIdRef.current));
      currentUserIdRef.current = null;
    }
    setUser(null);
    setSession(null);
    setProfile(null);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  const handleAutoLogout = useCallback(async () => {
    await revokeCurrentDeviceSession().catch(() => undefined);
    const { error } = await supabase.auth.signOut();
    if (!error) {
      clearLocalAuthState();
      toast({
        title: "Session Expired",
        description: "You've been automatically signed out due to inactivity.",
        variant: "destructive",
      });
    }
  }, [clearLocalAuthState, toast]);

  const armInactivityTimer = useCallback((targetUser: User, lastActivity: number) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    const remainingTime = INACTIVITY_TIMEOUT - (Date.now() - lastActivity);
    if (remainingTime <= 0) {
      void handleAutoLogout();
      return;
    }
    timeoutRef.current = setTimeout(handleAutoLogout, remainingTime);
    currentUserIdRef.current = targetUser.id;
  }, [handleAutoLogout]);

  const resetInactivityTimer = useCallback(() => {
    if (!user) return;
    const now = Date.now();
    safeStorage.setItem(getLastActivityKey(user.id), String(now));
    armInactivityTimer(user, now);
  }, [armInactivityTimer, user]);

  useEffect(() => {
    if (!user) return;
    const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    const handleActivity = () => resetInactivityTimer();
    const handleResume = () => {
      if (document.visibilityState === "hidden") return;
      const lastActivity = getStoredLastActivity(user.id) ?? Date.now();
      if (Date.now() - lastActivity >= INACTIVITY_TIMEOUT) {
        void handleAutoLogout();
        return;
      }
      armInactivityTimer(user, lastActivity);
    };

    currentUserIdRef.current = user.id;
    const lastActivity = getStoredLastActivity(user.id) ?? Date.now();
    if (!getStoredLastActivity(user.id)) {
      safeStorage.setItem(getLastActivityKey(user.id), String(lastActivity));
    }
    if (Date.now() - lastActivity >= INACTIVITY_TIMEOUT) {
      void handleAutoLogout();
      return;
    }

    activityEvents.forEach(event => document.addEventListener(event, handleActivity, true));
    window.addEventListener("focus", handleResume);
    document.addEventListener("visibilitychange", handleResume);
    armInactivityTimer(user, lastActivity);

    return () => {
      activityEvents.forEach(event => document.removeEventListener(event, handleActivity, true));
      window.removeEventListener("focus", handleResume);
      document.removeEventListener("visibilitychange", handleResume);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [armInactivityTimer, handleAutoLogout, resetInactivityTimer, user]);

  const enforceDeviceSession = useCallback(async (targetUser: User) => {
    if (registeringRef.current || lastRegisteredUserRef.current === targetUser.id) return;
    registeringRef.current = true;
    try {
      const result = await checkDeviceSession();
      if (!result.valid) {
        await supabase.auth.signOut();
        clearLocalAuthState();
        toast({
          title: "Signed Out",
          description: result.reason === "new_device_login"
            ? "Your account was opened on another device."
            : result.reason === "device_session_missing"
              ? "This session is no longer active. Please sign in again."
            : "This device session is no longer active.",
          variant: "destructive",
        });
        return;
      }
      lastRegisteredUserRef.current = targetUser.id;
    } catch (error) {
      console.warn("Device session check unavailable; continuing without blocking app load.", error);
      lastRegisteredUserRef.current = targetUser.id;
    } finally {
      registeringRef.current = false;
    }
  }, [clearLocalAuthState, toast]);

  useEffect(() => {
    if (!user) {
      lastRegisteredUserRef.current = null;
      return;
    }

    enforceDeviceSession(user);
    const interval = window.setInterval(async () => {
      try {
        const result = await checkDeviceSession();
        if (!result.valid) {
          await supabase.auth.signOut();
          clearLocalAuthState();
          toast({
            title: "Signed Out",
            description: result.reason === "new_device_login"
              ? "Your account was opened on another device."
              : result.reason === "device_session_missing"
                ? "This session is no longer active. Please sign in again."
                : "This device session is no longer active.",
            variant: "destructive",
          });
        }
      } catch (error) {
        console.warn("Device session check unavailable; continuing without blocking app load.", error);
      }
    }, DEVICE_SESSION_CHECK_INTERVAL);

    return () => window.clearInterval(interval);
  }, [clearLocalAuthState, enforceDeviceSession, toast, user]);

  // Listen for auth state changes
  useEffect(() => {
    bootLog("auth provider start");
    let mounted = true;
    const finishLoading = () => {
      if (mounted) {
        bootLog("auth loading false");
        setLoading(false);
      }
    };
    const startupTimeout = window.setTimeout(() => {
      console.warn("Auth startup timed out; continuing with safe fallback.");
      finishLoading();
    }, STARTUP_TIMEOUT);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      bootLog("auth state change", event, Boolean(session?.user));
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else setProfile(null);
      window.clearTimeout(startupTimeout);
      finishLoading();
    });

    const restoreSession = async () => {
      try {
        bootLog("supabase getSession start");
        const { data: { session } } = await withTimeout(supabase.auth.getSession(), STARTUP_TIMEOUT, "supabase session restore");
        bootLog("supabase getSession end", Boolean(session?.user));
        if (!mounted) return;
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) fetchProfile(session.user.id);
        else setProfile(null);
      } catch (error) {
        console.error("Supabase session restore failed", error);
        if (!mounted) return;
        setSession(null);
        setUser(null);
        setProfile(null);
      } finally {
        window.clearTimeout(startupTimeout);
        finishLoading();
      }
    };
    restoreSession();

    return () => {
      mounted = false;
      window.clearTimeout(startupTimeout);
      subscription.unsubscribe();
    };
  }, []);

  const fetchProfile = async (userId: string) => {
    try {
      bootLog("profile fetch start");
      const { data, error } = await withTimeout(supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .single(), 5000, "profile fetch");

      if (error && error.code !== 'PGRST116') console.error('Error fetching profile:', error);
      else setProfile(data as Profile);
      bootLog("profile fetch end");
    } catch (error) {
      console.error('Error fetching profile:', error);
    }
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      console.error("Supabase sign-in error", error);
      toast({ title: getFriendlyErrorTitle(error, "auth"), description: getFriendlyErrorMessage(error, "auth"), variant: "destructive" });
      return { error };
    }

    registeringRef.current = true;
    registerDeviceSession()
      .then(() => {
        lastRegisteredUserRef.current = data.user.id;
        safeStorage.setItem(getLastActivityKey(data.user.id), String(Date.now()));
        bootLog("sign-in device session registered");
      })
      .catch((deviceError) => {
        console.warn("Device session registration unavailable; continuing without blocking sign-in.", deviceError);
        lastRegisteredUserRef.current = data.user.id;
      })
      .finally(() => {
        registeringRef.current = false;
      });
    markFreshLoginUnlocked(data.user.id);

    let profileData: { email_verified?: boolean | null } | null = null;
    let profileError: { message?: string } | null = null;
    try {
      const profileResult = await withTimeout(supabase
        .from('profiles')
        .select('email_verified')
        .eq('user_id', data.user.id)
        .maybeSingle(), 5000, "profile verification lookup");
      profileData = profileResult.data;
      profileError = profileResult.error;
    } catch (error) {
      console.error("Profile verification lookup failed", error);
    }
    if (profileError) console.error("Profile verification lookup failed", profileError);
    const customSignupPending = data.user.user_metadata?.spendova_custom_pending === true;
    if (profileData && profileData.email_verified === false && customSignupPending) {
      await revokeCurrentDeviceSession().catch(() => undefined);
      await supabase.auth.signOut();
      const verifyError = new Error("Please verify your email with the 6-digit code before logging in.");
      toast({ title: "Verification Required", description: getFriendlyErrorMessage(verifyError, "auth"), variant: "destructive" });
      return { error: verifyError };
    }
    if (profileData && profileData.email_verified === false && !customSignupPending) {
      const { error: repairError } = await supabase
        .from('profiles')
        .update({ email_verified: true })
        .eq('user_id', data.user.id);
      if (repairError) console.error("Profile verification repair failed", repairError);
    }
    return { error: null };
  };

  const signOut = async () => {
    // Always fetch latest session before signing out
    const { data: { session: currentSession } } = await withTimeout(supabase.auth.getSession(), 5000, "sign out session lookup");
    if (!currentSession) {
      toast({ title: "Sign Out Failed", description: "No active session found.", variant: "destructive" });
      return;
    }

    await revokeCurrentDeviceSession().catch((error) => console.error("Device session revoke failed", error));
    const { error } = await supabase.auth.signOut();
    if (!error) {
      clearLocalAuthState();
      toast({ title: "Signed Out", description: "You have been successfully signed out." });
    } else {
      toast({ title: "Sign Out Failed", description: getFriendlyErrorMessage(error, "auth"), variant: "destructive" });
    }
  };

  const value = { user, session, profile, signIn, signOut, loading };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
