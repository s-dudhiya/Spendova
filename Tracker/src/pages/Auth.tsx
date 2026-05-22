import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff, LockKeyhole, LogIn, Mail, ShieldCheck, User, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type AuthMode = "login" | "register" | "forgot" | "reset";
type Theme = "light" | "dark";

const getInitialTheme = (): Theme => {
  if (typeof window === "undefined") return "light";
  const saved = window.localStorage.getItem("spendova-theme");
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

const PasswordField = ({ label, placeholder, value, onChange }: { label: string; placeholder: string; value: string; onChange: (value: string) => void }) => {
  const [visible, setVisible] = useState(false);

  return (
    <label className="block text-sm font-semibold text-foreground">
      {label}
      <span className="mt-2 flex h-12 items-center gap-3 rounded-full border border-input bg-background px-4 shadow-soft transition focus-within:border-primary focus-within:ring-2 focus-within:ring-ring/35">
        <LockKeyhole className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.8} />
        <input required type={visible ? "text" : "password"} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground" />
        <button type="button" onClick={() => setVisible((current) => !current)} className="text-muted-foreground transition hover:text-foreground" aria-label={visible ? "Hide password" : "Show password"}>
          {visible ? <EyeOff className="size-4" strokeWidth={1.8} /> : <Eye className="size-4" strokeWidth={1.8} />}
        </button>
      </span>
    </label>
  );
};

const TextField = ({ label, placeholder, value, onChange, type = "text", icon: Icon }: { label: string; placeholder: string; value: string; onChange: (value: string) => void; type?: string; icon: typeof User }) => (
  <label className="block text-sm font-semibold text-foreground">
    {label}
    <span className="mt-2 flex h-12 items-center gap-3 rounded-full border border-input bg-background px-4 shadow-soft transition focus-within:border-primary focus-within:ring-2 focus-within:ring-ring/35">
      <Icon className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.8} />
      <input required type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground" />
    </span>
  </label>
);

const Auth = ({ mode }: { mode: AuthMode }) => {
  const [theme] = useState<Theme>(getInitialTheme);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const [formError, setFormError] = useState("");
  const { user, loading, signIn, signUp, resetPassword, updatePassword } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const isReset = mode === "reset" || searchParams.get("reset") === "true";
  const isLogin = mode === "login" && !isReset;
  const isRegister = mode === "register";
  const isForgot = mode === "forgot";

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    if (!isRegister || username.length === 0) {
      setUsernameStatus("idle");
      return;
    }
    if (username.length < 3) {
      setUsernameStatus("taken");
      return;
    }
    const timer = window.setTimeout(async () => {
      setUsernameStatus("checking");
      const { data, error } = await supabase.from("profiles").select("id").eq("username", username).maybeSingle();
      setUsernameStatus(error || data ? "taken" : "available");
    }, 450);
    return () => window.clearTimeout(timer);
  }, [isRegister, username]);

  if (!loading && user && !isReset) {
    const redirect = searchParams.get("redirect") || "/dashboard";
    return <Navigate to={redirect} replace />;
  }

  const heading = isLogin ? "Welcome back" : isRegister ? "Create your account" : isReset ? "Set a new password" : "Reset your password";
  const description = isLogin
    ? "Sign in to continue tracking expenses, splits, and balances."
    : isRegister
      ? "Start with a clean profile built for personal spends and shared costs."
      : isReset
        ? "Choose a strong password to secure your Spendova account."
        : "Enter your email and we will send a password reset link.";
  const buttonLabel = submitting ? "Please wait..." : isLogin ? "Login" : isRegister ? "Register" : isReset ? "Update password" : "Send reset link";

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError("");

    if ((isRegister || isReset) && password !== confirmPassword) {
      setFormError("Passwords do not match.");
      return;
    }
    if (isRegister && usernameStatus !== "available") {
      setFormError("Please choose a valid and unique username.");
      return;
    }

    setSubmitting(true);
    const redirect = searchParams.get("redirect") || undefined;
    const result = isLogin
      ? await signIn(email, password)
      : isRegister
        ? await signUp(email, password, fullName, username, redirect)
        : isReset
          ? await updatePassword(password)
          : await resetPassword(email);
    setSubmitting(false);

    if (!result.error && isLogin) navigate(redirect || "/dashboard", { replace: true });
    if (!result.error && (isForgot || isReset)) navigate("/login", { replace: true });
  };

  return (
    <main className="min-h-screen bg-background px-4 py-5 text-foreground sm:px-6 sm:py-8">
      <div className="mx-auto flex min-h-[calc(100vh-2.5rem)] w-full max-w-md flex-col sm:min-h-[calc(100vh-4rem)]">
        <header className="text-center">
          <Link to="/" className="inline-flex justify-center" aria-label="Spendova home">
            <img src="/brand/spendova-horizontal.png" alt="Spendova" className="h-auto w-[15.5rem] max-w-full sm:w-[18rem]" />
          </Link>
        </header>

        <section className="mt-7 rounded-[1.25rem] bg-card p-5 shadow-panel sm:mt-8 sm:p-6">
          <div className="mb-5 text-left">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Spendova account</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{heading}</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegister && <TextField label="Full name" value={fullName} onChange={setFullName} placeholder="Enter full name" icon={UserRound} />}
            {isRegister && (
              <div>
                <TextField label="Username" value={username} onChange={(value) => setUsername(value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} placeholder="Choose username" icon={User} />
                {username && <p className={`mt-2 text-xs font-semibold ${usernameStatus === "available" ? "text-success" : usernameStatus === "checking" ? "text-muted-foreground" : "text-destructive"}`}>{usernameStatus === "available" ? "Username is available" : usernameStatus === "checking" ? "Checking username..." : "Username must be unique and at least 3 characters"}</p>}
              </div>
            )}
            {!isReset && <TextField label="Email" value={email} onChange={setEmail} placeholder="Enter email address" type="email" icon={Mail} />}
            {!isForgot && <PasswordField label={isReset ? "New password" : "Password"} value={password} onChange={setPassword} placeholder={isReset ? "Enter new password" : "Enter password"} />}
            {(isRegister || isReset) && <PasswordField label="Confirm password" value={confirmPassword} onChange={setConfirmPassword} placeholder="Confirm password" />}

            {isLogin && (
              <div className="flex justify-end">
                <Link to="/forgot-password" className="text-sm font-semibold text-primary">Forgot password?</Link>
              </div>
            )}

            {formError && <p className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">{formError}</p>}

            <Button type="submit" disabled={submitting || (isRegister && usernameStatus !== "available")} className="h-12 w-full shadow-primary-action">
              <LogIn className="size-4" strokeWidth={2} />
              {buttonLabel}
            </Button>
          </form>

          <div className="mt-5 rounded-2xl bg-elevated px-4 py-3 text-center text-sm font-medium text-muted-foreground shadow-soft">
            {isLogin ? (
              <>New to Spendova? <Link to="/register" className="font-semibold text-primary">Create account</Link></>
            ) : (
              <>Already have access? <Link to="/login" className="font-semibold text-primary">Login</Link></>
            )}
          </div>
        </section>

        <footer className="mt-auto space-y-2 pt-6 text-center">
          <p className="inline-flex items-center justify-center gap-2 text-sm font-medium text-muted-foreground">
            <ShieldCheck className="size-4 text-primary" strokeWidth={1.8} />
            Secure login. Encrypted data.
          </p>
          <p className="text-xs font-medium text-muted-foreground">Copyright 2026 Spendova. All rights reserved.</p>
        </footer>
      </div>
    </main>
  );
};

export default Auth;
