import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Activity, AlertOctagon, AlertTriangle, ArrowLeft, BarChart3, Bell, CheckCircle2, Clock, Eye, FileText, History, Inbox, Lock, LogOut, Mail, Megaphone, MessageSquare, Paperclip, Radio, RefreshCw, Search, Send, Server, Settings, ShieldAlert, ShieldCheck, Star, ThumbsDown, ThumbsUp, Trash2, TrendingUp, UserCheck, Users, UserX, X } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { getFriendlyErrorMessage } from "@/lib/friendly-error";

type AdminCheck = "loading" | "allowed" | "denied";
const AUTH_BRAND_IMAGE = "/brand/login-branding-image.png";

const AdminSelect = ({ value, onChange, options, disabled }: { value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }>; disabled?: boolean }) => (
  <Select value={value} onValueChange={onChange} disabled={disabled}>
    <SelectTrigger className="h-11 rounded-2xl border-input bg-background px-3 text-sm text-foreground focus:ring-2 focus:ring-ring/35 focus:ring-offset-0">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
    </SelectContent>
  </Select>
);

type FeedbackReport = {
  id: string;
  user_id: string;
  type: "bug_report" | "feature_request" | "suggestion" | "general_feedback";
  title: string;
  description: string;
  screenshot_url: string | null;
  priority: "low" | "medium" | "high" | "critical";
  status: "open" | "investigating" | "resolved" | "closed";
  device_info: Record<string, string | number | boolean | null | undefined>;
  app_version: string;
  admin_notes: string | null;
  internal_notes: string | null;
  user_update_message: string | null;
  created_at: string;
  updated_at: string;
  profiles?: { user_id: string; full_name: string | null; username: string | null } | null;
};

type AppRating = {
  id: string;
  user_id: string;
  rating: number;
  sentiment: "positive" | "negative" | "neutral";
  selected_tags: string[];
  comment: string | null;
  round_number: number;
  created_at: string;
  profiles?: { user_id: string; full_name: string | null; username: string | null } | null;
};

type FeedbackEvent = {
  id: string;
  report_id: string;
  event_type: "created" | "status_changed" | "priority_changed" | "admin_replied" | "note_updated";
  status: FeedbackReport["status"] | null;
  priority: FeedbackReport["priority"] | null;
  message: string | null;
  created_at: string;
};

const feedbackTypes = [
  { value: "all", label: "All types" },
  { value: "bug_report", label: "Bug Report" },
  { value: "feature_request", label: "Feature Request" },
  { value: "suggestion", label: "Suggestion" },
  { value: "general_feedback", label: "General Feedback" },
];

const feedbackStatuses = ["all", "open", "investigating", "resolved", "closed"] as const;
const feedbackPriorities = ["all", "low", "medium", "high", "critical"] as const;

const feedbackTypeLabel = (type: FeedbackReport["type"]) => feedbackTypes.find((item) => item.value === type)?.label || "Feedback";
const feedbackStatusLabel = (status: FeedbackReport["status"]) => status.charAt(0).toUpperCase() + status.slice(1);
const feedbackPriorityLabel = (priority: FeedbackReport["priority"]) => priority.charAt(0).toUpperCase() + priority.slice(1);
const reportUserName = (report?: FeedbackReport | null) => report?.profiles?.full_name || report?.profiles?.username || "Spendova user";
const editableNoteValue = (value?: string | null) => !value || value.trim().toUpperCase() === "N/A" ? "" : value;
const badgeTone = (value: string) => value === "critical" ? "border-destructive/30 bg-destructive/10 text-destructive" : value === "resolved" || value === "closed" ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : value === "investigating" || value === "high" ? "border-primary/25 bg-primary/10 text-primary" : "border-border bg-elevated text-muted-foreground";
const formatAdminDate = (date: string) => new Date(date).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
const isMissingStorageObjectError = (error: unknown) => {
  if (!error || typeof error !== "object") return false;
  const storageError = error as { message?: unknown; status?: unknown; statusCode?: unknown };
  const message = typeof storageError.message === "string" ? storageError.message.toLowerCase() : "";
  return Number(storageError.status) === 404 || Number(storageError.statusCode) === 404 || message.includes("not found") || message.includes("does not exist");
};
const eventLabel = (event: FeedbackEvent) => {
  if (event.event_type === "created") return "Ticket created";
  if (event.event_type === "status_changed") return `Status changed to ${event.status ? feedbackStatusLabel(event.status) : "updated"}`;
  if (event.event_type === "priority_changed") return `Priority changed to ${event.priority ? feedbackPriorityLabel(event.priority) : "updated"}`;
  if (event.event_type === "admin_replied") return "Admin replied";
  return "Internal notes updated";
};

