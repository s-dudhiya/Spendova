import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, LogOut, Mail, Paperclip, Send, Settings, X } from "lucide-react";
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
  const { toast } = useToast();
  const { signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    fetchMaintenanceState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      <div className="mx-auto max-w-3xl space-y-8">
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
