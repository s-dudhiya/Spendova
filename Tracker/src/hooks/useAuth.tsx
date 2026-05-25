import { createContext, useContext, useEffect, useState, ReactNode, useRef, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-logout due to inactivity
  const handleAutoLogout = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (!error) {
      setUser(null);
      setSession(null);
      setProfile(null);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      toast({
        title: "Session Expired",
        description: "You've been automatically signed out due to inactivity.",
        variant: "destructive",
      });
    }
  }, [toast]);

  const resetInactivityTimer = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (user) {
      timeoutRef.current = setTimeout(handleAutoLogout, INACTIVITY_TIMEOUT);
    }
  }, [user, handleAutoLogout]);

  useEffect(() => {
    if (!user) return;
    const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    const handleActivity = () => resetInactivityTimer();

    activityEvents.forEach(event => document.addEventListener(event, handleActivity, true));
    resetInactivityTimer();

    return () => {
      activityEvents.forEach(event => document.removeEventListener(event, handleActivity, true));
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [user, resetInactivityTimer]);

  // Listen for auth state changes
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else setProfile(null);
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') console.error('Error fetching profile:', error);
      else setProfile(data as Profile);
    } catch (error) {
      console.error('Error fetching profile:', error);
    }
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      console.error("Supabase sign-in error", error);
      toast({ title: "Sign In Failed", description: error.message, variant: "destructive" });
      return { error };
    }

    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('email_verified')
      .eq('user_id', data.user.id)
      .maybeSingle();
    if (profileError) console.error("Profile verification lookup failed", profileError);
    if (profileData && profileData.email_verified === false) {
      await supabase.auth.signOut();
      const verifyError = new Error("Please verify your email with the 6-digit code before logging in.");
      toast({ title: "Verification Required", description: verifyError.message, variant: "destructive" });
      return { error: verifyError };
    }
    return { error: null };
  };

  const signOut = async () => {
    // Always fetch latest session before signing out
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    if (!currentSession) {
      toast({ title: "Sign Out Failed", description: "No active session found.", variant: "destructive" });
      return;
    }

    const { error } = await supabase.auth.signOut();
    if (!error) {
      setUser(null);
      setSession(null);
      setProfile(null);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      toast({ title: "Signed Out", description: "You have been successfully signed out." });
    } else {
      toast({ title: "Sign Out Failed", description: error.message, variant: "destructive" });
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