const AdminLogin = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [adminCheck, setAdminCheck] = useState<AdminCheck>("loading");
  const { user, loading: authLoading, signIn } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    const verifyExistingSession = async () => {
      if (authLoading) return;
      if (!user) {
        setAdminCheck("denied");
        return;
      }
      const { data, error } = await supabase.rpc("is_admin" as never);
      if (!error && data === true) navigate("/admin/dashboard", { replace: true });
      else setAdminCheck("denied");
    };
    verifyExistingSession();
  }, [authLoading, user, navigate]);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const { error } = await signIn(email, password);
      if (error) throw error;

      const { data: isAdmin, error: adminError } = await supabase.rpc("is_admin" as never);
      if (adminError) throw adminError;
      if (isAdmin !== true) {
        await supabase.auth.signOut();
        setPassword("");
        toast({ title: "Access denied", description: "You are not authorized to access admin panel.", variant: "destructive" });
        return;
      }

      toast({ title: "Access granted", description: "Welcome to the Spendova admin portal." });
      navigate("/admin/dashboard", { replace: true });
    } catch (error) {
      toast({ title: "Admin login failed", description: getFriendlyErrorMessage(error, "admin"), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-8 text-foreground sm:px-6">
      <div className="mb-5 text-center sm:mb-6">
        <img src={AUTH_BRAND_IMAGE} alt="Spendova" className="mx-auto h-auto w-52 max-w-full sm:w-64" />
        <p className="mt-2 text-sm font-medium text-muted-foreground">Admin portal</p>
      </div>
      <Card className="w-full max-w-md rounded-[1.5rem] border-border/70 bg-card/95 shadow-[0_24px_70px_rgba(0,0,0,0.34)] ring-1 ring-primary/10">
        <CardHeader className="space-y-2 px-5 pt-6 text-center sm:px-7">
          <div className="mx-auto grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
            <Lock className="size-5" />
          </div>
          <CardTitle className="text-2xl text-foreground">Admin Login</CardTitle>
          <CardDescription>Sign in with an admin account to access the portal.</CardDescription>
        </CardHeader>
        <CardContent className="px-5 pb-6 sm:px-7">
          {adminCheck === "denied" && user && (
            <div className="mb-4 rounded-2xl bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
              You are not authorized to access admin panel.
            </div>
          )}
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="admin-email">Email</Label>
              <Input id="admin-email" type="email" placeholder="admin@example.com" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required autoFocus={!user} className="h-12 rounded-2xl border-input bg-background/85 px-4 shadow-soft focus-visible:ring-ring/35" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-password">Password</Label>
              <Input id="admin-password" type="password" placeholder="Password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required className="h-12 rounded-2xl border-input bg-background/85 px-4 shadow-soft focus-visible:ring-ring/35" />
            </div>
            <Button type="submit" className="h-12 w-full rounded-2xl bg-primary shadow-primary-action transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60" disabled={authLoading || submitting}>{submitting ? "Checking..." : "Login"}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

const UnauthorizedAdmin = () => {
  const navigate = useNavigate();
  const { signOut } = useAuth();

  const leaveAdmin = async () => {
    await signOut();
    navigate("/dashboard", { replace: true });
  };

  return (
    <div className="grid min-h-screen place-items-center bg-background px-4 text-center text-foreground">
      <Card className="w-full max-w-sm rounded-[1.25rem] border-border bg-card shadow-panel">
        <CardHeader>
          <CardTitle>Access denied</CardTitle>
          <CardDescription>You are not authorized to access admin panel.</CardDescription>
        </CardHeader>
        <CardContent><Button className="w-full" onClick={leaveAdmin}>Go to Spendova</Button></CardContent>
      </Card>
    </div>
  );
};

const AdminGuard = ({ children }: { children: React.ReactNode }) => {
  const [adminCheck, setAdminCheck] = useState<AdminCheck>("loading");
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    const verifyAdmin = async () => {
      if (authLoading) return;
      if (!user) {
        setAdminCheck("denied");
        return;
      }
      const { data, error } = await supabase.rpc("is_admin" as never);
      setAdminCheck(!error && data === true ? "allowed" : "denied");
    };
    verifyAdmin();
  }, [authLoading, user]);

  if (authLoading || adminCheck === "loading") return <div className="grid min-h-screen place-items-center bg-background text-foreground">Checking admin access...</div>;
  if (!user) return <AdminLogin />;
  if (adminCheck === "denied") return <UnauthorizedAdmin />;
  return <>{children}</>;
};

const AdminDashboard = () => {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [recipientMode, setRecipientMode] = useState<"single" | "all">("single");
  const [targetEmail, setTargetEmail] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const [attachments, setAttachments] = useState<Array<{ name: string; data: string; size: number }>>([]);
  const [sendingMode, setSendingMode] = useState<"" | "test" | "broadcast">("");
  const [readingFiles, setReadingFiles] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const [isMaintenance, setIsMaintenance] = useState(false);
  const [fetchingMaintenance, setFetchingMaintenance] = useState(false);
  const [feedbackReports, setFeedbackReports] = useState<FeedbackReport[]>([]);
  const [feedbackEvents, setFeedbackEvents] = useState<Record<string, FeedbackEvent[]>>({});
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [screenshotPreviewUrl, setScreenshotPreviewUrl] = useState("");
  const [deletingScreenshot, setDeletingScreenshot] = useState(false);
  const [feedbackFilters, setFeedbackFilters] = useState({ type: "all", status: "all", priority: "all", date: "", search: "" });
  const [savingReport, setSavingReport] = useState(false);
  const [ticketDraft, setTicketDraft] = useState({ status: "open" as FeedbackReport["status"], priority: "medium" as FeedbackReport["priority"], internalNotes: "", userMessage: "" });
  const { toast } = useToast();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const selectedReport = feedbackReports.find((report) => report.id === selectedReportId) || feedbackReports[0] || null;
  const selectedEvents = selectedReport ? feedbackEvents[selectedReport.id] || [] : [];

  const filteredReports = useMemo(() => feedbackReports.filter((report) => {
    const query = feedbackFilters.search.trim().toLowerCase();
    const searchable = `${report.title} ${report.description} ${reportUserName(report)}`.toLowerCase();
    return (!query || searchable.includes(query))
      && (!feedbackFilters.date || report.created_at?.startsWith(feedbackFilters.date))
      && (feedbackFilters.type === "all" || report.type === feedbackFilters.type)
      && (feedbackFilters.status === "all" || report.status === feedbackFilters.status)
      && (feedbackFilters.priority === "all" || report.priority === feedbackFilters.priority);
  }), [feedbackFilters, feedbackReports]);

  const feedbackStats = useMemo(() => ({
    total: feedbackReports.length,
    open: feedbackReports.filter((report) => report.status === "open").length,
    investigating: feedbackReports.filter((report) => report.status === "investigating").length,
    resolved: feedbackReports.filter((report) => report.status === "resolved").length,
    critical: feedbackReports.filter((report) => report.priority === "critical").length,
  }), [feedbackReports]);

  type AdminStation = "analytics" | "users" | "controls" | "broadcast" | "ratings" | "tickets";
  const [adminTab, setAdminTab] = useState<AdminStation>("analytics");
  const [mobileTicketView, setMobileTicketView] = useState<"list" | "detail">("list");
  const [appRatings, setAppRatings] = useState<AppRating[]>([]);
  const [currentRound, setCurrentRound] = useState<number>(0);
  const [ratingsLoading, setRatingsLoading] = useState(false);
  const [rollingOutRound, setRollingOutRound] = useState(false);
  const [ratingFilters, setRatingFilters] = useState({ rating: "all", sentiment: "all", round: "all", search: "" });

  // Analytics & Usage Telemetry State
  type AnalyticsKPIs = {
    total_users: number;
    blocked_users: number;
    total_expenses: number;
    total_volume: number;
    active_today: number;
    active_7d: number;
  };
  type AnalyticsTrend = {
    date: string;
    label: string;
    signups: number;
    transactions: number;
    volume: number;
    active_users: number;
  };
  const [analyticsRange, setAnalyticsRange] = useState<"7d" | "14d" | "30d">("7d");
  const [analyticsData, setAnalyticsData] = useState<{ kpis: AnalyticsKPIs; trends: AnalyticsTrend[] } | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  // User Governance State
  type AdminUser = {
    user_id: string;
    full_name: string | null;
    username: string | null;
    created_at: string;
    is_blocked: boolean;
    blocked_reason?: string | null;
  };
  const [usersList, setUsersList] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [userFilter, setUserFilter] = useState<"all" | "active" | "blocked">("all");
  const [userToBlock, setUserToBlock] = useState<AdminUser | null>(null);
  const [blockReasonInput, setBlockReasonInput] = useState("");
  const [savingBlockAction, setSavingBlockAction] = useState(false);

  // Direct Push Notification Broadcast State (No in-app banner)
  const [broadcastPriority, setBroadcastPriority] = useState<"emergency" | "warning" | "info">("emergency");
  const [broadcastTitle, setBroadcastTitle] = useState("🚨 Emergency Priority Alert");
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [broadcastingPush, setBroadcastingPush] = useState(false);
  const [lastBroadcastResult, setLastBroadcastResult] = useState<{ time: string; count: number; title: string; level: string } | null>(null);

  // Push Notification Testing by Username
  const [testPushUsername, setTestPushUsername] = useState("");
  const [testPushTitle, setTestPushTitle] = useState("Emergency Priority Alert");
  const [testPushMessage, setTestPushMessage] = useState("This is a direct priority test notification dispatched from the Spendova command room.");
  const [testPushLoading, setTestPushLoading] = useState(false);
  const [testPushResult, setTestPushResult] = useState<{
    success: boolean;
    user?: { id: string; name: string; username: string };
    tokensFound: number;
    platforms: string[];
    successCount?: number;
    failureCount?: number;
    message?: string;
  } | null>(null);

  const fetchAppRatings = async (options?: { silent?: boolean }) => {
    if (!options?.silent) setRatingsLoading(true);
    try {
      const { data, error } = await supabase
        .from("app_ratings" as never)
        .select(`
          id,
          user_id,
          rating,
          sentiment,
          selected_tags,
          comment,
          round_number,
          created_at,
          profiles!app_ratings_user_id_fkey(user_id, full_name, username)
        ` as never)
        .order("created_at", { ascending: false });

      if (error) {
        console.warn("Could not fetch app ratings", error);
      } else {
        setAppRatings((data as unknown as AppRating[]) || []);
      }

      const { data: settingsData } = await supabase
        .from("site_settings" as never)
        .select("feedback_round" as never)
        .eq("id", 1)
        .maybeSingle();

      if (settingsData && typeof (settingsData as { feedback_round?: number }).feedback_round === "number") {
        setCurrentRound(Number((settingsData as { feedback_round?: number }).feedback_round));
      }
    } catch (err) {
      console.warn("Could not fetch app ratings", err);
    } finally {
      if (!options?.silent) setRatingsLoading(false);
    }
  };

  const [showRolloutModal, setShowRolloutModal] = useState(false);

  const executeRollout = async () => {
    const isFirstRollout = currentRound === 0;
    const nextRound = isFirstRollout ? 1 : currentRound + 1;

    setRollingOutRound(true);
    try {
      const { data, error } = await supabase.rpc("roll_out_feedback_round" as never);
      if (error) throw error;
      const newRoundNumber = Number(data) || nextRound;
      setCurrentRound(newRoundNumber);
      setShowRolloutModal(false);
      toast({
        title: isFirstRollout ? "Feedback Campaign Rolled Out!" : "Feedback Round Rolled Out!",
        description: `Round ${newRoundNumber} is now active. All users with accounts 4+ days old will receive the feedback modal on their next app visit.`,
      });
      await fetchAppRatings();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Rollout failed";
      toast({
        title: "Rollout failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setRollingOutRound(false);
    }
  };

  const availableRounds = useMemo(() => {
    const set = new Set<number>([
      ...(currentRound > 0 ? [currentRound] : []),
      ...appRatings.map((r) => r.round_number),
    ]);
    return Array.from(set).sort((a, b) => b - a);
  }, [appRatings, currentRound]);

  const filteredRatings = useMemo(() => {
    return appRatings.filter((item) => {
      const q = ratingFilters.search.trim().toLowerCase();
      const userName = `${item.profiles?.full_name || ""} ${item.profiles?.username || ""} ${item.comment || ""} ${(item.selected_tags || []).join(" ")}`.toLowerCase();
      if (q && !userName.includes(q)) return false;
      if (ratingFilters.rating !== "all" && item.rating !== Number(ratingFilters.rating)) return false;
      if (ratingFilters.sentiment !== "all" && item.sentiment !== ratingFilters.sentiment) return false;
      if (ratingFilters.round !== "all" && item.round_number !== Number(ratingFilters.round)) return false;
      return true;
    });
  }, [appRatings, ratingFilters]);

  const ratingStats = useMemo(() => {
    const total = appRatings.length;
    if (!total)
      return { average: "0.0", total: 0, positive: 0, negative: 0, neutral: 0, breakdown: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 } };
    const sum = appRatings.reduce((acc, r) => acc + r.rating, 0);
    const avg = (sum / total).toFixed(1);
    const breakdown = {
      5: appRatings.filter((r) => r.rating === 5).length,
      4: appRatings.filter((r) => r.rating === 4).length,
      3: appRatings.filter((r) => r.rating === 3).length,
      2: appRatings.filter((r) => r.rating === 2).length,
      1: appRatings.filter((r) => r.rating === 1).length,
    };
    return {
      average: avg,
      total,
      positive: appRatings.filter((r) => r.sentiment === "positive").length,
      negative: appRatings.filter((r) => r.sentiment === "negative").length,
      neutral: appRatings.filter((r) => r.sentiment === "neutral").length,
      breakdown,
    };
  }, [appRatings]);

  useEffect(() => {
    fetchMaintenanceState();
    fetchFeedbackReports();
    fetchAppRatings({ silent: true });
    fetchUsers();
    fetchAnalytics(analyticsRange === "7d" ? 7 : analyticsRange === "14d" ? 14 : 30);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchAnalytics(analyticsRange === "7d" ? 7 : analyticsRange === "14d" ? 14 : 30);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyticsRange]);

  useEffect(() => {
    const channel = supabase
      .channel("admin-feedback-reports")
      .on("postgres_changes", { event: "*", schema: "public", table: "feedback_reports" }, () => void fetchFeedbackReports({ silent: true }))
      .on("postgres_changes", { event: "*", schema: "public", table: "feedback_report_events" }, () => void fetchFeedbackEvents({ silent: true }))
      .on("postgres_changes", { event: "*", schema: "public", table: "app_ratings" }, () => void fetchAppRatings({ silent: true }))
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedReport) return;
    setTicketDraft({
      status: selectedReport.status,
      priority: selectedReport.priority,
      internalNotes: editableNoteValue(selectedReport.internal_notes) || editableNoteValue(selectedReport.admin_notes),
      userMessage: editableNoteValue(selectedReport.user_update_message),
    });
  }, [selectedReport]);

  useEffect(() => {
    let active = true;
    const loadScreenshot = async () => {
      setScreenshotPreviewUrl("");
      if (!selectedReport?.screenshot_url) return;
      const { data, error } = await supabase.storage.from("feedback-screenshots").createSignedUrl(selectedReport.screenshot_url, 60 * 10);
      if (active && !error && data?.signedUrl) setScreenshotPreviewUrl(data.signedUrl);
    };
    loadScreenshot();
    return () => {
      active = false;
    };
  }, [selectedReport?.screenshot_url]);

  const fetchMaintenanceState = async () => {
    setFetchingMaintenance(true);
    try {
      type SiteSettingsRecord = {
        is_maintenance_mode?: boolean | null;
      };
      type SiteSettingsQueryBuilder = {
        select: (cols: string) => {
          eq: (col: string, val: number | string) => {
            single: () => Promise<{ data: SiteSettingsRecord | null; error: { code?: string; message: string } | null }>;
          };
        };
      };
      const settingsTable = (supabase as unknown as { from: (name: string) => SiteSettingsQueryBuilder }).from("site_settings");
      const { data, error } = await settingsTable
        .select("is_maintenance_mode")
        .eq("id", 1)
        .single();
      if (error && error.code !== "PGRST116") throw error;
      if (data) {
        setIsMaintenance(Boolean(data.is_maintenance_mode));
      }
    } catch (error) {
      console.error("Failed to fetch maintenance state", error);
      toast({ title: "Warning", description: "Could not fetch current maintenance state.", variant: "destructive" });
    } finally {
      setFetchingMaintenance(false);
    }
  };

  const handleBroadcastPushNotification = async () => {
    const cleanMsg = broadcastMessage.trim();
    if (!cleanMsg) {
      toast({ title: "Message required", description: "Please enter the push notification text to broadcast.", variant: "destructive" });
      return;
    }
    setBroadcastingPush(true);
    try {
      const finalTitle = broadcastTitle.trim() || (
        broadcastPriority === "emergency" ? "🚨 Emergency Priority Alert" :
        broadcastPriority === "warning" ? "⚠️ Spendova System Notice" : "📢 Spendova Platform Update"
      );
      const res = await supabase.functions.invoke("send-push-notification", {
        body: {
          broadcast: true,
          title: finalTitle,
          body: cleanMsg,
          level: broadcastPriority,
        },
      });

      if (res.error) {
        throw new Error(res.error.message || "Failed to dispatch push notification");
      }

      const deliveredCount = res.data?.tokensFound ?? res.data?.sent ?? 0;
      setLastBroadcastResult({
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        count: deliveredCount,
        title: finalTitle,
        level: broadcastPriority,
      });

      toast({
        title: "Push Notification Broadcasted",
        description: `Delivered to ${deliveredCount} active device(s) via Firebase Cloud Messaging.`,
      });
      setBroadcastMessage("");
    } catch (error) {
      console.error("Failed to broadcast push notification", error);
      toast({
        title: "Broadcast failed",
        description: getFriendlyErrorMessage(error, "admin"),
        variant: "destructive",
      });
    } finally {
      setBroadcastingPush(false);
    }
  };

  const handleSendTestPush = async (overrideUsername?: string) => {
    const rawTarget = overrideUsername || testPushUsername;
    const cleanUsername = rawTarget.replace(/^@/, "").trim().toLowerCase();
    if (!cleanUsername) {
      toast({ title: "Username required", description: "Please enter a target username to test.", variant: "destructive" });
      return;
    }
    if (!testPushTitle.trim() || !testPushMessage.trim()) {
      toast({ title: "Title and message required", description: "Please enter both notification title and body.", variant: "destructive" });
      return;
    }

    setTestPushLoading(true);
    setTestPushResult(null);

    try {
      // 1. Verify user profile exists
      const { data: profile, error: profErr } = await supabase
        .from("profiles")
        .select("user_id, full_name, username")
        .ilike("username", cleanUsername)
        .maybeSingle();

      if (profErr || !profile) {
        setTestPushResult({
          success: false,
          tokensFound: 0,
          platforms: [],
          message: `User '@${cleanUsername}' was not found in Spendova profiles. Please verify the username.`,
        });
        toast({ title: "User not found", description: `No user with username '@${cleanUsername}'.`, variant: "destructive" });
        return;
      }

      // 2. Query user push tokens via RPC or fallback
      let tokensCount: number | null = null;
      let platforms: string[] = [];
      let had403Error = false;

      try {
        const { data: rpcTokens, error: rpcErr } = await supabase.rpc("admin_get_user_push_tokens" as never, {
          p_username: cleanUsername,
        } as never);

        if (!rpcErr && rpcTokens) {
          const res = rpcTokens as { success?: boolean; count?: number; tokens?: Array<{ platform?: string }> };
          if (res.success) {
            tokensCount = res.count ?? 0;
            platforms = Array.from(new Set((res.tokens || []).map((t) => t.platform || "device")));
          }
        } else if (rpcErr) {
          const errStr = JSON.stringify(rpcErr);
          if (errStr.includes("403") || errStr.toLowerCase().includes("permission denied") || errStr.toLowerCase().includes("forbidden")) {
            had403Error = true;
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.message.includes("403")) had403Error = true;
      }

      // 3. Dispatch in-app notification via RPC to avoid client 403
      let inAppSent = false;
      try {
        const { data: notifRes, error: notifErr } = await supabase.rpc("admin_dispatch_in_app_notification" as never, {
          p_username: cleanUsername,
          p_title: testPushTitle.trim(),
          p_message: testPushMessage.trim(),
        } as never);

        if (!notifErr && (notifRes as { success?: boolean } | null)?.success) {
          inAppSent = true;
        } else if (notifErr) {
          const errStr = JSON.stringify(notifErr);
          if (errStr.includes("403") || errStr.toLowerCase().includes("permission denied") || errStr.toLowerCase().includes("forbidden")) {
            had403Error = true;
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.message.includes("403")) had403Error = true;
      }

      // 4. Dispatch FCM push via Edge Function with dual compatibility payload
      // (compatible with both the deployed webhook version and the direct version)
      let edgeData: { tokensFound?: number; platforms?: string[]; successCount?: number; failureCount?: number; sent?: number } | null = null;
      let edgeErrorMessage = "";

      try {
        const invokeRes = await supabase.functions.invoke("send-push-notification", {
          body: {
            type: "INSERT",
            record: {
              user_id: profile.user_id,
              title: testPushTitle.trim(),
              message: testPushMessage.trim(),
            },
            username: cleanUsername,
            title: testPushTitle.trim(),
            body: testPushMessage.trim(),
          },
        });

        if (invokeRes.error) {
          let detail = invokeRes.error.message || "Edge function returned error";
          const errWithContext = invokeRes.error as { context?: { json: () => Promise<{ error?: string }> } };
          if (errWithContext.context) {
            try {
              const bodyJson = await errWithContext.context.json();
              if (bodyJson?.error) detail = bodyJson.error;
            } catch {
              // ignore
            }
          }
          edgeErrorMessage = detail;
        } else {
          edgeData = invokeRes.data;
        }
      } catch (invokeErr: unknown) {
        let detail = invokeErr instanceof Error ? invokeErr.message : "Failed to contact edge function";
        const errWithContext = invokeErr as { context?: { json: () => Promise<{ error?: string }> } };
        if (errWithContext?.context) {
          try {
            const bodyJson = await errWithContext.context.json();
            if (bodyJson?.error) detail = bodyJson.error;
          } catch {
            // ignore
          }
        }
        edgeErrorMessage = detail;
      }

      // If edge function returned tokens count, update
      if (edgeData?.tokensFound !== undefined) {
        tokensCount = edgeData.tokensFound;
      }
      if (edgeData?.platforms?.length) {
        platforms = edgeData.platforms;
      }

      // Check if 403 Forbidden was encountered
      if (had403Error || edgeErrorMessage.includes("403") || edgeErrorMessage.toLowerCase().includes("forbidden")) {
        const errorDesc = "Backend returned 403 Forbidden: Table privileges or policies for push tokens and notifications must be executed in Supabase SQL Editor.";
        setTestPushResult({
          success: false,
          user: { id: profile.user_id, name: profile.full_name || profile.username || "User", username: profile.username || cleanUsername },
          tokensFound: 0,
          platforms: [],
          message: errorDesc,
        });

        toast({
          title: "403 Forbidden",
          description: "Admin permissions needed. Please run the provided SQL in Supabase SQL Editor.",
          variant: "destructive",
        });
        return;
      }

      // Check for edge error
      if (edgeErrorMessage) {
        const isSecretMissing = edgeErrorMessage.toLowerCase().includes("firebase") || edgeErrorMessage.toLowerCase().includes("service_account");
        const isNotDeployed = edgeErrorMessage.includes("404") || edgeErrorMessage.toLowerCase().includes("failed to send a request to the edge function");

        let helpfulMsg = edgeErrorMessage;
        if (isSecretMissing) {
          helpfulMsg = "Firebase secret (FIREBASE_SERVICE_ACCOUNT) is not set in Supabase Edge Functions Secrets. Please add your service account JSON in Supabase.";
        } else if (isNotDeployed) {
          helpfulMsg = "Edge function 'send-push-notification' is not deployed yet in your Supabase project. Deploy it using: npx supabase functions deploy send-push-notification";
        }

        setTestPushResult({
          success: false,
          user: { id: profile.user_id, name: profile.full_name || profile.username || "User", username: profile.username || cleanUsername },
          tokensFound: tokensCount ?? 0,
          platforms,
          message: helpfulMsg,
        });

        toast({
          title: isSecretMissing ? "Firebase Secret Missing" : "Edge Function Notice",
          description: helpfulMsg,
          variant: "destructive",
        });
        return;
      }

      const successCount = edgeData?.successCount ?? 0;
      const failureCount = edgeData?.failureCount ?? 0;
      const finalCount = tokensCount ?? (edgeData?.sent !== undefined ? edgeData.sent : 0);

      setTestPushResult({
        success: true,
        user: { id: profile.user_id, name: profile.full_name || profile.username || "User", username: profile.username || cleanUsername },
        tokensFound: finalCount,
        platforms,
        successCount,
        failureCount,
        message: finalCount === 0
          ? `User @${profile.username} exists in profiles, but has 0 active device push tokens registered. The user must open Spendova on an Android/iOS APK or allow web push notifications in their browser to register their device.`
          : `Push notification dispatched! Delivered to ${finalCount} registered device(s) (${platforms.join(", ") || "native app"}).`,
      });

      if (finalCount > 0) {
        toast({
          title: "Test Push Dispatched",
          description: `Sent to @${profile.username} (${finalCount} device${finalCount === 1 ? "" : "s"}).`,
        });
      } else {
        toast({
          title: inAppSent ? "In-App Notification Delivered" : "Notice",
          description: `User @${profile.username} has 0 registered push devices. ${inAppSent ? "In-app notification was recorded." : ""}`,
        });
      }
    } catch (err: unknown) {
      console.error("Test push failed", err);
      const errMessage = err instanceof Error ? err.message : String(err || "");
      const is403 = errMessage.includes("403");
      const msg = is403
        ? "403 Forbidden: Table privileges or policies must be applied in Supabase SQL Editor."
        : errMessage || "Could not complete test push. Please verify network and Supabase connection.";
      setTestPushResult({
        success: false,
        tokensFound: 0,
        platforms: [],
        message: msg,
      });
      toast({ title: is403 ? "403 Forbidden" : "Test push failed", description: msg, variant: "destructive" });
    } finally {
      setTestPushLoading(false);
    }
  };

  const fetchUsers = async () => {
    setUsersLoading(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name, username, created_at, is_blocked, blocked_reason")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setUsersList(((data as unknown as AdminUser[]) || []));
    } catch (error) {
      console.error("Failed to fetch users", error);
    } finally {
      setUsersLoading(false);
    }
  };

  const handleToggleBlock = async (userItem: AdminUser, shouldBlock: boolean, reason?: string) => {
    setSavingBlockAction(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          is_blocked: shouldBlock,
          blocked_reason: shouldBlock ? (reason || "Suspended by administration.") : null,
          blocked_at: shouldBlock ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("user_id", userItem.user_id);
      if (error) throw error;

      // Revoke any active device sessions for this user
      if (shouldBlock) {
        await supabase
          .from("auth_device_sessions" as never)
          .update({ active: false, revoked_at: new Date().toISOString(), revoked_reason: "Account blocked by administrator" } as never)
          .eq("user_id", userItem.user_id);
      }

      toast({
        title: shouldBlock ? "User Account Blocked" : "User Account Reactivated",
        description: shouldBlock
          ? `${userItem.full_name || userItem.username || "User"} has been logged out and blocked from Spendova.`
          : `${userItem.full_name || userItem.username || "User"} access has been restored.`,
      });

      setUserToBlock(null);
      setBlockReasonInput("");
      await fetchUsers();
      void fetchAnalytics(analyticsRange === "7d" ? 7 : analyticsRange === "14d" ? 14 : 30);
    } catch (error) {
      console.error("Failed to update user block status", error);
      toast({ title: "Action failed", description: getFriendlyErrorMessage(error, "admin"), variant: "destructive" });
    } finally {
      setSavingBlockAction(false);
    }
  };

  const fetchAnalytics = async (rangeDays: number = 7) => {
    setAnalyticsLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_admin_analytics_telemetry" as never, { days_back: rangeDays } as never);
      if (!error && data) {
        setAnalyticsData(data as { kpis: AnalyticsKPIs; trends: AnalyticsTrend[] });
        return;
      }
      
      // Fallback: Compute client-side from profiles and expenses
      type DynamicProfilesQuery = {
        select: (cols: string) => Promise<{ data: Array<{ created_at: string | null; is_blocked?: boolean | null }> | null }>;
      };
      type DynamicExpensesQuery = {
        select: (cols: string) => Promise<{ data: Array<{ created_at: string | null; amount: number | null; user_id: string | null }> | null }>;
      };
      const [profilesRes, expensesRes] = await Promise.all([
        (supabase.from("profiles" as unknown as "profiles") as unknown as DynamicProfilesQuery).select("created_at, is_blocked"),
        (supabase.from("expenses" as unknown as "expenses") as unknown as DynamicExpensesQuery).select("created_at, amount, user_id"),
      ]);

      const allProfiles = profilesRes.data || [];
      const allExpenses = expensesRes.data || [];

      const now = new Date();
      const trendMap: Record<string, AnalyticsTrend> = {};
      for (let i = rangeDays - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const isoDate = d.toISOString().split("T")[0];
        const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        trendMap[isoDate] = { date: isoDate, label, signups: 0, transactions: 0, volume: 0, active_users: 0 };
      }

      allProfiles.forEach((p) => {
        const d = p.created_at?.split("T")[0];
        if (d && trendMap[d]) trendMap[d].signups += 1;
      });

      const todayIso = now.toISOString().split("T")[0];
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const activeTodayUsers = new Set<string>();
      const active7dUsers = new Set<string>();

      allExpenses.forEach((e) => {
        const d = e.created_at?.split("T")[0];
        if (d && trendMap[d]) {
          trendMap[d].transactions += 1;
          trendMap[d].volume += Number(e.amount || 0);
          if (e.user_id) trendMap[d].active_users += 1;
        }
        if (d === todayIso && e.user_id) activeTodayUsers.add(e.user_id);
        if (new Date(e.created_at) >= sevenDaysAgo && e.user_id) active7dUsers.add(e.user_id);
      });

      setAnalyticsData({
        kpis: {
          total_users: allProfiles.length,
          blocked_users: allProfiles.filter((p) => p.is_blocked).length,
          total_expenses: allExpenses.length,
          total_volume: allExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0),
          active_today: activeTodayUsers.size,
          active_7d: active7dUsers.size,
        },
        trends: Object.values(trendMap),
      });
    } catch (err) {
      console.error("Telemetry fetch failed", err);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const filteredUsers = useMemo(() => {
    return usersList.filter((u) => {
      const q = userSearch.trim().toLowerCase();
      const matchQuery = !q || (u.full_name?.toLowerCase().includes(q) || u.username?.toLowerCase().includes(q) || u.user_id?.toLowerCase().includes(q));
      const matchFilter = userFilter === "all" || (userFilter === "active" && !u.is_blocked) || (userFilter === "blocked" && u.is_blocked);
      return matchQuery && matchFilter;
    });
  }, [userSearch, userFilter, usersList]);

  const fetchFeedbackEvents = async (options?: { silent?: boolean }) => {
    try {
      const { data, error } = await supabase
        .from("feedback_report_events" as never)
        .select("id,report_id,event_type,status,priority,message,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const grouped = ((data || []) as unknown as FeedbackEvent[]).reduce<Record<string, FeedbackEvent[]>>((acc, event) => {
        acc[event.report_id] = [...(acc[event.report_id] || []), event];
        return acc;
      }, {});
      setFeedbackEvents(grouped);
    } catch (error) {
      if (!options?.silent) console.warn("Could not fetch feedback event history", error);
    }
  };

  const fetchFeedbackReports = async (options?: { silent?: boolean }) => {
    if (!options?.silent) setFeedbackLoading(true);
    try {
      const { data, error } = await supabase
        .from("feedback_reports" as never)
        .select("id,user_id,type,title,description,screenshot_url,priority,status,device_info,app_version,admin_notes,internal_notes,user_update_message,created_at,updated_at,profiles!feedback_reports_user_id_fkey(user_id,full_name,username)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const reports = (data || []) as unknown as FeedbackReport[];
      setFeedbackReports(reports);
      setSelectedReportId((current) => current && reports.some((report) => report.id === current) ? current : reports[0]?.id || null);
      await fetchFeedbackEvents({ silent: true });
    } catch (error) {
      console.error("Failed to fetch feedback reports", error);
      toast({ title: "Feedback unavailable", description: getFriendlyErrorMessage(error, "feedback"), variant: "destructive" });
    } finally {
      setFeedbackLoading(false);
    }
  };

  const updateSelectedTicket = async () => {
    if (!selectedReport) return;
    setSavingReport(true);
    try {
      const { error } = await supabase.from("feedback_reports" as never).update({
        status: ticketDraft.status,
        priority: ticketDraft.priority,
        internal_notes: ticketDraft.internalNotes,
        user_update_message: ticketDraft.userMessage,
      } as never).eq("id", selectedReport.id);
      if (error) throw error;

      const { error: emailError } = await supabase.functions.invoke("feedback-ticket-email", {
        body: { mode: "updated", reportId: selectedReport.id, userUpdateMessage: ticketDraft.userMessage },
      });
      if (emailError) throw emailError;

      toast({ title: "Ticket updated", description: "Status, priority, notes, and user email were sent." });
      await fetchFeedbackReports({ silent: true });
    } catch (error) {
      console.error("Ticket update failed", error);
      toast({ title: "Update failed", description: getFriendlyErrorMessage(error, "feedback"), variant: "destructive" });
    } finally {
      setSavingReport(false);
    }
  };

  const deleteFeedbackReport = async (report: FeedbackReport) => {
    setSavingReport(true);
    try {
      if (report.screenshot_url) {
        const { error: storageError } = await supabase.storage.from("feedback-screenshots").remove([report.screenshot_url]);
        if (storageError) console.warn("Could not delete feedback screenshot", storageError);
      }
      const { error } = await supabase.from("feedback_reports" as never).delete().eq("id", report.id);
      if (error) throw error;
      toast({ title: "Report deleted", description: "The ticket and screenshot were removed." });
      await fetchFeedbackReports({ silent: true });
    } catch (error) {
      toast({ title: "Delete failed", description: getFriendlyErrorMessage(error, "delete"), variant: "destructive" });
    } finally {
      setSavingReport(false);
    }
  };

  const deleteFeedbackScreenshot = async (report: FeedbackReport) => {
    if (!report.screenshot_url || !window.confirm("Delete this feedback screenshot? The feedback ticket will remain unchanged.")) return;
    setDeletingScreenshot(true);
    try {
      const { error: storageError } = await supabase.storage.from("feedback-screenshots").remove([report.screenshot_url]);
      if (storageError && !isMissingStorageObjectError(storageError)) throw storageError;
      if (storageError) console.warn("Feedback screenshot was already missing from storage", storageError);

      const { error } = await supabase.from("feedback_reports" as never).update({ screenshot_url: null } as never).eq("id", report.id);
      if (error) throw error;

      setScreenshotPreviewUrl("");
      setFeedbackReports((current) => current.map((item) => item.id === report.id ? { ...item, screenshot_url: null } : item));
      toast({ title: "Screenshot deleted", description: "The screenshot was removed. The feedback ticket was kept." });
    } catch (error) {
      console.error("Feedback screenshot delete failed", error);
      toast({ title: "Screenshot delete failed", description: getFriendlyErrorMessage(error, "delete"), variant: "destructive" });
    } finally {
      setDeletingScreenshot(false);
    }
  };

  const toggleMaintenanceMode = async (checked: boolean) => {
    try {
      setIsMaintenance(checked);
      type SiteSettingsUpdateBuilder = {
        update: (values: Record<string, unknown>) => {
          eq: (col: string, val: number | string) => Promise<{ error: { message: string } | null }>;
        };
      };
      const settingsTable = (supabase as unknown as { from: (name: string) => SiteSettingsUpdateBuilder }).from("site_settings");
      const { error } = await settingsTable.update({ is_maintenance_mode: checked, updated_at: new Date().toISOString() }).eq("id", 1);
      if (error) throw error;
      toast({ title: "Site state updated", description: `Maintenance mode is now ${checked ? "ON" : "OFF"}.` });
    } catch (error) {
      console.error("Failed to update maintenance state", error);
      setIsMaintenance(!checked);
      toast({ title: "Update failed", description: getFriendlyErrorMessage(error, "admin"), variant: "destructive" });
    }
  };

  const handleLogout = () => {
    setSubject("");
    setMessage("");
    setTargetEmail("");
    setAttachments([]);
    signOut().finally(() => navigate("/admin/login", { replace: true }));
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    const totalSize = attachments.reduce((sum, file) => sum + file.size, 0) + files.reduce((sum, file) => sum + file.size, 0);
    if (totalSize > 100 * 1024 * 1024) {
      toast({ title: "Files too large", description: "Total attachments must be under 100MB.", variant: "destructive" });
      event.target.value = "";
      return;
    }
    files.forEach((file) => {
      setReadingFiles((count) => count + 1);
      const reader = new FileReader();
      reader.onloadend = () => {
        setReadingFiles((count) => count - 1);
        const data = reader.result as string;
        if (data) setAttachments((current) => [...current, { name: file.name, data, size: file.size }]);
      };
      reader.onerror = () => {
        setReadingFiles((count) => count - 1);
        toast({ title: "File error", description: `Failed to read "${file.name}".`, variant: "destructive" });
      };
      reader.readAsDataURL(file);
    });
    event.target.value = "";
  };

  const removeAttachment = (indexToRemove: number) => setAttachments((current) => current.filter((_, index) => index !== indexToRemove));

  const sendAdminMail = async (mode: "test" | "broadcast") => {
    if (!subject.trim() || !message.trim()) {
      toast({ title: "Required fields", description: "Please provide both a subject and a message.", variant: "destructive" });
      return;
    }
    const email = mode === "test" ? testEmail.trim() : targetEmail.trim();
    if ((mode === "test" || recipientMode === "single") && !email) {
      toast({ title: "Recipient required", description: "Enter an email address before sending.", variant: "destructive" });
      return;
    }
    setSendingMode(mode);
    try {
      const { data, error } = await supabase.functions.invoke("send-admin-mail", {
        body: {
          subject,
          htmlBody: message,
          attachments,
          recipientMode: mode === "test" || recipientMode === "single" ? "single" : "all",
          targetEmail: mode === "test" ? testEmail.trim().toLowerCase() : recipientMode === "single" ? targetEmail.trim().toLowerCase() : undefined,
          sendToAll: mode === "broadcast" && recipientMode === "all",
        },
      });
      if (error) throw error;
      toast({ title: mode === "test" ? "Test email sent" : "Email sent", description: data?.recipientCount ? `Delivered to ${data.recipientCount} recipient${data.recipientCount === 1 ? "" : "s"}.` : "The email was dispatched." });
      if (mode === "broadcast") {
        setSubject("");
        setMessage("");
        setAttachments([]);
      }
    } catch (error) {
      console.error("Broadcast error", error);
      toast({ title: "Email failed", description: getFriendlyErrorMessage(error, "admin"), variant: "destructive" });
    } finally {
      setSendingMode("");
    }
  };

  return (
    <div className="min-h-screen bg-background px-3 py-3 text-foreground sm:px-6 sm:py-5 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-3 sm:space-y-5">
        {/* Executive Command Header - Desktop */}
        <header className="hidden sm:flex flex-col gap-3.5 rounded-[1.25rem] border border-border/80 bg-card p-4 shadow-panel sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid size-11 shrink-0 place-items-center rounded-2xl border border-primary/20 bg-primary/10 p-2 shadow-soft">
              <img src="/brand/spendova-symbol.png" alt="Spendova" className="size-6 object-contain" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">
                  Operations Console
                </h1>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-elevated px-2 py-0.5 text-[11px] font-semibold text-foreground">
                  <span className={`size-1.5 rounded-full ${isMaintenance ? "bg-amber-500 animate-pulse" : "bg-emerald-500"}`} />
                  {isMaintenance ? "Maintenance Active" : "Systems Normal"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Spendova Platform Command &amp; Telemetry
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void fetchMaintenanceState();
                void fetchFeedbackReports();
                void fetchAppRatings();
              }}
              className="h-9 rounded-xl border-border bg-elevated/60 text-xs font-semibold hover:bg-elevated"
            >
              <RefreshCw className="mr-1.5 size-3.5" />
              Sync Data
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              className="h-9 rounded-xl border-destructive/20 text-xs font-semibold text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <LogOut className="mr-1.5 size-3.5" />
              Sign Out
            </Button>
          </div>
        </header>

        {/* High-Density Header - Mobile */}
        <header className="flex sm:hidden items-center justify-between gap-2 rounded-2xl border border-border/80 bg-card px-3.5 py-2.5 shadow-soft">
          <div className="flex items-center gap-2.5">
            <div className="grid size-8 place-items-center rounded-xl border border-primary/20 bg-primary/10 p-1">
              <img src="/brand/spendova-symbol.png" alt="Spendova" className="size-4 object-contain" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight text-foreground leading-tight">
                Ops Console
              </h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`size-1.5 rounded-full ${isMaintenance ? "bg-amber-500 animate-pulse" : "bg-emerald-500"}`} />
                <span className="text-[10px] font-semibold text-muted-foreground">
                  {isMaintenance ? "Maintenance Active" : "Systems Normal"}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                void fetchMaintenanceState();
                void fetchFeedbackReports();
                void fetchAppRatings();
              }}
              className="size-8 rounded-xl border-border bg-elevated/60 text-foreground"
              aria-label="Sync Data"
              title="Sync Data"
            >
              <RefreshCw className="size-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={handleLogout}
              className="size-8 rounded-xl border-destructive/20 text-destructive hover:bg-destructive/10"
              aria-label="Sign Out"
              title="Sign Out"
            >
              <LogOut className="size-3.5" />
            </Button>
          </div>
        </header>

        {/* Mobile Emergency Killswitch Strip */}
        <div className={`sm:hidden rounded-2xl border px-3.5 py-2.5 transition-all shadow-soft flex items-center justify-between gap-3 ${
          isMaintenance
            ? "border-destructive/60 bg-destructive/15 ring-1 ring-destructive/30"
            : "border-border/80 bg-card"
        }`}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`grid size-7 shrink-0 place-items-center rounded-lg ${
              isMaintenance ? "bg-destructive/20 text-destructive" : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
            }`}>
              <ShieldCheck className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-foreground truncate">
                {isMaintenance ? "MAINTENANCE ACTIVE" : "Public Traffic Live"}
              </p>
              <p className="text-[10px] text-muted-foreground truncate">
                {isMaintenance ? "Users redirected to /maintenance" : "All services accepting user traffic"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] font-bold text-foreground">
              {isMaintenance ? "Active" : "Standby"}
            </span>
            <Switch
              checked={isMaintenance}
              onCheckedChange={toggleMaintenanceMode}
              disabled={fetchingMaintenance}
              className="data-[state=checked]:bg-destructive scale-90"
            />
          </div>
        </div>

        {/* Command Stations Navigation Deck - Desktop */}
        <div className="hidden sm:flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          {[
            {
              id: "analytics" as const,
              label: "Usage Telemetry & Trends",
              badge: analyticsData ? `${analyticsData.kpis.active_today} Today` : null,
              icon: TrendingUp,
            },
            {
              id: "users" as const,
              label: "User Governance",
              badge: usersList.length ? `${usersList.length}` : null,
              icon: Users,
            },
            {
              id: "controls" as const,
              label: "System Controls & Alerts",
              badge: isMaintenance ? "Maintenance" : "Live",
              icon: Settings,
            },
            {
              id: "ratings" as const,
              label: "User Ratings & Reviews",
              badge: `${ratingStats.average} (${ratingStats.total})`,
              icon: Star,
            },
            {
              id: "tickets" as const,
              label: "Support Tickets",
              badge: feedbackStats.open > 0 ? `${feedbackStats.open} Open` : null,
              icon: MessageSquare,
            },
            {
              id: "broadcast" as const,
              label: "Broadcast & Comms",
              badge: null,
              icon: Send,
            },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = adminTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setAdminTab(tab.id);
                  if (tab.id === "ratings" && !appRatings.length) void fetchAppRatings();
                  if (tab.id === "users" && !usersList.length) void fetchUsers();
                  if (tab.id === "analytics" && !analyticsData) void fetchAnalytics(analyticsRange === "7d" ? 7 : analyticsRange === "14d" ? 14 : 30);
                }}
                className={`flex shrink-0 items-center gap-2 rounded-2xl px-4 py-2.5 text-xs sm:text-sm font-semibold transition-all ${
                  active
                    ? "bg-primary text-primary-foreground shadow-primary-action"
                    : "bg-card text-muted-foreground border border-border/60 hover:bg-elevated hover:text-foreground"
                }`}
              >
                <Icon className={`size-4 ${active ? "text-primary-foreground" : "text-muted-foreground"}`} />
                <span>{tab.label}</span>
                {tab.badge && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      active
                        ? "bg-primary-foreground/20 text-primary-foreground"
                        : "bg-elevated text-muted-foreground border border-border/40"
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Command Stations Navigation Deck - Mobile (3x2 Touch Matrix) */}
        <div className="sm:hidden grid grid-cols-3 gap-1.5 rounded-2xl border border-border bg-card p-1.5 shadow-soft">
          {[
            { id: "analytics" as const, label: "Telemetry", badge: analyticsData ? `${analyticsData.kpis.active_today}` : null, icon: TrendingUp },
            { id: "users" as const, label: "Users", badge: usersList.length ? `${usersList.length}` : null, icon: Users },
            { id: "controls" as const, label: "Controls", badge: isMaintenance ? "!" : null, icon: Settings },
            { id: "ratings" as const, label: "Ratings", badge: `${ratingStats.average}★`, icon: Star },
            { id: "tickets" as const, label: "Tickets", badge: feedbackStats.open > 0 ? `${feedbackStats.open}` : null, icon: MessageSquare },
            { id: "broadcast" as const, label: "Broadcast", badge: null, icon: Send },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = adminTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setAdminTab(tab.id);
                  if (tab.id === "ratings" && !appRatings.length) void fetchAppRatings();
                  if (tab.id === "users" && !usersList.length) void fetchUsers();
                  if (tab.id === "analytics" && !analyticsData) void fetchAnalytics(analyticsRange === "7d" ? 7 : analyticsRange === "14d" ? 14 : 30);
                }}
                className={`relative flex flex-col items-center justify-center py-2 px-1 rounded-xl text-center transition-all ${
                  active
                    ? "bg-primary text-primary-foreground shadow-primary-action font-bold"
                    : "text-muted-foreground hover:text-foreground hover:bg-elevated/50"
                }`}
              >
                <div className="relative">
                  <Icon className={`size-4 ${active ? "text-primary-foreground" : "text-muted-foreground"}`} />
                  {tab.badge && (
                    <span className={`absolute -top-1 -right-3 rounded-full px-1 py-0.5 text-[9px] font-extrabold leading-none ${
                      tab.badge === "!"
                        ? "bg-destructive text-destructive-foreground animate-pulse"
                        : active
                        ? "bg-primary-foreground text-primary"
                        : "bg-primary text-primary-foreground"
                    }`}>
                      {tab.badge}
                    </span>
                  )}
                </div>
                <span className="text-[10px] mt-1 font-semibold leading-tight">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Station: Platform Usage Telemetry & Trend Analysis */}
        {adminTab === "analytics" && (
          <Card className="rounded-[1.25rem] border border-border/80 bg-card shadow-panel">
            <CardHeader className="p-3.5 sm:p-6 space-y-3 sm:space-y-4 pb-3 sm:pb-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-foreground text-base sm:text-xl">
                    <TrendingUp className="size-4 sm:size-5 text-primary" />
                    Usage Telemetry &amp; Daily Trends
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    Real-time daily active users (DAU), engagement velocity, and financial telemetry.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex rounded-xl border border-border bg-elevated/70 p-1">
                    {(["7d", "14d", "30d"] as const).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setAnalyticsRange(r)}
                        className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                          analyticsRange === r
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {r.toUpperCase()}
                      </button>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fetchAnalytics(analyticsRange === "7d" ? 7 : analyticsRange === "14d" ? 14 : 30)}
                    disabled={analyticsLoading}
                    className="h-8 sm:h-9 rounded-xl border-border bg-elevated/60 text-xs font-semibold hover:bg-elevated"
                  >
                    <RefreshCw className={`mr-1.5 size-3.5 ${analyticsLoading ? "animate-spin" : ""}`} />
                    Refresh
                  </Button>
                </div>
              </div>

              {/* Telemetry Metric Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3">
                <div className="rounded-2xl border border-border bg-elevated p-3 sm:p-3.5 shadow-soft">
                  <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                    <span className="truncate">ACTIVE TODAY</span>
                    <Activity className="size-3.5 sm:size-4 text-emerald-500" />
                  </div>
                  <p className="mt-1 sm:mt-1.5 text-xl sm:text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
                    {analyticsData?.kpis.active_today ?? 0}
                  </p>
                  <p className="text-[10px] sm:text-[11px] text-muted-foreground mt-0.5 truncate">Unique DAU active</p>
                </div>

                <div className="rounded-2xl border border-border bg-elevated p-3 sm:p-3.5 shadow-soft">
                  <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                    <span className="truncate">WEEKLY (WAU)</span>
                    <TrendingUp className="size-3.5 sm:size-4 text-primary" />
                  </div>
                  <p className="mt-1 sm:mt-1.5 text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                    {analyticsData?.kpis.active_7d ?? 0}
                  </p>
                  <p className="text-[10px] sm:text-[11px] text-muted-foreground mt-0.5 truncate">Past 7 days active</p>
                </div>

                <div className="rounded-2xl border border-border bg-elevated p-3 sm:p-3.5 shadow-soft">
                  <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                    <span className="truncate">TOTAL ACCOUNTS</span>
                    <Users className="size-3.5 sm:size-4 text-primary" />
                  </div>
                  <p className="mt-1 sm:mt-1.5 text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                    {analyticsData?.kpis.total_users ?? 0}
                  </p>
                  <p className="text-[10px] sm:text-[11px] text-muted-foreground mt-0.5 truncate">Registered users</p>
                </div>

                <div className="rounded-2xl border border-border bg-elevated p-3 sm:p-3.5 shadow-soft">
                  <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                    <span className="truncate">SUSPENDED</span>
                    <ShieldAlert className="size-3.5 sm:size-4 text-destructive" />
                  </div>
                  <p className="mt-1 sm:mt-1.5 text-xl sm:text-2xl font-bold tracking-tight text-destructive">
                    {analyticsData?.kpis.blocked_users ?? 0}
                  </p>
                  <p className="text-[10px] sm:text-[11px] text-muted-foreground mt-0.5 truncate">Restricted logins</p>
                </div>

                <div className="rounded-2xl border border-border bg-elevated p-3 sm:p-3.5 shadow-soft">
                  <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                    <span className="truncate">TRANSACTIONS</span>
                    <FileText className="size-3.5 sm:size-4 text-primary" />
                  </div>
                  <p className="mt-1 sm:mt-1.5 text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                    {analyticsData?.kpis.total_expenses ?? 0}
                  </p>
                  <p className="text-[10px] sm:text-[11px] text-muted-foreground mt-0.5 truncate">Recorded expenses</p>
                </div>

                <div className="rounded-2xl border border-border bg-elevated p-3 sm:p-3.5 shadow-soft">
                  <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                    <span className="truncate">VOLUME LOGGED</span>
                    <Server className="size-3.5 sm:size-4 text-primary" />
                  </div>
                  <p className="mt-1 sm:mt-1.5 text-base sm:text-xl font-bold tracking-tight text-foreground truncate">
                    ₹{(analyticsData?.kpis.total_volume ?? 0).toLocaleString("en-IN")}
                  </p>
                  <p className="text-[10px] sm:text-[11px] text-muted-foreground mt-0.5 truncate">Total tracked value</p>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-6">
              {/* Responsive Charts Section */}
              <div className="grid gap-5 lg:grid-cols-2">
                {/* Chart 1: Daily Active Users & Growth */}
                <div className="rounded-2xl border border-border bg-elevated/60 p-4 shadow-soft">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-sm font-bold text-foreground">Daily Active Users &amp; Signups</h3>
                      <p className="text-xs text-muted-foreground">Unique daily users active vs newly registered accounts</p>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="flex items-center gap-1.5">
                        <span className="size-2.5 rounded-full bg-emerald-500" />
                        <span className="text-muted-foreground">Active Users</span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="size-2.5 rounded-full bg-primary" />
                        <span className="text-muted-foreground">New Signups</span>
                      </span>
                    </div>
                  </div>
                  <div className="h-56 sm:h-64 w-full">
                    {analyticsData?.trends && analyticsData.trends.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={analyticsData.trends} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <defs>
                            <linearGradient id="activeUsersGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="signupsGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                              <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(150,150,150,0.15)" />
                          <XAxis dataKey="label" stroke="#888888" fontSize={11} tickLine={false} />
                          <YAxis stroke="#888888" fontSize={11} allowDecimals={false} tickLine={false} />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "rgba(15, 23, 42, 0.95)",
                              borderRadius: "1rem",
                              border: "1px solid rgba(255,255,255,0.1)",
                              color: "#fff",
                              boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
                            }}
                          />
                          <Area type="monotone" dataKey="active_users" name="Active Users" stroke="#10b981" strokeWidth={2.5} fillOpacity={1} fill="url(#activeUsersGrad)" />
                          <Area type="monotone" dataKey="signups" name="New Signups" stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill="url(#signupsGrad)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                        Telemetry data loading...
                      </div>
                    )}
                  </div>
                </div>

                {/* Chart 2: Daily Transaction Volume & Velocity */}
                <div className="rounded-2xl border border-border bg-elevated/60 p-4 shadow-soft">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-sm font-bold text-foreground">Transaction Velocity &amp; Logs</h3>
                      <p className="text-xs text-muted-foreground">Daily expense submissions across all active users</p>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="flex items-center gap-1.5">
                        <span className="size-2.5 rounded-full bg-primary" />
                        <span className="text-muted-foreground">Transactions</span>
                      </span>
                    </div>
                  </div>
                  <div className="h-56 sm:h-64 w-full">
                    {analyticsData?.trends && analyticsData.trends.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={analyticsData.trends} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(150,150,150,0.15)" />
                          <XAxis dataKey="label" stroke="#888888" fontSize={11} tickLine={false} />
                          <YAxis stroke="#888888" fontSize={11} allowDecimals={false} tickLine={false} />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "rgba(15, 23, 42, 0.95)",
                              borderRadius: "1rem",
                              border: "1px solid rgba(255,255,255,0.1)",
                              color: "#fff",
                              boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
                            }}
                          />
                          <Bar dataKey="transactions" name="Transactions" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                        Telemetry data loading...
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Daily Telemetry Ledger Breakdown */}
              <div className="rounded-2xl border border-border bg-elevated/40 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-bold text-foreground">Daily Breakdown Ledger</h3>
                    <p className="text-xs text-muted-foreground">Chronological telemetry audit for the selected timeframe</p>
                  </div>
                  <span className="rounded-full bg-elevated px-2.5 py-0.5 text-xs font-semibold text-muted-foreground border border-border">
                    {analyticsData?.trends.length ?? 0} Days Audited
                  </span>
                </div>

                {/* Mobile View: High density stacked cards */}
                <div className="sm:hidden space-y-2">
                  {analyticsData?.trends.slice().reverse().map((t) => (
                    <div key={t.date} className="rounded-xl border border-border/70 bg-card p-3 shadow-soft flex items-center justify-between">
                      <div>
                        <p className="text-xs font-bold text-foreground">{t.label}</p>
                        <p className="text-[10px] text-muted-foreground">{t.date}</p>
                      </div>
                      <div className="flex items-center gap-3 text-right">
                        <div>
                          <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">{t.active_users} DAU</p>
                          <p className="text-[10px] text-muted-foreground">+{t.signups} new</p>
                        </div>
                        <div className="border-l border-border/80 pl-3">
                          <p className="text-xs font-bold text-foreground">{t.transactions} tx</p>
                          <p className="text-[10px] text-muted-foreground truncate max-w-[70px]">₹{t.volume.toLocaleString("en-IN")}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop View: Full Audit Table */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground">
                        <th className="pb-2.5 font-bold uppercase tracking-wider">Date</th>
                        <th className="pb-2.5 font-bold uppercase tracking-wider">Active Users (DAU)</th>
                        <th className="pb-2.5 font-bold uppercase tracking-wider">New Registrations</th>
                        <th className="pb-2.5 font-bold uppercase tracking-wider">Transactions Logged</th>
                        <th className="pb-2.5 font-bold uppercase tracking-wider text-right">Total Volume</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {analyticsData?.trends.slice().reverse().map((t) => (
                        <tr key={t.date} className="hover:bg-elevated/70 transition-colors">
                          <td className="py-2.5 font-semibold text-foreground">{t.label} <span className="text-[10px] font-normal text-muted-foreground ml-1">({t.date})</span></td>
                          <td className="py-2.5 font-bold text-emerald-600 dark:text-emerald-400">{t.active_users} users</td>
                          <td className="py-2.5 font-medium text-foreground">+{t.signups} accounts</td>
                          <td className="py-2.5 font-medium text-foreground">{t.transactions} transactions</td>
                          <td className="py-2.5 font-bold text-right text-foreground">₹{t.volume.toLocaleString("en-IN")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Station: User Account Governance */}
        {adminTab === "users" && (
          <Card className="rounded-[1.25rem] border border-border/80 bg-card shadow-panel">
            <CardHeader className="p-3.5 sm:p-6 space-y-3 sm:space-y-4 pb-3 sm:pb-4">
              <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-foreground text-base sm:text-xl">
                    <Users className="size-4 sm:size-5 text-primary" />
                    User Account Governance &amp; Access Controls
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    Search registered accounts, monitor activity, and temporarily suspend or restore access.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={fetchUsers}
                    disabled={usersLoading}
                    className="h-8 sm:h-9 rounded-xl border-border bg-elevated/60 text-xs font-semibold hover:bg-elevated"
                  >
                    <RefreshCw className={`mr-1.5 size-3.5 ${usersLoading ? "animate-spin" : ""}`} />
                    Refresh
                  </Button>
                </div>
              </div>

              {/* Search & Filter Bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-1">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Search by name, username, or ID..."
                    className="h-10 sm:h-11 rounded-2xl pl-9 text-xs sm:text-sm"
                  />
                </div>
                <div className="flex items-center gap-1.5 overflow-x-auto">
                  {(["all", "active", "blocked"] as const).map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => setUserFilter(filter)}
                      className={`rounded-xl px-3 py-2 text-xs font-semibold whitespace-nowrap transition-all ${
                        userFilter === filter
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "bg-elevated text-muted-foreground border border-border hover:text-foreground"
                      }`}
                    >
                      {filter === "all" ? `All (${usersList.length})` : filter === "active" ? `Active (${usersList.filter((u) => !u.is_blocked).length})` : `Suspended (${usersList.filter((u) => u.is_blocked).length})`}
                    </button>
                  ))}
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-3">
              {usersLoading ? (
                <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                  <RefreshCw className="size-6 animate-spin mb-2 text-primary" />
                  <p className="text-xs">Loading registered accounts...</p>
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border py-12 text-center text-muted-foreground">
                  <Users className="mx-auto size-8 mb-2 opacity-50" />
                  <p className="text-sm font-semibold text-foreground">No accounts found</p>
                  <p className="text-xs mt-1">Try adjusting your search query or filter</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredUsers.map((item) => {
                    const initials = (item.full_name || item.username || "U").slice(0, 2).toUpperCase();
                    const joinedFormatted = item.created_at ? new Date(item.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Unknown";
                    return (
                      <div
                        key={item.user_id}
                        className={`rounded-2xl border p-3.5 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-soft ${
                          item.is_blocked
                            ? "border-destructive/40 bg-destructive/5 ring-1 ring-destructive/20"
                            : "border-border/80 bg-card hover:border-border"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`grid size-10 shrink-0 place-items-center rounded-2xl text-xs font-bold ${
                            item.is_blocked ? "bg-destructive/20 text-destructive" : "bg-primary/15 text-primary"
                          }`}>
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-bold text-foreground truncate">
                                {item.full_name || item.username || "Spendova User"}
                              </p>
                              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                item.is_blocked
                                  ? "bg-destructive/15 text-destructive border border-destructive/30"
                                  : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                              }`}>
                                <span className={`size-1.5 rounded-full ${item.is_blocked ? "bg-destructive" : "bg-emerald-500"}`} />
                                {item.is_blocked ? "Suspended" : "Active"}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mt-0.5">
                              {item.username && <span>@{item.username}</span>}
                              <span>•</span>
                              <span>Joined {joinedFormatted}</span>
                            </div>
                            {item.is_blocked && item.blocked_reason && (
                              <p className="mt-1 text-xs text-destructive font-medium">
                                Reason: {item.blocked_reason}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/60">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setTestPushUsername(item.username || item.full_name || "");
                              setAdminTab("controls");
                            }}
                            className="h-8 sm:h-9 rounded-xl border-border bg-elevated/60 text-xs font-semibold hover:bg-elevated text-foreground"
                            title="Test Push Notification to this user"
                          >
                            <Bell className="mr-1.5 size-3.5 text-primary" />
                            Test Push
                          </Button>
                          {item.is_blocked ? (
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => handleToggleBlock(item, false)}
                              disabled={savingBlockAction}
                              className="h-8 sm:h-9 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-soft"
                            >
                              <UserCheck className="mr-1.5 size-3.5" />
                              Restore Access
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setUserToBlock(item);
                                setBlockReasonInput("");
                              }}
                              disabled={savingBlockAction}
                              className="h-8 sm:h-9 rounded-xl border-destructive/30 text-destructive hover:bg-destructive/10 text-xs font-semibold"
                            >
                              <UserX className="mr-1.5 size-3.5" />
                              Suspend / Block
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Station 1: In-App Ratings & Feedback Telemetry */}
        {adminTab === "ratings" && (
          <Card className="rounded-[1.25rem] border border-border/80 bg-card shadow-panel">
            <CardHeader className="p-3.5 sm:p-6 space-y-3 sm:space-y-4 pb-3 sm:pb-4">
              <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-foreground text-base sm:text-xl">
                    <BarChart3 className="size-4 sm:size-5 text-primary" />
                    In-App Ratings &amp; Telemetry
                  </CardTitle>
                  <CardDescription className="hidden sm:block text-xs sm:text-sm">
                    Real-time customer satisfaction analytics, ratings distribution, and campaign rollout management.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    onClick={() => setShowRolloutModal(true)}
                    disabled={rollingOutRound}
                    className="h-8 sm:h-9 rounded-xl bg-primary px-3 sm:px-3.5 text-xs font-semibold text-primary-foreground shadow-primary-action transition-all hover:opacity-90"
                  >
                    <Radio className="mr-1.5 size-3.5" />
                    {rollingOutRound
                      ? "Rolling out..."
                      : currentRound === 0
                      ? "Roll Out Campaign"
                      : `Roll Out R${currentRound + 1}`}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fetchAppRatings()}
                    disabled={ratingsLoading}
                    className="h-8 sm:h-9 rounded-xl border-border bg-elevated/60 text-xs font-semibold hover:bg-elevated"
                  >
                    <RefreshCw className={`mr-1.5 size-3.5 ${ratingsLoading ? "animate-spin" : ""}`} />
                    Refresh
                  </Button>
                </div>
              </div>

              {/* Telemetry Metrics Grid - Desktop */}
              <div className="hidden sm:grid sm:grid-cols-2 md:grid-cols-5 gap-3">
                <div className="rounded-2xl border border-border bg-elevated p-3.5 shadow-soft">
                  <div className="flex items-center justify-between gap-2 text-xs font-semibold text-muted-foreground">
                    <span>AVERAGE SCORE</span>
                    <Star className="size-4 fill-amber-400 text-amber-400" />
                  </div>
                  <div className="mt-1.5 flex items-baseline gap-1">
                    <p className="text-2xl font-bold tracking-tight text-foreground">{ratingStats.average}</p>
                    <span className="text-xs font-medium text-muted-foreground">/ 5.0</span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">{ratingStats.total} total submissions</p>
                </div>

                <div className="rounded-2xl border border-border bg-elevated p-3.5 shadow-soft">
                  <div className="flex items-center justify-between gap-2 text-xs font-semibold text-muted-foreground">
                    <span>TOTAL REVIEWS</span>
                    <Users className="size-4 text-primary" />
                  </div>
                  <p className="mt-1.5 text-2xl font-bold tracking-tight text-foreground">{ratingStats.total}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">Across all rounds</p>
                </div>

                <div className="rounded-2xl border border-border bg-elevated p-3.5 shadow-soft">
                  <div className="flex items-center justify-between gap-2 text-xs font-semibold text-muted-foreground">
                    <span>POSITIVE</span>
                    <ThumbsUp className="size-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <p className="mt-1.5 text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">{ratingStats.positive}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">4-5 Star ratings</p>
                </div>

                <div className="rounded-2xl border border-border bg-elevated p-3.5 shadow-soft">
                  <div className="flex items-center justify-between gap-2 text-xs font-semibold text-muted-foreground">
                    <span>NEEDS ATTENTION</span>
                    <ThumbsDown className="size-4 text-amber-500" />
                  </div>
                  <p className="mt-1.5 text-2xl font-bold tracking-tight text-amber-500">{ratingStats.negative + ratingStats.neutral}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">1-3 Star ratings</p>
                </div>

                <div className="rounded-2xl border border-border bg-elevated p-3.5 shadow-soft">
                  <div className="flex items-center justify-between gap-2 text-xs font-semibold text-muted-foreground">
                    <span>CAMPAIGN</span>
                    <Activity className="size-4 text-primary" />
                  </div>
                  <p className={`mt-1.5 text-lg font-bold tracking-tight ${currentRound === 0 ? "text-amber-500" : "text-primary"}`}>
                    {currentRound === 0 ? "Inactive" : `Round ${currentRound}`}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {currentRound === 0 ? "Not yet deployed" : "Active for accounts ≥ 4d"}
                  </p>
                </div>
              </div>

              {/* Telemetry Metrics Strip - Mobile (Ultra-Compact) */}
              <div className="sm:hidden grid grid-cols-3 gap-2 pt-0.5">
                <div className="rounded-xl border border-border bg-elevated p-2 text-center">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase">Score</p>
                  <p className="text-base font-bold text-foreground mt-0.5">{ratingStats.average} <span className="text-[10px] font-normal text-amber-500">★</span></p>
                  <p className="text-[9px] text-muted-foreground truncate">{ratingStats.total} reviews</p>
                </div>
                <div className="rounded-xl border border-border bg-elevated p-2 text-center">
                  <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">Positive</p>
                  <p className="text-base font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">{ratingStats.positive}</p>
                  <p className="text-[9px] text-muted-foreground truncate">4-5 Stars</p>
                </div>
                <div className="rounded-xl border border-border bg-elevated p-2 text-center">
                  <p className="text-[10px] font-bold text-amber-500 uppercase">Attention</p>
                  <p className="text-base font-bold text-amber-500 mt-0.5">{ratingStats.negative + ratingStats.neutral}</p>
                  <p className="text-[9px] text-muted-foreground truncate">1-3 Stars</p>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Filter bar */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={ratingFilters.search}
                    onChange={(e) => setRatingFilters((prev) => ({ ...prev, search: e.target.value }))}
                    placeholder="Search user, tag, or comment..."
                    className="h-11 rounded-2xl pl-9 focus-visible:ring-inset"
                  />
                </div>
                <AdminSelect
                  value={ratingFilters.rating}
                  onChange={(rating) => setRatingFilters((prev) => ({ ...prev, rating }))}
                  options={[
                    { value: "all", label: "All Ratings" },
                    { value: "5", label: "5 Stars (Excellent)" },
                    { value: "4", label: "4 Stars (Good)" },
                    { value: "3", label: "3 Stars (Average)" },
                    { value: "2", label: "2 Stars (Needs Work)" },
                    { value: "1", label: "1 Star (Poor)" },
                  ]}
                />
                <AdminSelect
                  value={ratingFilters.sentiment}
                  onChange={(sentiment) => setRatingFilters((prev) => ({ ...prev, sentiment }))}
                  options={[
                    { value: "all", label: "All Sentiments" },
                    { value: "positive", label: "Positive (4-5 Stars)" },
                    { value: "neutral", label: "Neutral (3 Stars)" },
                    { value: "negative", label: "Critical (1-2 Stars)" },
                  ]}
                />
                <AdminSelect
                  value={ratingFilters.round}
                  onChange={(round) => setRatingFilters((prev) => ({ ...prev, round }))}
                  options={[
                    { value: "all", label: "All Rounds" },
                    ...availableRounds.map((r) => ({ value: String(r), label: `Campaign Round ${r}` })),
                  ]}
                />
              </div>

              {/* Reviews List */}
              <div className="max-h-[640px] space-y-3 overflow-y-auto overscroll-contain pr-1">
                {filteredRatings.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-elevated p-8 text-center">
                    <Star className="size-8 text-muted-foreground/40 mb-2" />
                    <p className="text-sm font-semibold text-foreground">No ratings found</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {currentRound === 0
                        ? "Campaign is currently inactive (Round 0). Click 'Roll Out Feedback Campaign' above to launch it."
                        : appRatings.length === 0
                        ? "Campaign is active! Eligible users (4+ days old) will receive the feedback modal on their next app open."
                        : "Try adjusting your filters above."}
                    </p>
                  </div>
                ) : (
                  filteredRatings.map((review) => {
                    const isPositive = review.rating >= 4;
                    const isCritical = review.rating <= 2;
                    const userName = review.profiles?.full_name || "Spendova User";
                    const username = review.profiles?.username ? `@${review.profiles.username}` : "";
                    const dateFormatted = new Date(review.created_at).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    });

                    return (
                      <div
                        key={review.id}
                        className="rounded-2xl border border-border bg-elevated p-4 shadow-soft transition-all hover:border-primary/30"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <span className="grid size-10 place-items-center rounded-full bg-card text-sm font-bold text-primary">
                              {userName.charAt(0).toUpperCase()}
                            </span>
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="text-sm font-bold text-foreground">{userName}</h4>
                                {username && (
                                  <span className="text-xs text-muted-foreground">{username}</span>
                                )}
                              </div>
                              <p className="text-[11px] text-muted-foreground">{dateFormatted}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="rounded-full bg-card px-2.5 py-0.5 text-[10px] font-semibold text-muted-foreground border border-border/40">
                              Round {review.round_number}
                            </span>
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                                isPositive
                                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                  : isCritical
                                  ? "bg-destructive/15 text-destructive"
                                  : "bg-amber-500/15 text-amber-500"
                              }`}
                            >
                              {review.sentiment.toUpperCase()}
                            </span>
                          </div>
                        </div>

                        {/* Star Rating display with SVG stars */}
                        <div className="mt-3 flex items-center gap-1.5">
                          <div className="flex items-center">
                            {[1, 2, 3, 4, 5].map((s) => (
                              <Star
                                key={s}
                                className={`size-4 ${
                                  s <= review.rating
                                    ? "fill-amber-400 text-amber-400"
                                    : "text-muted-foreground/30"
                                }`}
                              />
                            ))}
                          </div>
                          <span className="text-xs font-bold text-foreground">
                            {review.rating} of 5
                          </span>
                        </div>

                        {/* Selected Tags */}
                        {review.selected_tags && review.selected_tags.length > 0 && (
                          <div className="mt-2.5 flex flex-wrap gap-1.5">
                            {review.selected_tags.map((tag) => (
                              <span
                                key={tag}
                                className="rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-[11px] font-medium text-primary"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Review text */}
                        {review.comment && (
                          <div className="mt-2.5 rounded-xl bg-card/60 p-3 border border-border/30 text-xs text-foreground leading-relaxed">
                            &ldquo;{review.comment}&rdquo;
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Station 2: Support Tickets & Issues */}
        {adminTab === "tickets" && (
          <Card className="rounded-[1.25rem] border border-border/80 bg-card shadow-panel">
            <CardHeader className="p-3.5 sm:p-6 space-y-3 sm:space-y-4 pb-3 sm:pb-4">
              <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-foreground text-base sm:text-xl">
                    <MessageSquare className="size-4 sm:size-5 text-primary" />
                    Support Tickets &amp; Inquiries
                  </CardTitle>
                  <CardDescription className="hidden sm:block text-xs sm:text-sm">
                    Review, triage, investigate, and resolve user-reported tickets and inquiries.
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fetchFeedbackReports()}
                  disabled={feedbackLoading}
                  className="h-8 sm:h-9 self-start sm:self-auto rounded-xl border-border bg-elevated/60 text-xs font-semibold hover:bg-elevated"
                >
                  <RefreshCw className={`mr-1.5 size-3.5 ${feedbackLoading ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>

              {/* Tickets Metrics Grid - Desktop */}
              <div className="hidden sm:grid sm:grid-cols-2 md:grid-cols-5 gap-3">
                {[
                  ["TOTAL TICKETS", feedbackStats.total, Inbox, "text-foreground"],
                  ["OPEN", feedbackStats.open, Clock, "text-primary"],
                  ["INVESTIGATING", feedbackStats.investigating, Search, "text-amber-500"],
                  ["RESOLVED", feedbackStats.resolved, CheckCircle2, "text-emerald-600 dark:text-emerald-400"],
                  ["CRITICAL", feedbackStats.critical, AlertTriangle, "text-destructive"],
                ].map(([label, value, IconComponent, colorClass]) => {
                  const Icon = IconComponent as React.ElementType;
                  return (
                    <div key={String(label)} className="rounded-2xl border border-border bg-elevated p-3.5 shadow-soft">
                      <div className="flex items-center justify-between gap-2 text-xs font-semibold text-muted-foreground">
                        <span>{String(label)}</span>
                        <Icon className="size-4 text-primary" />
                      </div>
                      <p className={`mt-1.5 text-2xl font-bold tracking-tight ${String(colorClass)}`}>{String(value)}</p>
                    </div>
                  );
                })}
              </div>

              {/* Tickets Metrics Strip - Mobile */}
              <div className="sm:hidden grid grid-cols-3 gap-2 pt-0.5">
                <div className="rounded-xl border border-border bg-elevated p-2 text-center">
                  <p className="text-[10px] font-bold text-primary uppercase">Open</p>
                  <p className="text-base font-bold text-foreground mt-0.5">{feedbackStats.open}</p>
                  <p className="text-[9px] text-muted-foreground truncate">{feedbackStats.total} total</p>
                </div>
                <div className="rounded-xl border border-border bg-elevated p-2 text-center">
                  <p className="text-[10px] font-bold text-destructive uppercase">Critical</p>
                  <p className="text-base font-bold text-destructive mt-0.5">{feedbackStats.critical}</p>
                  <p className="text-[9px] text-muted-foreground truncate">Urgent triage</p>
                </div>
                <div className="rounded-xl border border-border bg-elevated p-2 text-center">
                  <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">Resolved</p>
                  <p className="text-base font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">{feedbackStats.resolved}</p>
                  <p className="text-[9px] text-muted-foreground truncate">Closed tickets</p>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-3.5 sm:p-6 space-y-4 pt-0 sm:pt-0">
              {/* Ticket Filters */}
              <div className="grid gap-2 sm:gap-3 grid-cols-2 lg:grid-cols-5">
                <div className="relative col-span-2 lg:col-span-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={feedbackFilters.search}
                    onChange={(event) => setFeedbackFilters((current) => ({ ...current, search: event.target.value }))}
                    placeholder="Search tickets..."
                    className="h-11 rounded-2xl pl-9 focus-visible:ring-inset"
                  />
                </div>
                <AdminSelect
                  value={feedbackFilters.type}
                  onChange={(type) => setFeedbackFilters((current) => ({ ...current, type }))}
                  options={feedbackTypes.map((option) => ({ value: option.value, label: option.label }))}
                />
                <AdminSelect
                  value={feedbackFilters.status}
                  onChange={(status) => setFeedbackFilters((current) => ({ ...current, status }))}
                  options={feedbackStatuses.map((status) => ({
                    value: status,
                    label: status === "all" ? "All Statuses" : feedbackStatusLabel(status as FeedbackReport["status"]),
                  }))}
                />
                <AdminSelect
                  value={feedbackFilters.priority}
                  onChange={(priority) => setFeedbackFilters((current) => ({ ...current, priority }))}
                  options={feedbackPriorities.map((priority) => ({
                    value: priority,
                    label: priority === "all" ? "All Priorities" : feedbackPriorityLabel(priority as FeedbackReport["priority"]),
                  }))}
                />
                <Input
                  type="date"
                  value={feedbackFilters.date}
                  onChange={(event) => setFeedbackFilters((current) => ({ ...current, date: event.target.value }))}
                  className="h-11 rounded-2xl focus-visible:ring-inset"
                />
              </div>

              {/* Master-Detail Ticket Workspace */}
              <div className="grid overflow-hidden rounded-2xl border border-border bg-elevated lg:grid-cols-[minmax(300px,0.9fr)_minmax(0,1.3fr)]">
                {/* Tickets List */}
                <div className={`${mobileTicketView === "detail" && selectedReport ? "hidden lg:block" : "block"} border-b border-border bg-card/45 lg:border-b-0 lg:border-r`}>
                  <div className="flex items-center justify-between border-b border-border px-4 py-3">
                    <p className="text-sm font-bold text-foreground">Tickets List</p>
                    <span className="text-xs font-semibold text-muted-foreground">{filteredReports.length} shown</span>
                  </div>
                  <div className="max-h-[620px] overflow-y-auto p-2">
                    {feedbackLoading ? (
                      <div className="p-4 text-sm font-medium text-muted-foreground">Loading feedback...</div>
                    ) : filteredReports.length === 0 ? (
                      <div className="p-4 text-sm font-medium text-muted-foreground">No feedback reports found.</div>
                    ) : (
                      filteredReports.map((report) => (
                        <button
                          key={report.id}
                          type="button"
                          onClick={() => {
                            setSelectedReportId(report.id);
                            setMobileTicketView("detail");
                          }}
                          className={`w-full rounded-2xl border p-3 text-left transition ${
                            selectedReport?.id === report.id
                              ? "border-primary/40 bg-primary/10 shadow-soft"
                              : "border-transparent hover:border-border hover:bg-background"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold text-foreground">{report.title}</p>
                              <p className="mt-1 truncate text-xs text-muted-foreground">
                                {reportUserName(report)} &middot; {new Date(report.created_at).toLocaleDateString("en-IN")}
                              </p>
                            </div>
                            {report.priority === "critical" ? (
                              <AlertTriangle className="size-4 shrink-0 text-destructive" />
                            ) : (
                              <Eye className="size-4 shrink-0 text-primary" />
                            )}
                          </div>
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                              {feedbackTypeLabel(report.type)}
                            </span>
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${badgeTone(report.priority)}`}>
                              {feedbackPriorityLabel(report.priority)}
                            </span>
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${badgeTone(report.status)}`}>
                              {feedbackStatusLabel(report.status)}
                            </span>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>

                {/* Ticket Details Console */}
                <div className={`${mobileTicketView === "list" && !selectedReport ? "hidden lg:block" : "block"} min-w-0 bg-card p-4 sm:p-5`}>
                  {selectedReport ? (
                    <div className="space-y-5">
                      {/* Mobile Back Button */}
                      <button
                        type="button"
                        onClick={() => setMobileTicketView("list")}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-elevated px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground lg:hidden"
                      >
                        <ArrowLeft className="size-3.5" />
                        Back to tickets list
                      </button>

                      <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{feedbackTypeLabel(selectedReport.type)}</p>
                          <h2 className="mt-1 text-lg font-bold leading-tight text-foreground sm:text-xl">{selectedReport.title}</h2>
                          <p className="mt-1 text-xs text-muted-foreground">{reportUserName(selectedReport)} &middot; {formatAdminDate(selectedReport.created_at)}</p>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2">
                          <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${badgeTone(selectedReport.priority)}`}>
                            {feedbackPriorityLabel(selectedReport.priority)}
                          </span>
                          <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${badgeTone(selectedReport.status)}`}>
                            {feedbackStatusLabel(selectedReport.status)}
                          </span>
                        </div>
                      </div>

                      <section className="rounded-2xl border border-border bg-elevated p-4">
                        <div className="mb-2 flex items-center gap-2 text-sm font-bold text-foreground">
                          <FileText className="size-4 text-primary" /> Description
                        </div>
                        <p className="whitespace-pre-line text-sm leading-6 text-foreground">{selectedReport.description}</p>
                        {screenshotPreviewUrl ? (
                          <div className="relative mt-4">
                            <img src={screenshotPreviewUrl} alt="Feedback screenshot" className="max-h-72 w-full rounded-2xl border border-border bg-background object-contain" />
                            <Button type="button" variant="destructive" size="icon" disabled={deletingScreenshot} onClick={() => deleteFeedbackScreenshot(selectedReport)} className="absolute right-2 top-2 size-8 rounded-full shadow-soft" aria-label="Delete feedback screenshot" title="Delete screenshot">
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        ) : null}
                      </section>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Status</Label>
                          <AdminSelect value={ticketDraft.status} onChange={(status) => setTicketDraft((current) => ({ ...current, status: status as FeedbackReport["status"] }))} disabled={savingReport} options={feedbackStatuses.filter((status) => status !== "all").map((status) => ({ value: status, label: feedbackStatusLabel(status as FeedbackReport["status"]) }))} />
                        </div>
                        <div className="space-y-2">
                          <Label>Priority</Label>
                          <AdminSelect value={ticketDraft.priority} onChange={(priority) => setTicketDraft((current) => ({ ...current, priority: priority as FeedbackReport["priority"] }))} disabled={savingReport} options={feedbackPriorities.filter((priority) => priority !== "all").map((priority) => ({ value: priority, label: feedbackPriorityLabel(priority as FeedbackReport["priority"]) }))} />
                        </div>
                      </div>

                      <section className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Internal Notes</Label>
                          <Textarea value={ticketDraft.internalNotes} onChange={(event) => setTicketDraft((current) => ({ ...current, internalNotes: event.target.value }))} className="min-h-32 text-sm focus-visible:ring-inset" placeholder="Private notes. Never emailed to the user." />
                        </div>
                        <div className="space-y-2">
                          <Label>User Update Message</Label>
                          <Textarea value={ticketDraft.userMessage} onChange={(event) => setTicketDraft((current) => ({ ...current, userMessage: event.target.value }))} className="min-h-32 text-sm focus-visible:ring-inset" placeholder="Optional message included in the user email." />
                        </div>
                      </section>

                      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-elevated p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-xs text-muted-foreground">
                          <p className="font-semibold text-foreground">Save Ticket Changes</p>
                          <p>Update Ticket saves all fields and sends user status email.</p>
                        </div>
                        <Button type="button" onClick={updateSelectedTicket} disabled={savingReport} className="sm:w-auto">
                          {savingReport ? "Updating..." : "Update Ticket"}
                        </Button>
                      </div>

                      <section className="rounded-2xl border border-border bg-elevated p-4">
                        <div className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground">
                          <History className="size-4 text-primary" /> Timeline &amp; Events
                        </div>
                        <div className="space-y-3">
                          {(selectedEvents.length ? selectedEvents : [{ id: "fallback", event_type: "created", report_id: selectedReport.id, status: selectedReport.status, priority: selectedReport.priority, message: "Ticket created", created_at: selectedReport.created_at } as FeedbackEvent]).map((event) => (
                            <div key={event.id} className="flex gap-3">
                              <span className="mt-1 grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                                <Clock className="size-3.5" />
                              </span>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-foreground">{eventLabel(event)}</p>
                                {event.message && event.event_type === "admin_replied" ? (
                                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{event.message}</p>
                                ) : null}
                                <p className="mt-0.5 text-xs text-muted-foreground">{formatAdminDate(event.created_at)}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>

                      <div className="rounded-2xl border border-border bg-elevated p-3 text-xs text-muted-foreground">
                        <p className="font-medium text-foreground">Client Environment</p>
                        <p className="mt-0.5">App v{selectedReport.app_version} &middot; {selectedReport.device_info?.device_type || "Device"} / {selectedReport.device_info?.os || "OS"} / {selectedReport.device_info?.browser || "Browser"}</p>
                        {selectedReport.device_info?.viewport && (
                          <p className="break-all mt-0.5">{selectedReport.device_info?.viewport}</p>
                        )}
                      </div>

                      <Button type="button" variant="destructive" disabled={savingReport} onClick={() => deleteFeedbackReport(selectedReport)} className="w-full">
                        <Trash2 className="mr-2 size-4" /> Delete Ticket
                      </Button>
                    </div>
                  ) : (
                    <div className="p-8 text-center text-sm font-medium text-muted-foreground">
                      Select a ticket from the list to view its full details.
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Station 3: Broadcast & Communications Console */}
        {adminTab === "broadcast" && (
          <Card className="rounded-[1.25rem] border border-border/80 bg-card shadow-panel">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-foreground text-lg sm:text-xl">
                <Send className="size-5 text-primary" /> Broadcast &amp; Communications Console
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Dispatch platform announcements or send targeted direct notifications to registered Spendova users.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-3">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recipient Mode</Label>
                <div className="grid grid-cols-2 gap-1 rounded-2xl bg-elevated p-1 max-w-md">
                  <button
                    type="button"
                    onClick={() => setRecipientMode("single")}
                    className={`rounded-xl px-3 py-2 text-xs sm:text-sm font-semibold transition-colors ${
                      recipientMode === "single"
                        ? "bg-primary text-primary-foreground shadow-primary-action"
                        : "text-muted-foreground hover:bg-background"
                    }`}
                  >
                    Specific User
                  </button>
                  <button
                    type="button"
                    onClick={() => setRecipientMode("all")}
                    className={`rounded-xl px-3 py-2 text-xs sm:text-sm font-semibold transition-colors ${
                      recipientMode === "all"
                        ? "bg-primary text-primary-foreground shadow-primary-action"
                        : "text-muted-foreground hover:bg-background"
                    }`}
                  >
                    All Registered Users
                  </button>
                </div>
              </div>

              {recipientMode === "single" ? (
                <div className="space-y-2 max-w-md">
                  <Label htmlFor="targetEmail">Recipient Email</Label>
                  <Input
                    id="targetEmail"
                    type="email"
                    placeholder="user@example.com"
                    value={targetEmail}
                    onChange={(event) => setTargetEmail(event.target.value)}
                    className="focus-visible:ring-inset h-11 rounded-2xl"
                  />
                </div>
              ) : (
                <div className="flex items-center gap-2.5 rounded-2xl border border-border bg-elevated p-3.5 text-xs text-muted-foreground max-w-md">
                  <Users className="size-4 text-primary shrink-0" />
                  <span>Broadcast dispatch will deliver to all confirmed accounts across Spendova.</span>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="testEmail">Test Recipient Email</Label>
                  <Input
                    id="testEmail"
                    type="email"
                    placeholder="admin@example.com"
                    value={testEmail}
                    onChange={(event) => setTestEmail(event.target.value)}
                    className="focus-visible:ring-inset h-11 rounded-2xl"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="subject">Subject Line</Label>
                  <Input
                    id="subject"
                    placeholder="Spendova platform update or announcement"
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                    maxLength={100}
                    className="focus-visible:ring-inset h-11 rounded-2xl"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="message">Message Body</Label>
                <Textarea
                  id="message"
                  placeholder={"Hello,\n\nWe have released exciting new updates to Spendova.\n\nThank you for being part of our community."}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  className="min-h-40 text-sm focus-visible:ring-inset rounded-2xl p-4 leading-relaxed"
                />
                <p className="text-xs text-muted-foreground">The official Spendova branded responsive email template will wrap your content automatically.</p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <Label>Attachments</Label>
                  <span className="text-xs text-muted-foreground">Max 100MB cumulative limit</span>
                </div>
                <Input type="file" id="file-upload" multiple className="hidden" onChange={handleFileChange} />
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-center h-11 rounded-2xl border-dashed"
                  onClick={() => document.getElementById("file-upload")?.click()}
                >
                  <Paperclip className="mr-2 size-4" /> Select Files to Attach
                </Button>
                {readingFiles > 0 && (
                  <div className="rounded-xl border border-border bg-elevated px-3 py-2 text-xs text-muted-foreground">
                    Reading {readingFiles} file{readingFiles > 1 ? "s" : ""}...
                  </div>
                )}
                {attachments.length > 0 && (
                  <div className="space-y-2">
                    {attachments.map((file, index) => (
                      <div key={`${file.name}-${index}`} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-elevated p-2.5 text-xs">
                        <span className="min-w-0 truncate font-medium text-foreground">{file.name}</span>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-7 text-destructive hover:bg-destructive/10"
                            onClick={() => removeAttachment(index)}
                          >
                            <X className="size-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {showPreview && (
                <div className="rounded-2xl border border-border bg-elevated p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Email Preview</p>
                  <p className="mt-1 text-sm font-bold text-foreground">{subject || "(No subject entered)"}</p>
                  <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">{message || "(No message body entered)"}</p>
                </div>
              )}

              <div className="flex flex-col gap-2.5 sm:flex-row sm:justify-end pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowPreview((current) => !current)}
                  className="h-10 rounded-xl px-4 text-xs font-semibold"
                >
                  {showPreview ? "Hide Preview" : "Preview Layout"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={Boolean(sendingMode) || readingFiles > 0}
                  onClick={() => sendAdminMail("test")}
                  className="h-10 rounded-xl px-4 text-xs font-semibold"
                >
                  {sendingMode === "test" ? "Sending..." : "Send Test to Self"}
                </Button>
                <Button
                  type="button"
                  disabled={Boolean(sendingMode) || readingFiles > 0}
                  onClick={() => sendAdminMail("broadcast")}
                  className="h-10 rounded-xl bg-primary px-5 text-xs font-bold text-primary-foreground shadow-primary-action hover:opacity-90"
                >
                  {sendingMode === "broadcast" ? "Dispatching..." : recipientMode === "all" ? "Dispatch to All Users" : "Send Email"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Station 4: System Operations & Infrastructure Telemetry */}
        {adminTab === "controls" && (
          <div className="space-y-5">
            {/* Direct Push App Notification Broadcast (No in-app banner) */}
            <Card className="rounded-[1.25rem] border border-border/80 bg-card shadow-panel">
              <CardHeader className="pb-3 pt-5 px-5 sm:px-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className={`grid size-9 place-items-center rounded-xl ${
                      broadcastPriority === "emergency"
                        ? "bg-red-500/15 text-red-500"
                        : broadcastPriority === "warning"
                        ? "bg-amber-500/15 text-amber-500"
                        : "bg-primary/15 text-primary"
                    }`}>
                      <Megaphone className="size-5" />
                    </div>
                    <div>
                      <CardTitle className="text-base sm:text-lg font-bold text-foreground">
                        Direct Push App Notification Broadcast
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Dispatch priority push notifications directly to user mobile lockscreens (Android, iOS & Web). Zero in-app banner clutter.
                      </CardDescription>
                    </div>
                  </div>
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold tracking-wide uppercase ${
                    broadcastPriority === "emergency"
                      ? "bg-red-500/15 text-red-500 border border-red-500/30"
                      : broadcastPriority === "warning"
                      ? "bg-amber-500/15 text-amber-500 border border-amber-500/30"
                      : "bg-primary/15 text-primary border border-primary/30"
                  }`}>
                    <span className="size-1.5 rounded-full bg-current animate-ping" />
                    {broadcastPriority === "emergency" ? "🚨 Priority: Emergency" : broadcastPriority === "warning" ? "⚠️ Priority: Warning" : "📢 Priority: Info"}
                  </span>
                </div>
              </CardHeader>

              <CardContent className="space-y-4 px-5 pb-5 sm:px-6 sm:pb-6 pt-1">
                <div className="space-y-3">
                  {/* Push Priority Level Selector */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Notification Priority Level</Label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {[
                        {
                          level: "emergency" as const,
                          label: "Emergency Priority Alert",
                          desc: "High Priority • Chime & Vibration Heads-up",
                          defaultTitle: "🚨 Emergency Priority Alert",
                          color: "border-red-500/50 hover:bg-red-500/10 text-red-500",
                        },
                        {
                          level: "warning" as const,
                          label: "System Notice",
                          desc: "Service Advisory • Maintenance & Caution",
                          defaultTitle: "⚠️ Spendova System Notice",
                          color: "border-amber-500/50 hover:bg-amber-500/10 text-amber-500",
                        },
                        {
                          level: "info" as const,
                          label: "Platform Update",
                          desc: "Informational • New features & general tips",
                          defaultTitle: "📢 Spendova Platform Update",
                          color: "border-primary/50 hover:bg-primary/10 text-primary",
                        },
                      ].map((item) => {
                        const active = broadcastPriority === item.level;
                        return (
                          <button
                            key={item.level}
                            type="button"
                            onClick={() => {
                              setBroadcastPriority(item.level);
                              // Sync title if unchanged or standard default
                              if (
                                !broadcastTitle ||
                                broadcastTitle.includes("Alert") ||
                                broadcastTitle.includes("Notice") ||
                                broadcastTitle.includes("Update")
                              ) {
                                setBroadcastTitle(item.defaultTitle);
                              }
                            }}
                            className={`rounded-xl border p-2.5 text-left transition-all ${
                              active
                                ? "border-primary bg-primary/10 ring-1 ring-primary"
                                : "border-border/80 bg-elevated/40 hover:bg-elevated"
                            }`}
                          >
                            <p className="text-xs font-bold text-foreground">{item.label}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">{item.desc}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Broadcast Title Input */}
                  <div className="space-y-1.5">
                    <Label htmlFor="broadcast-title" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Notification Title</Label>
                    <Input
                      id="broadcast-title"
                      value={broadcastTitle}
                      onChange={(e) => setBroadcastTitle(e.target.value)}
                      placeholder="e.g. 🚨 Emergency Priority Alert"
                      className="rounded-xl border-input text-xs sm:text-sm font-semibold"
                    />
                  </div>

                  {/* Broadcast Message Input */}
                  <div className="space-y-1.5">
                    <Label htmlFor="broadcast-msg" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Notification Body Message</Label>
                    <Textarea
                      id="broadcast-msg"
                      value={broadcastMessage}
                      onChange={(e) => setBroadcastMessage(e.target.value)}
                      placeholder="e.g. Scheduled emergency database maintenance will commence in 15 minutes. Please save your expense edits."
                      rows={2}
                      className="rounded-xl border-input text-xs sm:text-sm resize-none"
                    />
                  </div>

                  {/* Native Smartphone Push Notification Lockscreen Preview */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
                      Lockscreen Push Preview (What appears on user phones):
                    </span>
                    <div className="rounded-2xl border border-border/80 bg-gradient-to-b from-card to-elevated p-3.5 shadow-md">
                      <div className="flex items-start gap-3">
                        <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground font-black text-xs shadow-sm">
                          S
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] font-bold tracking-wider text-foreground uppercase">SPENDOVA</span>
                              <span className={`rounded px-1.5 py-0.2 text-[9px] font-extrabold uppercase tracking-wide ${
                                broadcastPriority === "emergency"
                                  ? "bg-red-500/20 text-red-500"
                                  : broadcastPriority === "warning"
                                  ? "bg-amber-500/20 text-amber-500"
                                  : "bg-primary/20 text-primary"
                              }`}>
                                {broadcastPriority === "emergency" ? "Emergency" : broadcastPriority === "warning" ? "Notice" : "Update"}
                              </span>
                            </div>
                            <span className="text-[10px] text-muted-foreground">now</span>
                          </div>
                          <p className="mt-0.5 text-xs font-bold text-foreground">
                            {broadcastTitle || "Push Notification Title"}
                          </p>
                          <p className="text-xs text-muted-foreground leading-snug break-words">
                            {broadcastMessage || "Direct mobile push notification message will appear on user lockscreens..."}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Action Controls */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                    <div className="text-xs text-muted-foreground">
                      {lastBroadcastResult ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                          ✓ Last dispatched at {lastBroadcastResult.time} to {lastBroadcastResult.count} device(s) ({lastBroadcastResult.level.toUpperCase()}).
                        </span>
                      ) : (
                        <span>Native FCM push broadcasts instantly to all registered user phones. Zero in-app banner.</span>
                      )}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleBroadcastPushNotification}
                      disabled={broadcastingPush || !broadcastMessage.trim()}
                      className="h-9 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-primary-action"
                    >
                      <Megaphone className="mr-1.5 size-3.5" />
                      {broadcastingPush ? "Broadcasting Push..." : "Broadcast Push to All Devices"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Direct Push Notification Test Bench (Target by Username) */}
            <Card className="rounded-[1.25rem] border border-border/80 bg-card shadow-panel">
              <CardHeader className="pb-3 pt-5 px-5 sm:px-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="grid size-9 place-items-center rounded-xl bg-primary/15 text-primary">
                      <Bell className="size-5" />
                    </div>
                    <div>
                      <CardTitle className="text-base sm:text-lg font-bold text-foreground">
                        Direct Push Notification Test Bench
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Target a specific user by @username to test FCM push delivery and inspect active device tokens
                      </CardDescription>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-elevated px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                    <span className="size-1.5 rounded-full bg-emerald-500" />
                    FCM Test Harness Ready
                  </span>
                </div>
              </CardHeader>

              <CardContent className="space-y-4 px-5 pb-5 sm:px-6 sm:pb-6 pt-1">
                <div className="grid gap-3 sm:grid-cols-2">
                  {/* Username Target Input */}
                  <div className="space-y-1.5">
                    <Label htmlFor="test-username" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Target Username
                    </Label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">@</span>
                      <Input
                        id="test-username"
                        value={testPushUsername}
                        onChange={(e) => setTestPushUsername(e.target.value)}
                        placeholder="e.g. shabbir or admin"
                        className="h-10 rounded-xl pl-7 text-xs sm:text-sm font-medium"
                      />
                    </div>
                    {/* Quick user selection pills */}
                    {usersList.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <span className="text-[10px] text-muted-foreground">Quick Select:</span>
                        {usersList.slice(0, 5).map((u) => (
                          <button
                            key={u.user_id}
                            type="button"
                            onClick={() => setTestPushUsername(u.username || u.full_name || "")}
                            className="rounded-lg bg-elevated px-2 py-0.5 text-[10px] font-semibold text-muted-foreground hover:bg-primary/10 hover:text-primary transition"
                          >
                            @{u.username || u.full_name?.toLowerCase().replace(/\s+/g, "") || "user"}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Title Input */}
                  <div className="space-y-1.5">
                    <Label htmlFor="test-title" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Push Notification Title
                    </Label>
                    <Input
                      id="test-title"
                      value={testPushTitle}
                      onChange={(e) => setTestPushTitle(e.target.value)}
                      placeholder="e.g. Emergency Priority Alert"
                      className="h-10 rounded-xl text-xs sm:text-sm font-medium"
                    />
                  </div>
                </div>

                {/* Message Body Input */}
                <div className="space-y-1.5">
                  <Label htmlFor="test-msg" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Notification Message Body
                  </Label>
                  <Textarea
                    id="test-msg"
                    value={testPushMessage}
                    onChange={(e) => setTestPushMessage(e.target.value)}
                    placeholder="Enter message text that will display on the user's phone or lock screen..."
                    rows={2}
                    className="rounded-xl border-input text-xs sm:text-sm resize-none"
                  />
                </div>

                {/* Diagnostic Feedback Result Box */}
                {testPushResult && (
                  <div className={`rounded-xl border p-3.5 text-xs transition-all ${
                    testPushResult.success
                      ? testPushResult.tokensFound > 0
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100"
                        : "border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-100"
                      : "border-destructive/40 bg-destructive/10 text-destructive"
                  }`}>
                    <div className="flex items-start gap-2.5">
                      <div className="grid size-6 shrink-0 place-items-center rounded-md bg-current/15 mt-0.5">
                        {testPushResult.success ? (
                          testPushResult.tokensFound > 0 ? (
                            <CheckCircle2 className="size-3.5" />
                          ) : (
                            <AlertTriangle className="size-3.5" />
                          )
                        ) : (
                          <AlertOctagon className="size-3.5" />
                        )}
                      </div>
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-bold text-foreground">
                            {testPushResult.success
                              ? testPushResult.tokensFound > 0
                                ? "Push Notification Dispatched Successfully"
                                : "User Verified • No Registered Device Tokens"
                              : "Delivery Inspection Failed"}
                          </p>
                          {testPushResult.user && (
                            <span className="rounded-md bg-elevated px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground border border-border">
                              User ID: {testPushResult.user.id.slice(0, 8)}...
                            </span>
                          )}
                        </div>
                        <p className="text-muted-foreground leading-relaxed">
                          {testPushResult.message}
                        </p>
                        {testPushResult.platforms && testPushResult.platforms.length > 0 && (
                          <div className="flex items-center gap-1.5 pt-1">
                            <span className="text-[10px] font-semibold text-muted-foreground">Registered Devices:</span>
                            {testPushResult.platforms.map((p, idx) => (
                              <span key={idx} className="rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-bold uppercase text-primary border border-primary/20">
                                {p}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Dispatch Button */}
                <div className="flex items-center justify-between gap-3 pt-1">
                  <p className="text-[11px] text-muted-foreground">
                    Only @{testPushUsername.replace(/^@/, '') || "target"} will receive this push notification. No other users are notified.
                  </p>
                  <Button
                    type="button"
                    onClick={() => handleSendTestPush()}
                    disabled={testPushLoading || !testPushUsername.trim()}
                    className="h-9 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-primary-action shrink-0"
                  >
                    <Send className="mr-1.5 size-3.5" />
                    {testPushLoading ? "Testing Delivery..." : "Dispatch Test Push to @user"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Mission Critical Switches Grid */}
            <div className="grid gap-5 lg:grid-cols-12">
              {/* Traffic Gate / Maintenance Killswitch (7 cols) */}
              <div className="lg:col-span-7">
                <Card className={`rounded-[1.25rem] border shadow-panel transition-all ${
                  isMaintenance
                    ? "border-destructive/50 bg-destructive/5 ring-1 ring-destructive/20"
                    : "border-border/80 bg-card"
                }`}>
                  <CardHeader className="pb-3 pt-5 px-5 sm:px-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <div className={`grid size-9 place-items-center rounded-xl ${
                          isMaintenance
                            ? "bg-destructive/15 text-destructive"
                            : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                        }`}>
                          <ShieldCheck className="size-5" />
                        </div>
                        <div>
                          <CardTitle className="text-base sm:text-lg font-bold text-foreground">
                            Public Traffic Gate
                          </CardTitle>
                          <CardDescription className="text-xs">
                            Global platform availability and emergency maintenance bypass
                          </CardDescription>
                        </div>
                      </div>
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold tracking-wide uppercase ${
                        isMaintenance
                          ? "bg-destructive/15 text-destructive border border-destructive/30"
                          : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                      }`}>
                        <span className={`size-1.5 rounded-full ${
                          isMaintenance ? "bg-destructive animate-ping" : "bg-emerald-500"
                        }`} />
                        {isMaintenance ? "Maintenance Active" : "Public Live"}
                      </span>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4 px-5 pb-5 sm:px-6 sm:pb-6 pt-1">
                    <div className={`rounded-2xl border p-4 transition-all ${
                      isMaintenance
                        ? "border-destructive/30 bg-destructive/10"
                        : "border-border bg-elevated/70"
                    }`}>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="space-y-1">
                          <p className="text-sm font-bold text-foreground">
                            Maintenance Mode Redirection
                          </p>
                          <p className="text-xs leading-relaxed text-muted-foreground max-w-xl">
                            {isMaintenance
                              ? "CRITICAL: Regular user traffic is intercepted and redirected to /maintenance. Admin accounts retain authenticated bypass."
                              : "Standard operation: All users, web sessions, and mobile clients have unrestricted access to Spendova."}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0 self-start sm:self-center">
                          <span className="text-xs font-semibold text-muted-foreground">
                            {isMaintenance ? "Active" : "Standby"}
                          </span>
                          <Switch
                            checked={isMaintenance}
                            onCheckedChange={toggleMaintenanceMode}
                            disabled={fetchingMaintenance}
                            className="data-[state=checked]:bg-destructive"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-1 text-xs">
                      <div className="rounded-xl border border-border/60 bg-elevated/50 p-3">
                        <span className="text-muted-foreground block text-[11px] font-medium">Bypass Privileges</span>
                        <span className="font-semibold text-foreground mt-0.5 block">Verified Admin Accounts</span>
                      </div>
                      <div className="rounded-xl border border-border/60 bg-elevated/50 p-3">
                        <span className="text-muted-foreground block text-[11px] font-medium">Redirection Route</span>
                        <span className="font-mono font-semibold text-foreground mt-0.5 block">/maintenance</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Operations Control Bay (5 cols) */}
              <div className="lg:col-span-5">
                <Card className="rounded-[1.25rem] border border-border/80 bg-card shadow-panel h-full flex flex-col justify-between">
                  <CardHeader className="pb-3 pt-5 px-5 sm:px-6">
                    <div className="flex items-center gap-2.5">
                      <div className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
                        <Activity className="size-5" />
                      </div>
                      <div>
                        <CardTitle className="text-base sm:text-lg font-bold text-foreground">
                          Operations Telemetry
                        </CardTitle>
                        <CardDescription className="text-xs">
                          Live system state and synchronization controls
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-3 px-5 pb-5 sm:px-6 sm:pb-6 pt-1">
                    <div className="rounded-2xl border border-border bg-elevated/70 p-3.5 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground font-medium">Active Admin Session:</span>
                        <span className="font-semibold text-foreground font-mono text-[11px] truncate max-w-[180px]">
                          {user?.email || "Superadmin"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground font-medium">Device Session Guard:</span>
                        <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="size-3" /> Enforced
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground font-medium">Environment:</span>
                        <span className="font-mono text-xs font-bold text-primary">Production (Cloud)</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          void fetchMaintenanceState();
                          void fetchFeedbackReports();
                          void fetchAppRatings();
                        }}
                        className="h-10 w-full rounded-xl border-border bg-elevated/60 text-xs font-semibold hover:bg-elevated"
                      >
                        <RefreshCw className="mr-1.5 size-3.5" />
                        Synchronize All Telemetry
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Infrastructure Health & Diagnostics Matrix */}
            <Card className="rounded-[1.25rem] border border-border/80 bg-card shadow-panel">
              <CardHeader className="pb-3 pt-5 px-5 sm:px-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
                      <Server className="size-5" />
                    </div>
                    <div>
                      <CardTitle className="text-base sm:text-lg font-bold text-foreground">
                        Infrastructure Health &amp; Diagnostics Matrix
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Continuous status monitoring of database, authentication, and core application subsystems
                      </CardDescription>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    <span className="size-1.5 rounded-full bg-emerald-500" />
                    All Subsystems Operational
                  </span>
                </div>
              </CardHeader>
              <CardContent className="px-5 pb-5 sm:px-6 sm:pb-6">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-2xl border border-border bg-elevated p-4 shadow-soft">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider">Database Engine</p>
                      <span className="size-2 rounded-full bg-emerald-500" />
                    </div>
                    <p className="mt-1.5 text-sm font-bold text-foreground">Supabase PostgreSQL</p>
                    <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">Connected &middot; Healthy</p>
                  </div>

                  <div className="rounded-2xl border border-border bg-elevated p-4 shadow-soft">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider">Authentication</p>
                      <span className="size-2 rounded-full bg-emerald-500" />
                    </div>
                    <p className="mt-1.5 text-sm font-bold text-foreground">Session Guard</p>
                    <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">Device Session Enforced</p>
                  </div>

                  <div className="rounded-2xl border border-border bg-elevated p-4 shadow-soft">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider">Feedback Campaign</p>
                      <span className={`size-2 rounded-full ${currentRound === 0 ? "bg-amber-500" : "bg-primary"}`} />
                    </div>
                    <p className="mt-1.5 text-sm font-bold text-foreground">
                      {currentRound === 0 ? "Inactive (Round 0)" : `Round ${currentRound}`}
                    </p>
                    <p className="mt-1 text-xs text-primary font-medium">Accounts &ge; 4 Days Eligible</p>
                  </div>

                  <div className="rounded-2xl border border-border bg-elevated p-4 shadow-soft">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider">Security Tier</p>
                      <span className="size-2 rounded-full bg-emerald-500" />
                    </div>
                    <p className="mt-1.5 text-sm font-bold text-foreground">Role Restricted</p>
                    <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">Admin Guard Active</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Modern Feedback Rollout Confirmation Modal */}
      <Dialog open={showRolloutModal} onOpenChange={setShowRolloutModal}>
        <DialogContent
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="w-[calc(100vw_-_1.5rem)] max-w-md overflow-hidden rounded-[1.5rem] border-border bg-card p-0 shadow-panel sm:w-full"
        >
          <div className="relative p-6 sm:p-7">
            {/* Spendova Brand Logo Header */}
            <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl border border-primary/20 bg-primary/10 p-2.5 shadow-soft">
              <img
                src="/brand/spendova-symbol.png"
                alt="Spendova"
                className="size-8 object-contain drop-shadow-sm"
              />
            </div>

            {/* Title & Tag */}
            <div className="text-center">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                {currentRound === 0 ? "Initial Rollout" : `Round ${currentRound + 1}`}
              </div>
              <h3 className="mt-3 text-lg font-bold text-foreground sm:text-xl">
                {currentRound === 0
                  ? "Roll Out Feedback Campaign?"
                  : `Launch Campaign Round ${currentRound + 1}?`}
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                {currentRound === 0
                  ? "This will activate Round 1 across Spendova. Eligible users will be prompted for in-app feedback on their next visit."
                  : `This will start Round ${currentRound + 1}. All existing ratings from earlier rounds remain safely preserved.`}
              </p>
            </div>

            {/* Highlight Criteria Box */}
            <div className="mt-5 space-y-2 rounded-2xl border border-border/80 bg-elevated/70 p-3.5 text-xs text-foreground">
              <div className="flex items-center gap-2.5">
                <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
                  <Clock className="size-3.5" />
                </span>
                <span className="text-muted-foreground">
                  <strong className="text-foreground">Eligibility:</strong> Users with accounts &ge; 4 days old
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-success/15 text-success">
                  <CheckCircle2 className="size-3.5" />
                </span>
                <span className="text-muted-foreground">
                  <strong className="text-foreground">Frequency:</strong> Prompts once per launch until submitted
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
                  <Users className="size-3.5" />
                </span>
                <span className="text-muted-foreground">
                  <strong className="text-foreground">New users:</strong> Prompted automatically once they reach day 4
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowRolloutModal(false)}
                disabled={rollingOutRound}
                className="h-10 rounded-xl px-4 text-xs font-semibold sm:w-auto"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={executeRollout}
                disabled={rollingOutRound}
                className="h-10 rounded-xl bg-primary px-5 text-xs font-bold text-primary-foreground shadow-primary-action transition-all hover:opacity-90 sm:w-auto"
              >
                {rollingOutRound ? (
                  <>
                    <RefreshCw className="mr-2 size-3.5 animate-spin" />
                    Rolling Out...
                  </>
                ) : (
                  <>
                    <Radio className="mr-1.5 size-3.5" />
                    {currentRound === 0 ? "Confirm & Roll Out" : `Launch Round ${currentRound + 1}`}
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* User Account Suspension Confirmation Modal */}
      <Dialog open={Boolean(userToBlock)} onOpenChange={(open) => !open && setUserToBlock(null)}>
        <DialogContent
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="w-[calc(100vw_-_1.5rem)] max-w-md overflow-hidden rounded-[1.5rem] border-border bg-card p-0 shadow-panel sm:w-full"
        >
          <div className="relative p-6 sm:p-7">
            <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl border border-destructive/25 bg-destructive/10 text-destructive shadow-soft">
              <ShieldAlert className="size-7" />
            </div>

            <div className="text-center">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-destructive/25 bg-destructive/10 px-3 py-1 text-xs font-semibold text-destructive">
                Access Restriction
              </span>
              <h3 className="mt-3 text-lg font-bold text-foreground sm:text-xl">
                Suspend User Access?
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                Suspending this user will immediately revoke all active sessions on their web and mobile devices. They will be logged out and unable to log in until reactivated.
              </p>
            </div>

            {userToBlock && (
              <div className="mt-4 rounded-xl border border-border/80 bg-elevated/70 p-3 text-xs space-y-1">
                <p className="font-bold text-foreground">{userToBlock.full_name || userToBlock.username || "Spendova User"}</p>
                <p className="text-muted-foreground text-[11px] font-mono truncate">ID: {userToBlock.user_id}</p>
              </div>
            )}

            <div className="mt-4 space-y-1.5">
              <Label htmlFor="block-reason" className="text-xs font-bold text-foreground">
                Suspension Reason (Optional audit note):
              </Label>
              <Input
                id="block-reason"
                value={blockReasonInput}
                onChange={(e) => setBlockReasonInput(e.target.value)}
                placeholder="e.g. Terms violation, compromised account, admin review"
                className="h-10 rounded-xl text-xs"
              />
            </div>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setUserToBlock(null)}
                disabled={savingBlockAction}
                className="h-10 rounded-xl px-4 text-xs font-semibold sm:w-auto"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => userToBlock && handleToggleBlock(userToBlock, true)}
                disabled={savingBlockAction}
                className="h-10 rounded-xl bg-destructive px-5 text-xs font-bold text-destructive-foreground shadow-soft hover:bg-destructive/90 sm:w-auto"
              >
                {savingBlockAction ? "Enforcing Suspension..." : "Confirm & Suspend"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const Admin = ({ view }: { view: "login" | "dashboard" | "root" }) => {
  if (view === "dashboard") return <AdminGuard><AdminDashboard /></AdminGuard>;
  if (view === "login") return <AdminLogin />;
  return <AdminGuard><AdminDashboard /></AdminGuard>;
};

export default Admin;
