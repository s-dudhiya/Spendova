import { Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { LogOut, User, Mail, Calendar, ArrowLeft, Edit2, Loader2, Check, X, Save, XCircle, Sun, Moon } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

export default function Profile() {
  const { user, profile, signOut, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { theme, toggleTheme } = useTheme();

  const [isEditing, setIsEditing] = useState(false);
  const [editFullName, setEditFullName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setEditFullName(profile.full_name || '');
      setEditUsername(profile.username || '');
    }
  }, [profile]);

  useEffect(() => {
    if (!isEditing || editUsername === profile?.username) {
      setUsernameStatus('idle');
      return;
    }

    if (editUsername.length < 3) {
      setUsernameStatus('taken');
      return;
    }

    const checkUsername = async () => {
      setUsernameStatus('checking');
      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', editUsername)
        .maybeSingle();

      if (error || data) {
        setUsernameStatus('taken');
      } else {
        setUsernameStatus('available');
      }
    };

    const debounceTimer = setTimeout(checkUsername, 500);
    return () => clearTimeout(debounceTimer);
  }, [editUsername, isEditing, profile?.username]);

  const handleSaveProfile = async () => {
    if (!user) return;

    if (editUsername !== profile?.username && usernameStatus !== 'available') {
      toast({ title: 'Invalid Username', description: 'Please choose a valid & unique username.', variant: 'destructive' });
      return;
    }

    setIsSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: editFullName,
        username: editUsername,
      })
      .eq('user_id', user.id);

    setIsSaving(false);

    if (error) {
      toast({ title: 'Error', description: 'Failed to update profile', variant: 'destructive' });
    } else {
      toast({ title: 'Success', description: 'Profile updated successfully' });
      setIsEditing(false);
      // Let the onAuthStateChange listener re-fetch the profile or manually refresh via context if needed.
      // But typically a page reload or state update is required. Here the user will just see success.
      window.location.reload(); // Quickest way to sync global state for this iteration
    }
  };

  // Redirect if not authenticated
  if (!authLoading && !user) {
    return <Navigate to="/auth" replace />;
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  const getInitials = (name: string) => {
    if (!name) return 'U';
    const names = name.trim().split(' ');
    if (names.length >= 2) {
      return (names[0][0] + names[names.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const getDisplayName = () => {
    return profile?.full_name || user?.email?.split('@')[0] || 'User';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-28 md:pb-8 relative overflow-x-hidden">
      {/* Background ambient shape */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-[100px] pointer-events-none" />

      {/* App Header */}
      <header className="px-6 pt-8 pb-4 flex justify-between items-center sticky top-0 bg-secondary/90 backdrop-blur-xl z-50">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="rounded-full w-10 h-10 hover:bg-muted -ml-2 shrink-0" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mb-0.5">Settings</p>
            <h2 className="text-xl font-extrabold tracking-tight leading-none">Profile</h2>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="rounded-full w-10 h-10 hover:bg-muted" onClick={() => setIsEditing(!isEditing)}>
          {isEditing ? <XCircle className="h-5 w-5" /> : <Edit2 className="h-5 w-5" />}
        </Button>
      </header>

      <main className="px-6 space-y-8 max-w-lg mx-auto md:max-w-xl relative z-10 pt-4">
        {/* Profile Hero */}
        <div className="flex flex-col items-center justify-center text-center py-2">
          <div className="w-28 h-28 rounded-full bg-gradient-to-br from-primary to-primary/60 p-1 mb-4 shadow-xl shadow-primary/20">
            <div className="w-full h-full bg-background rounded-full border-4 border-background flex items-center justify-center text-primary text-3xl font-black">
              {getInitials(getDisplayName())}
            </div>
          </div>
          <h1 className="text-3xl font-black tracking-tighter text-foreground">{getDisplayName()}</h1>
          <p className="text-sm font-bold text-muted-foreground mt-1 tracking-wide lowercase">@{profile?.username || 'user'}</p>
        </div>

        {isEditing ? (
          <div className="space-y-6 pt-4">
            <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest px-2">Edit Details</h3>
            <div className="bg-secondary/30 rounded-3xl border border-border/40 p-5 space-y-5">
              <div className="space-y-2">
                <Label htmlFor="editFullName" className="text-xs font-bold uppercase tracking-wider text-foreground/70 ml-1">Full Name</Label>
                <Input
                  id="editFullName"
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  placeholder="Enter full name"
                  className="h-12 bg-background border-0 rounded-2xl font-bold shadow-inner px-4 text-base"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editUsername" className="text-xs font-bold uppercase tracking-wider text-foreground/70 ml-1">Username</Label>
                <div className="relative">
                  <Input
                    id="editUsername"
                    value={editUsername}
                    onChange={(e) => setEditUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    placeholder="Enter unique username"
                    className={`h-12 bg-background border-0 rounded-2xl font-bold shadow-inner px-4 text-base ${usernameStatus === 'taken' ? 'ring-2 ring-destructive/50' :
                      usernameStatus === 'available' ? 'ring-2 ring-success/50' : ''
                      }`}
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center">
                    {usernameStatus === 'checking' && <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />}
                    {usernameStatus === 'available' && editUsername !== profile?.username && <Check className="h-5 w-5 text-success" />}
                    {usernameStatus === 'taken' && editUsername !== profile?.username && <X className="h-5 w-5 text-destructive" />}
                  </div>
                </div>
                {editUsername !== profile?.username && usernameStatus === 'taken' && editUsername.length >= 3 && (
                  <p className="text-xs font-bold text-destructive pl-1 mt-1">Username is already taken or invalid.</p>
                )}
              </div>
            </div>

            <Button
              onClick={handleSaveProfile}
              disabled={isSaving || (editUsername !== profile?.username && usernameStatus !== 'available')}
              className="w-full h-14 rounded-full font-bold shadow-xl shadow-primary/20 hover:shadow-primary/30 text-lg group"
            >
              {isSaving ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Save className="mr-2 h-5 w-5 group-hover:scale-110 transition-transform" />}
              Save Changes
            </Button>
          </div>
        ) : (
          <div className="space-y-8 pt-4">
            {/* User Details Group */}
            <div>
              <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-3 px-2">Account Info</h3>
              <div className="bg-secondary/30 rounded-3xl border border-border/40 overflow-hidden divide-y divide-border/40">
                <div className="flex items-center gap-4 p-4 hover:bg-muted/30 transition-colors">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Mail className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Email Address</p>
                    <p className="font-bold text-foreground text-sm">{user?.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 p-4 hover:bg-muted/30 transition-colors">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Calendar className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Member Since</p>
                    <p className="font-bold text-foreground text-sm">{formatDate(user?.created_at || '')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 p-4 hover:bg-muted/30 transition-colors">
                  <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center shrink-0">
                    <div className="h-2.5 w-2.5 rounded-full bg-success animate-pulse"></div>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Account Status</p>
                    <p className="font-bold text-success text-sm">Active & Verified</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Appearance Group */}
            <div>
              <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-3 px-2">Appearance</h3>
              <div className="bg-secondary/30 rounded-3xl border border-border/40 overflow-hidden">
                <button
                  onClick={toggleTheme}
                  className="flex items-center gap-4 p-4 w-full hover:bg-muted/30 active:bg-muted/50 transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    {theme === 'dark'
                      ? <Sun className="h-5 w-5 text-warning" />
                      : <Moon className="h-5 w-5 text-primary" />}
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Theme</p>
                    <p className="font-bold text-foreground text-sm">{theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</p>
                  </div>
                  {/* Toggle pill */}
                  <div
                    className={`relative w-12 h-6 rounded-full transition-colors duration-300 shrink-0 ${theme === 'dark' ? 'bg-primary' : 'bg-muted-foreground/30'
                      }`}
                  >
                    <div
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-md transform transition-transform duration-300 ${theme === 'dark' ? 'translate-x-6' : 'translate-x-0.5'
                        }`}
                    />
                  </div>
                </button>
              </div>
            </div>

            {/* Actions Group */}
            <div>
              <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-3 px-2">Actions</h3>
              <Button
                onClick={signOut}
                variant="outline"
                className="w-full h-14 rounded-full font-bold border-destructive/20 text-destructive bg-destructive/5 hover:bg-destructive hover:text-destructive-foreground transition-all group"
              >
                <LogOut className="mr-2 h-5 w-5 group-hover:-translate-x-1 transition-transform" />
                Sign Out
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}