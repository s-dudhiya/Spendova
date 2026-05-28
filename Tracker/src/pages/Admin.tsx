import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Clock, Eye, FileText, History, Inbox, Lock, LogOut, Mail, MessageSquare, Paperclip, Search, Send, Settings, Trash2, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { getFriendlyErrorMessage } from "@/lib/friendly-error";

type AdminCheck = "loading" | "allowed" | "denied";
const AUTH_BRAND_IMAGE = "/brand/login-branding-image.png";

type FeedbackReport = {
  id: string;
  user_id: string;
  type: "bug_report" | "feature_request" | "suggestion" | "general_feedback";
  title: string;
  description: string;
  screenshot_url: string | null;
  priority: "low" | "medium" | "high" | "critical";
  status: "open" | "investigating" | "resolved" | "closed";
  device_info: Record<string, any>;
  app_version: string;
  admin_notes: string | null;
  internal_notes: string | null;
  user_update_message: string | null;
  created_at: string;
  updated_at: string;
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
    } catch (error: any) {
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
  const [feedbackFilters, setFeedbackFilters] = useState({ type: "all", status: "all", priority: "all", date: "", search: "" });
  const [savingReport, setSavingReport] = useState(false);
  const [ticketDraft, setTicketDraft] = useState({ status: "open" as FeedbackReport["status"], priority: "medium" as FeedbackReport["priority"], internalNotes: "", userMessage: "" });
  const { toast } = useToast();
  const { signOut } = useAuth();
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

  useEffect(() => {
    fetchMaintenanceState();
    fetchFeedbackReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("admin-feedback-reports")
      .on("postgres_changes", { event: "*", schema: "public", table: "feedback_reports" }, () => void fetchFeedbackReports({ silent: true }))
      .on("postgres_changes", { event: "*", schema: "public", table: "feedback_report_events" }, () => void fetchFeedbackEvents({ silent: true }))
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
  }, [selectedReport?.id, selectedReport?.status, selectedReport?.priority, selectedReport?.internal_notes, selectedReport?.admin_notes, selectedReport?.user_update_message]);

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
      const { data, error } = await supabase.from("site_settings").select("is_maintenance_mode").eq("id", 1).single();
      if (error && error.code !== "PGRST116") throw error;
      if (data) setIsMaintenance(data.is_maintenance_mode);
    } catch (error) {
      console.error("Failed to fetch maintenance state", error);
      toast({ title: "Warning", description: "Could not fetch current maintenance state.", variant: "destructive" });
    } finally {
      setFetchingMaintenance(false);
    }
  };

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

  const toggleMaintenanceMode = async (checked: boolean) => {
    try {
      setIsMaintenance(checked);
      const { error } = await supabase.from("site_settings").update({ is_maintenance_mode: checked, updated_at: new Date().toISOString() }).eq("id", 1);
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
    <div className="min-h-screen bg-background px-4 py-5 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="flex flex-col gap-4 rounded-[1.25rem] border border-primary/15 bg-card px-5 py-4 shadow-panel sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Mail className="size-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground sm:text-2xl">Spendova Admin Portal</h1>
              <p className="text-sm text-muted-foreground">Support operations, global controls, and user communications.</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout} className="self-start text-destructive hover:bg-destructive/10 hover:text-destructive sm:self-auto">
            <LogOut className="mr-2 size-4" /> Log Out
          </Button>
        </header>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(360px,0.85fr)]">
          <Card className="rounded-[1.25rem] border-primary/20 bg-card shadow-panel">
            <CardHeader className="space-y-4 pb-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-foreground">
                    <MessageSquare className="size-5 text-primary" /> Feedback / Issues
                  </CardTitle>
                  <CardDescription>Review, prioritize, respond, and track user tickets.</CardDescription>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => fetchFeedbackReports()} disabled={feedbackLoading}>Refresh</Button>
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                {[
                  ["Total", feedbackStats.total, Inbox],
                  ["Open", feedbackStats.open, Clock],
                  ["Investigating", feedbackStats.investigating, Search],
                  ["Resolved", feedbackStats.resolved, CheckCircle2],
                  ["Critical", feedbackStats.critical, AlertTriangle],
                ].map(([label, value, Icon]) => (
                  <div key={String(label)} className="rounded-2xl border border-border bg-elevated p-3 shadow-soft">
                    <div className="flex items-center justify-between gap-2 text-xs font-semibold text-muted-foreground">
                      <span>{String(label)}</span>
                      <Icon className="size-4 text-primary" />
                    </div>
                    <p className="mt-1 text-2xl font-bold text-foreground">{String(value)}</p>
                  </div>
                ))}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 lg:grid-cols-[minmax(180px,1.2fr)_repeat(4,minmax(120px,1fr))]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={feedbackFilters.search} onChange={(event) => setFeedbackFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Search tickets" className="h-11 rounded-2xl pl-9 focus-visible:ring-inset" />
                </div>
                <select value={feedbackFilters.type} onChange={(event) => setFeedbackFilters((current) => ({ ...current, type: event.target.value }))} className="h-11 rounded-2xl border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/35">
                  {feedbackTypes.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <select value={feedbackFilters.status} onChange={(event) => setFeedbackFilters((current) => ({ ...current, status: event.target.value }))} className="h-11 rounded-2xl border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/35">
                  {feedbackStatuses.map((status) => <option key={status} value={status}>{status === "all" ? "All statuses" : feedbackStatusLabel(status as FeedbackReport["status"])}</option>)}
                </select>
                <select value={feedbackFilters.priority} onChange={(event) => setFeedbackFilters((current) => ({ ...current, priority: event.target.value }))} className="h-11 rounded-2xl border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/35">
                  {feedbackPriorities.map((priority) => <option key={priority} value={priority}>{priority === "all" ? "All priorities" : feedbackPriorityLabel(priority as FeedbackReport["priority"])}</option>)}
                </select>
                <Input type="date" value={feedbackFilters.date} onChange={(event) => setFeedbackFilters((current) => ({ ...current, date: event.target.value }))} className="h-11 rounded-2xl focus-visible:ring-inset" />
              </div>

              <div className="grid overflow-hidden rounded-2xl border border-border bg-elevated lg:grid-cols-[minmax(280px,0.9fr)_minmax(0,1.25fr)]">
                <div className="border-b border-border bg-card/45 lg:border-b-0 lg:border-r">
                  <div className="flex items-center justify-between border-b border-border px-4 py-3">
                    <p className="text-sm font-bold text-foreground">Tickets</p>
                    <span className="text-xs font-semibold text-muted-foreground">{filteredReports.length} shown</span>
                  </div>
                  <div className="max-h-[620px] overflow-y-auto p-2">
                    {feedbackLoading ? (
                      <div className="p-4 text-sm font-medium text-muted-foreground">Loading feedback...</div>
                    ) : filteredReports.length === 0 ? (
                      <div className="p-4 text-sm font-medium text-muted-foreground">No feedback reports found.</div>
                    ) : filteredReports.map((report) => (
                      <button key={report.id} type="button" onClick={() => setSelectedReportId(report.id)} className={`w-full rounded-2xl border p-3 text-left transition ${selectedReport?.id === report.id ? "border-primary/40 bg-primary/10 shadow-soft" : "border-transparent hover:border-border hover:bg-background"}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-foreground">{report.title}</p>
                            <p className="mt-1 truncate text-xs text-muted-foreground">{reportUserName(report)} - {new Date(report.created_at).toLocaleDateString("en-IN")}</p>
                          </div>
                          {report.priority === "critical" ? <AlertTriangle className="size-4 shrink-0 text-destructive" /> : <Eye className="size-4 shrink-0 text-primary" />}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          <span className="rounded-full border border-border bg-background px-2 py-1 text-[11px] font-bold text-muted-foreground">{feedbackTypeLabel(report.type)}</span>
                          <span className={`rounded-full border px-2 py-1 text-[11px] font-bold ${badgeTone(report.priority)}`}>{feedbackPriorityLabel(report.priority)}</span>
                          <span className={`rounded-full border px-2 py-1 text-[11px] font-bold ${badgeTone(report.status)}`}>{feedbackStatusLabel(report.status)}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="min-w-0 bg-card p-4 sm:p-5">
                  {selectedReport ? (
                    <div className="space-y-5">
                      <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-xs font-bold uppercase text-muted-foreground">{feedbackTypeLabel(selectedReport.type)}</p>
                          <h2 className="mt-1 text-xl font-bold leading-tight text-foreground">{selectedReport.title}</h2>
                          <p className="mt-1 text-sm text-muted-foreground">{reportUserName(selectedReport)} - {formatAdminDate(selectedReport.created_at)}</p>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2">
                          <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${badgeTone(selectedReport.priority)}`}>{feedbackPriorityLabel(selectedReport.priority)}</span>
                          <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${badgeTone(selectedReport.status)}`}>{feedbackStatusLabel(selectedReport.status)}</span>
                        </div>
                      </div>

                      <section className="rounded-2xl border border-border bg-elevated p-4">
                        <div className="mb-2 flex items-center gap-2 text-sm font-bold text-foreground"><FileText className="size-4 text-primary" /> Description</div>
                        <p className="whitespace-pre-line text-sm leading-6 text-foreground">{selectedReport.description}</p>
                        {screenshotPreviewUrl ? <img src={screenshotPreviewUrl} alt="Feedback screenshot" className="mt-4 max-h-72 w-full rounded-2xl border border-border bg-background object-contain" /> : null}
                      </section>

                      <div className="grid gap-4 lg:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Status</Label>
                          <select value={ticketDraft.status} onChange={(event) => setTicketDraft((current) => ({ ...current, status: event.target.value as FeedbackReport["status"] }))} disabled={savingReport} className="h-11 w-full rounded-2xl border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/35">
                            {feedbackStatuses.filter((status) => status !== "all").map((status) => <option key={status} value={status}>{feedbackStatusLabel(status as FeedbackReport["status"])}</option>)}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <Label>Priority</Label>
                          <select value={ticketDraft.priority} onChange={(event) => setTicketDraft((current) => ({ ...current, priority: event.target.value as FeedbackReport["priority"] }))} disabled={savingReport} className="h-11 w-full rounded-2xl border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/35">
                            {feedbackPriorities.filter((priority) => priority !== "all").map((priority) => <option key={priority} value={priority}>{feedbackPriorityLabel(priority as FeedbackReport["priority"])}</option>)}
                          </select>
                        </div>
                      </div>

                      <section className="grid gap-4 lg:grid-cols-2">
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
                        <div className="text-sm text-muted-foreground">
                          <p className="font-semibold text-foreground">Admin communication</p>
                          <p>Update Ticket saves all fields and emails the user once.</p>
                        </div>
                        <Button type="button" onClick={updateSelectedTicket} disabled={savingReport} className="sm:w-auto">{savingReport ? "Updating..." : "Update Ticket"}</Button>
                      </div>

                      <section className="rounded-2xl border border-border bg-elevated p-4">
                        <div className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground"><History className="size-4 text-primary" /> Timeline</div>
                        <div className="space-y-3">
                          {(selectedEvents.length ? selectedEvents : [{ id: "fallback", event_type: "created", report_id: selectedReport.id, status: selectedReport.status, priority: selectedReport.priority, message: "Ticket created", created_at: selectedReport.created_at } as FeedbackEvent]).map((event) => (
                            <div key={event.id} className="flex gap-3">
                              <span className="mt-1 grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><Clock className="size-3.5" /></span>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-foreground">{eventLabel(event)}</p>
                                {event.message && event.event_type === "admin_replied" ? <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{event.message}</p> : null}
                                <p className="mt-0.5 text-xs text-muted-foreground">{formatAdminDate(event.created_at)}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>

                      <div className="rounded-2xl border border-border bg-elevated p-3 text-xs text-muted-foreground">
                        <p>App v{selectedReport.app_version}</p>
                        <p>{selectedReport.device_info?.device_type || "Device"} / {selectedReport.device_info?.os || "OS"} / {selectedReport.device_info?.browser || "Browser"}</p>
                        <p className="break-all">{selectedReport.device_info?.viewport || ""}</p>
                      </div>
                      <Button type="button" variant="destructive" disabled={savingReport} onClick={() => deleteFeedbackReport(selectedReport)} className="w-full">
                        <Trash2 className="mr-2 size-4" /> Delete ticket
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm font-medium text-muted-foreground">Select a report to view details.</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-5">
            <Card className="rounded-[1.25rem] border-primary/20 bg-card shadow-panel">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-foreground"><Settings className="size-5 text-primary" /> Site Controls</CardTitle>
                <CardDescription>Manage global application state.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-elevated p-4 shadow-soft">
                  <div className="space-y-1">
                    <Label className="text-sm font-bold">Maintenance Mode</Label>
                    <p className="text-sm leading-5 text-muted-foreground">Temporarily redirect users while maintenance is active.</p>
                  </div>
                  <Switch checked={isMaintenance} onCheckedChange={toggleMaintenanceMode} disabled={fetchingMaintenance} className="data-[state=checked]:bg-destructive" />
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-[1.25rem] border-primary/20 bg-card shadow-panel">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-foreground"><Send className="size-5 text-primary" /> Broadcast Email</CardTitle>
                <CardDescription>Compose, preview, test, then send announcements.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <Label>Recipient Type</Label>
                  <div className="grid grid-cols-2 gap-1 rounded-2xl bg-elevated p-1">
                    <button type="button" onClick={() => setRecipientMode("single")} className={`rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${recipientMode === "single" ? "bg-primary text-primary-foreground shadow-primary-action" : "text-muted-foreground hover:bg-background"}`}>Specific user</button>
                    <button type="button" onClick={() => setRecipientMode("all")} className={`rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${recipientMode === "all" ? "bg-primary text-primary-foreground shadow-primary-action" : "text-muted-foreground hover:bg-background"}`}>All users</button>
                  </div>
                </div>
                {recipientMode === "single" ? (
                  <div className="space-y-2">
                    <Label htmlFor="targetEmail">Recipient Email</Label>
                    <Input id="targetEmail" type="email" placeholder="user@example.com" value={targetEmail} onChange={(event) => setTargetEmail(event.target.value)} className="focus-visible:ring-inset" />
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-2xl border border-border bg-elevated p-3 text-sm text-muted-foreground">
                    <Users className="size-4 text-primary" /> Sends to every registered Spendova user after testing.
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="testEmail">Test Email</Label>
                  <Input id="testEmail" type="email" placeholder="admin@example.com" value={testEmail} onChange={(event) => setTestEmail(event.target.value)} className="focus-visible:ring-inset" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="subject">Subject</Label>
                  <Input id="subject" placeholder="Scheduled maintenance notice" value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={100} className="focus-visible:ring-inset" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="message">Message</Label>
                  <Textarea id="message" placeholder={"Hi there,\n\nWe will be performing scheduled maintenance on Spendova.\n\nThank you for your patience."} value={message} onChange={(event) => setMessage(event.target.value)} className="min-h-36 text-sm focus-visible:ring-inset" />
                  <p className="text-xs text-muted-foreground">Spendova applies the official email layout automatically.</p>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <Label>Attachments</Label>
                    <span className="text-xs text-muted-foreground">Max 100MB total</span>
                  </div>
                  <Input type="file" id="file-upload" multiple className="hidden" onChange={handleFileChange} />
                  <Button type="button" variant="outline" className="w-full justify-center" onClick={() => document.getElementById("file-upload")?.click()}>
                    <Paperclip className="mr-2 size-4" /> Select Files
                  </Button>
                  {readingFiles > 0 ? <div className="rounded-xl border border-border bg-elevated px-3 py-2 text-xs text-muted-foreground">Reading {readingFiles} file{readingFiles > 1 ? "s" : ""}...</div> : null}
                  {attachments.length > 0 ? (
                    <div className="space-y-2">
                      {attachments.map((file, index) => (
                        <div key={`${file.name}-${index}`} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-elevated p-2 text-sm">
                          <span className="min-w-0 truncate">{file.name}</span>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
                            <Button type="button" variant="ghost" size="icon" className="size-7 text-destructive hover:bg-destructive/10" onClick={() => removeAttachment(index)}><X className="size-3" /></Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
                {showPreview ? (
                  <div className="rounded-2xl border border-border bg-elevated p-4">
                    <p className="text-sm font-bold text-foreground">{subject || "Email subject"}</p>
                    <p className="mt-2 whitespace-pre-line text-sm leading-6 text-muted-foreground">{message || "Email message preview"}</p>
                  </div>
                ) : null}
                <div className="grid gap-2 sm:grid-cols-3">
                  <Button type="button" variant="outline" onClick={() => setShowPreview((current) => !current)}>Preview</Button>
                  <Button type="button" variant="outline" disabled={Boolean(sendingMode) || readingFiles > 0} onClick={() => sendAdminMail("test")}>{sendingMode === "test" ? "Sending..." : "Send Test"}</Button>
                  <Button type="button" disabled={Boolean(sendingMode) || readingFiles > 0} onClick={() => sendAdminMail("broadcast")}>{sendingMode === "broadcast" ? "Sending..." : recipientMode === "all" ? "Send Broadcast" : "Send Email"}</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

const Admin = ({ view }: { view: "login" | "dashboard" | "root" }) => {
  if (view === "dashboard") return <AdminGuard><AdminDashboard /></AdminGuard>;
  if (view === "login") return <AdminLogin />;
  return <AdminGuard><AdminDashboard /></AdminGuard>;
};

export default Admin;
