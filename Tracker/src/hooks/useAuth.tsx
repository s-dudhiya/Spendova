import { createContext, useContext, useEffect, useState, ReactNode, useRef, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface Profile {
  id: string;
  user_id: string;
  full_name: string | null;
  username: string | null;
  created_at: string;
  updated_at: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, fullName: string, username: string, redirectTo?: string) => Promise<{ error: any }>;
  resetPassword: (email: string) => Promise<{ error: any }>;
  updatePassword: (password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const INACTIVITY_TIMEOUT = 60 * 60 * 1000; // 1 hour
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
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) toast({ title: "Sign In Failed", description: error.message, variant: "destructive" });
    return { error };
  };

  const signUp = async (email: string, password: string, fullName: string, username: string, redirectTo?: string) => {
    // If no explicit redirect is provided, fallback to the site's origin (works for both local and prod)
    const baseRedirect = redirectTo
      ? `${window.location.origin}${redirectTo}`
      : `${window.location.origin}/dashboard`;

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: baseRedirect, data: { full_name: fullName, username: username } }
    });

    if (error) toast({ title: "Sign Up Failed", description: error.message, variant: "destructive" });
    else toast({ title: "Sign Up Successful", description: "Please check your email to confirm your account." });

    return { error };
  };

  const resetPassword = async (email: string) => {
    // Ensure the redirect points to the live URL when tested from the live site, 
    // or fallback to origin (localhost) if testing locally.
    const baseUrl = 'https://the-expensemate.vercel.app';

    const redirectUrl = `${baseUrl}/auth?reset=true`;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl,
    });

    if (error) toast({ title: "Reset Password Failed", description: error.message, variant: "destructive" });
    else toast({ title: "Check Your Email", description: "A password reset link has been sent to your email." });

    return { error };
  };

  const updatePassword = async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });

    if (error) toast({ title: "Update Failed", description: error.message, variant: "destructive" });
    else toast({ title: "Password Updated", description: "Your password has been successfully updated." });

    return { error };
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

  const value = { user, session, profile, signIn, signUp, resetPassword, updatePassword, signOut, loading };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
