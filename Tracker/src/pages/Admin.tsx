import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Eye, Lock, LogOut, Mail, MessageSquare, Paperclip, Send, Settings, Trash2, X } from "lucide-react";
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
  created_at: string;
  updated_at: string;
  profiles?: { user_id: string; full_name: string | null; username: string | null } | null;
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
  const [attachments, setAttachments] = useState<Array<{ name: string; data: string; size: number }>>([]);
  const [isSending, setIsSending] = useState(false);
  const [isMaintenance, setIsMaintenance] = useState(false);
  const [fetchingMaintenance, setFetchingMaintenance] = useState(false);
  const [readingFiles, setReadingFiles] = useState(0);
  const [feedbackReports, setFeedbackReports] = useState<FeedbackReport[]>([]);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [screenshotPreviewUrl, setScreenshotPreviewUrl] = useState("");
  const [feedbackFilters, setFeedbackFilters] = useState({ type: "all", status: "all", priority: "all", date: "" });
  const [savingReport, setSavingReport] = useState(false);
  const { toast } = useToast();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const selectedReport = feedbackReports.find((report) => report.id === selectedReportId) || feedbackReports[0] || null;

  const filteredReports = useMemo(() => feedbackReports.filter((report) => {
    const dateMatches = !feedbackFilters.date || report.created_at?.startsWith(feedbackFilters.date);
    return (feedbackFilters.type === "all" || report.type === feedbackFilters.type)
      && (feedbackFilters.status === "all" || report.status === feedbackFilters.status)
      && (feedbackFilters.priority === "all" || report.priority === feedbackFilters.priority)
      && dateMatches;
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
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const fetchFeedbackReports = async (options?: { silent?: boolean }) => {
    if (!options?.silent) setFeedbackLoading(true);
    try {
      const { data, error } = await supabase
        .from("feedback_reports" as never)
        .select("id,user_id,type,title,description,screenshot_url,priority,status,device_info,app_version,admin_notes,created_at,updated_at,profiles!feedback_reports_user_id_fkey(user_id,full_name,username)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const reports = (data || []) as unknown as FeedbackReport[];
      setFeedbackReports(reports);
      setSelectedReportId((current) => current && reports.some((report) => report.id === current) ? current : reports[0]?.id || null);
    } catch (error) {
      console.error("Failed to fetch feedback reports", error);
      toast({ title: "Feedback unavailable", description: getFriendlyErrorMessage(error, "feedback"), variant: "destructive" });
    } finally {
      setFeedbackLoading(false);
    }
  };

  const updateFeedbackReport = async (reportId: string, patch: Partial<Pick<FeedbackReport, "status" | "priority" | "admin_notes">>) => {
    setSavingReport(true);
    try {
      const { error } = await supabase.from("feedback_reports" as never).update(patch as never).eq("id", reportId);
      if (error) throw error;
      toast({ title: "Report updated", description: "Feedback status has been saved." });
      await fetchFeedbackReports({ silent: true });
    } catch (error) {
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
    } catch (error: any) {
      console.error("Failed to update maintenance state", error);
      setIsMaintenance(!checked);
      toast({ title: "Update failed", description: getFriendlyErrorMessage(error, "admin"), variant: "destructive" });
    }
  };

  const handleLogout = () => {
    setPasswordlessCleanup();
    signOut().finally(() => navigate("/admin/login", { replace: true }));
  };

  const setPasswordlessCleanup = () => {
    setSubject("");
    setMessage("");
    setTargetEmail("");
    setAttachments([]);
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
        else toast({ title: "Read error", description: `Could not read ${file.name}.`, variant: "destructive" });
      };
      reader.onerror = () => {
        setReadingFiles((count) => count - 1);
        toast({ title: "File error", description: `Failed to read "${file.name}".`, variant: "destructive" });
      };
      reader.readAsDataURL(file);
    });

    event.target.value = "";
  };

  const removeAttachment = (indexToRemove: number) => {
    setAttachments((current) => current.filter((_, index) => index !== indexToRemove));
  };

  const handleSendBroadcast = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!subject.trim() || !message.trim()) {
      toast({ title: "Required fields", description: "Please provide both a subject and a message.", variant: "destructive" });
      return;
    }
    if (recipientMode === "single" && !targetEmail.trim()) {
      toast({ title: "Recipient required", description: "Enter the email address you want to test with.", variant: "destructive" });
      return;
    }

    setIsSending(true);
    try {
      const { error } = await supabase.functions.invoke("send-admin-mail", {
        body: {
          subject,
          htmlBody: message,
          attachments,
          recipientMode,
          targetEmail: recipientMode === "single" ? targetEmail.trim().toLowerCase() : undefined,
          sendToAll: recipientMode === "all",
        },
      });
      if (error) throw error;
      toast({ title: recipientMode === "single" ? "Email sent" : "Broadcast sent", description: "The email was successfully dispatched." });
      setSubject("");
      setMessage("");
      setAttachments([]);
    } catch (error: any) {
      console.error("Broadcast error", error);
      toast({ title: "Broadcast failed", description: getFriendlyErrorMessage(error, "admin"), variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 text-foreground md:p-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Mail className="size-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Spendova Admin Portal</h1>
              <p className="text-sm text-muted-foreground">Broadcast messages and manage global app state.</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout} className="text-destructive hover:bg-destructive/10 hover:text-destructive">
            <LogOut className="mr-2 size-4" /> Log Out
          </Button>
        </div>

        <Card className="rounded-[1.25rem] border-primary/20 bg-card shadow-panel">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <MessageSquare className="size-5 text-primary" />
              Feedback / Issues
            </CardTitle>
            <CardDescription>Review user feedback, bug reports, and support tickets.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              {[
                ["Total Reports", feedbackStats.total],
                ["Open", feedbackStats.open],
                ["Investigating", feedbackStats.investigating],
                ["Resolved", feedbackStats.resolved],
                ["Critical", feedbackStats.critical],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl bg-elevated p-3 shadow-soft">
                  <p className="text-xs font-semibold text-muted-foreground">{label}</p>
                  <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <select value={feedbackFilters.type} onChange={(event) => setFeedbackFilters((current) => ({ ...current, type: event.target.value }))} className="h-11 rounded-2xl border border-input bg-background px-3 text-sm text-foreground">
                {feedbackTypes.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <select value={feedbackFilters.status} onChange={(event) => setFeedbackFilters((current) => ({ ...current, status: event.target.value }))} className="h-11 rounded-2xl border border-input bg-background px-3 text-sm text-foreground">
                {feedbackStatuses.map((status) => <option key={status} value={status}>{status === "all" ? "All statuses" : feedbackStatusLabel(status as FeedbackReport["status"])}</option>)}
              </select>
              <select value={feedbackFilters.priority} onChange={(event) => setFeedbackFilters((current) => ({ ...current, priority: event.target.value }))} className="h-11 rounded-2xl border border-input bg-background px-3 text-sm text-foreground">
                {feedbackPriorities.map((priority) => <option key={priority} value={priority}>{priority === "all" ? "All priorities" : feedbackPriorityLabel(priority as FeedbackReport["priority"])}</option>)}
              </select>
              <Input type="date" value={feedbackFilters.date} onChange={(event) => setFeedbackFilters((current) => ({ ...current, date: event.target.value }))} className="h-11 rounded-2xl" />
            </div>

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
              <div className="overflow-hidden rounded-2xl border border-border bg-elevated">
                <div className="grid grid-cols-[0.8fr_1.3fr_0.9fr_0.8fr_0.8fr_0.9fr_44px] gap-2 border-b border-border px-4 py-3 text-xs font-bold uppercase text-muted-foreground max-md:hidden">
                  <span>Type</span><span>Title</span><span>User</span><span>Priority</span><span>Status</span><span>Created</span><span />
                </div>
                <div className="max-h-[460px] overflow-y-auto">
                  {feedbackLoading ? (
                    <div className="p-5 text-sm font-medium text-muted-foreground">Loading feedback...</div>
                  ) : filteredReports.length === 0 ? (
                    <div className="p-5 text-sm font-medium text-muted-foreground">No feedback reports yet.</div>
                  ) : filteredReports.map((report) => (
                    <button key={report.id} type="button" onClick={() => setSelectedReportId(report.id)} className={`grid w-full gap-2 border-b border-border/70 px-4 py-3 text-left text-sm transition-colors md:grid-cols-[0.8fr_1.3fr_0.9fr_0.8fr_0.8fr_0.9fr_44px] ${selectedReport?.id === report.id ? "bg-primary/10" : "hover:bg-card"}`}>
                      <span className="font-semibold text-foreground">{feedbackTypeLabel(report.type)}</span>
                      <span className="min-w-0 truncate font-bold text-foreground">{report.title}</span>
                      <span className="truncate text-muted-foreground">{reportUserName(report)}</span>
                      <span className={report.priority === "critical" ? "font-bold text-destructive" : "text-muted-foreground"}>{feedbackPriorityLabel(report.priority)}</span>
                      <span className="text-muted-foreground">{feedbackStatusLabel(report.status)}</span>
                      <span className="text-muted-foreground">{new Date(report.created_at).toLocaleDateString("en-IN")}</span>
                      <Eye className="size-4 text-primary max-md:hidden" />
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-elevated p-4 shadow-soft">
                {selectedReport ? (
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-bold uppercase text-muted-foreground">{feedbackTypeLabel(selectedReport.type)}</p>
                        <h3 className="mt-1 truncate text-lg font-bold text-foreground">{selectedReport.title}</h3>
                        <p className="mt-1 text-sm text-muted-foreground">{reportUserName(selectedReport)} · {new Date(selectedReport.created_at).toLocaleString("en-IN")}</p>
                      </div>
                      {selectedReport.priority === "critical" ? <AlertTriangle className="size-5 shrink-0 text-destructive" /> : null}
                    </div>
                    <p className="rounded-2xl bg-card p-3 text-sm leading-6 text-foreground">{selectedReport.description}</p>
                    {screenshotPreviewUrl ? <img src={screenshotPreviewUrl} alt="Feedback screenshot" className="max-h-72 w-full rounded-2xl border border-border object-contain bg-background" /> : null}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Status</Label>
                        <select value={selectedReport.status} onChange={(event) => updateFeedbackReport(selectedReport.id, { status: event.target.value as FeedbackReport["status"] })} disabled={savingReport} className="h-11 w-full rounded-2xl border border-input bg-background px-3 text-sm text-foreground">
                          {feedbackStatuses.filter((status) => status !== "all").map((status) => <option key={status} value={status}>{feedbackStatusLabel(status as FeedbackReport["status"])}</option>)}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label>Priority</Label>
                        <select value={selectedReport.priority} onChange={(event) => updateFeedbackReport(selectedReport.id, { priority: event.target.value as FeedbackReport["priority"] })} disabled={savingReport} className="h-11 w-full rounded-2xl border border-input bg-background px-3 text-sm text-foreground">
                          {feedbackPriorities.filter((priority) => priority !== "all").map((priority) => <option key={priority} value={priority}>{feedbackPriorityLabel(priority as FeedbackReport["priority"])}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Internal admin notes</Label>
                      <Textarea value={selectedReport.admin_notes || ""} onChange={(event) => {
                        const value = event.target.value;
                        setFeedbackReports((current) => current.map((report) => report.id === selectedReport.id ? { ...report, admin_notes: value } : report));
                      }} className="min-h-24 text-sm" placeholder="Private notes for the admin team." />
                      <Button type="button" variant="outline" disabled={savingReport} onClick={() => updateFeedbackReport(selectedReport.id, { admin_notes: selectedReport.admin_notes || "" })}>Save notes</Button>
                    </div>
                    <div className="rounded-2xl bg-card p-3 text-xs text-muted-foreground">
                      <p>App v{selectedReport.app_version}</p>
                      <p>{selectedReport.device_info?.device_type || "Device"} · {selectedReport.device_info?.os || "OS"} · {selectedReport.device_info?.browser || "Browser"}</p>
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

        <div className="grid gap-8 md:grid-cols-2">
          <Card className="h-fit rounded-[1.25rem] border-primary/20 bg-card shadow-panel">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <Settings className="size-5 text-primary" />
                Site Controls
              </CardTitle>
              <CardDescription>Manage global application state.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between rounded-2xl border border-border bg-elevated p-4 shadow-soft">
                <div className="space-y-0.5">
                  <Label className="text-base font-semibold">Maintenance Mode</Label>
                  <p className="text-sm text-muted-foreground">Redirect all users to the maintenance page.</p>
                </div>
                <Switch checked={isMaintenance} onCheckedChange={toggleMaintenanceMode} disabled={fetchingMaintenance} className="data-[state=checked]:bg-destructive" />
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[1.25rem] border-primary/20 bg-card shadow-panel">
            <CardHeader>
              <CardTitle className="text-foreground">Broadcast Email</CardTitle>
              <CardDescription>Send a test email to one user, or broadcast to every registered Spendova user.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSendBroadcast} className="space-y-6">
                <div className="space-y-3">
                  <Label>Recipients</Label>
                  <div className="grid grid-cols-2 gap-2 rounded-full bg-elevated p-1">
                    <button type="button" onClick={() => setRecipientMode("single")} className={`rounded-full px-3 py-2 text-sm font-semibold transition-colors ${recipientMode === "single" ? "bg-primary text-primary-foreground shadow-primary-action" : "text-muted-foreground"}`}>Specific user</button>
                    <button type="button" onClick={() => setRecipientMode("all")} className={`rounded-full px-3 py-2 text-sm font-semibold transition-colors ${recipientMode === "all" ? "bg-primary text-primary-foreground shadow-primary-action" : "text-muted-foreground"}`}>All users</button>
                  </div>
                  {recipientMode === "single" && (
                    <div className="space-y-2">
                      <Label htmlFor="targetEmail">Test recipient email</Label>
                      <Input id="targetEmail" type="email" placeholder="user@example.com" value={targetEmail} onChange={(event) => setTargetEmail(event.target.value)} />
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="subject">Email Subject</Label>
                  <Input id="subject" placeholder="e.g. Scheduled Maintenance Notice" value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={100} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="message">Email Message</Label>
                  <Textarea id="message" placeholder={"Hi there,\n\nWe will be performing scheduled maintenance on Spendova.\n\nThank you for your patience."} value={message} onChange={(event) => setMessage(event.target.value)} className="min-h-[250px] text-sm" />
                  <p className="text-xs text-muted-foreground">Spendova will apply the official email layout automatically.</p>
                </div>

                <div className="space-y-3">
                  <Label>Attachments (Max 100MB)</Label>
                  <Input type="file" id="file-upload" multiple className="hidden" onChange={handleFileChange} />
                  <Button type="button" variant="outline" onClick={() => document.getElementById("file-upload")?.click()}>
                    <Paperclip className="mr-2 size-4" /> Select Files
                  </Button>

                  {readingFiles > 0 && (
                    <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-elevated px-3 py-2 text-xs text-muted-foreground">
                      <div className="size-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      Reading {readingFiles} file{readingFiles > 1 ? "s" : ""}...
                    </div>
                  )}

                  {attachments.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {attachments.map((file, index) => (
                        <div key={`${file.name}-${index}`} className="flex items-center justify-between rounded-md border bg-elevated p-2 text-sm">
                          <span className="max-w-[200px] truncate">{file.name}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
                            <Button type="button" variant="ghost" size="icon" className="size-6 text-destructive hover:bg-destructive/10" onClick={() => removeAttachment(index)}>
                              <X className="size-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <Button type="submit" disabled={isSending || readingFiles > 0} className="w-full">
                  {isSending ? "Sending Email..." : <><Send className="mr-2 size-4" /> {recipientMode === "single" ? "Send Test Email" : "Dispatch Email to All Users"}</>}
                </Button>
              </form>
            </CardContent>
          </Card>
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
