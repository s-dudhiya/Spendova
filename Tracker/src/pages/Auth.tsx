import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff, LockKeyhole, LogIn, Mail, Shield, User, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type AuthMode = "login" | "register" | "forgot";
type Theme = "light" | "dark";

const BrandMark = () => (
  <span className="inline-flex items-center gap-3 sm:gap-4">
    <span className="relative flex h-11 w-11 items-center justify-center rounded-[1rem] border border-auth-line bg-auth-panel shadow-auth-input sm:h-[3.35rem] sm:w-[3.35rem] sm:rounded-[1.2rem]">
      <span className="absolute left-[0.8rem] top-[0.78rem] h-5 w-[0.34rem] rounded-full bg-auth-primary sm:left-[1rem] sm:top-[0.95rem] sm:h-6 sm:w-[0.38rem]" />
      <span className="absolute left-[1.25rem] top-[1.12rem] h-[0.34rem] w-4 rounded-full bg-auth-primary/85 sm:left-[1.6rem] sm:top-[1.38rem] sm:h-[0.38rem] sm:w-[1.1rem]" />
      <span className="absolute left-[1.2rem] top-[1.72rem] h-[0.34rem] w-[1.15rem] rounded-full bg-auth-ink sm:left-[1.55rem] sm:top-[2.05rem] sm:h-[0.38rem] sm:w-[1.35rem]" />
    </span>
    <span className="text-[1.55rem] font-semibold tracking-[0.01em] text-auth-ink sm:text-[2rem]">Spendova</span>
  </span>
);

const getInitialTheme = (): Theme => {
  if (typeof window === "undefined") return "light";
  const saved = window.localStorage.getItem("spendova-theme");
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

const PasswordField = ({ label, placeholder, value, onChange }: { label: string; placeholder: string; value: string; onChange: (value: string) => void }) => {
  const [visible, setVisible] = useState(false);

  return (
    <label className="block text-[0.95rem] font-bold leading-none text-auth-ink sm:text-base">
      {label}
      <span className="mt-3 flex h-[3.55rem] items-center gap-3 rounded-[1.05rem] border border-auth-line bg-auth-field px-4 shadow-auth-input transition-colors duration-150 focus-within:border-auth-primary focus-within:ring-2 focus-within:ring-auth-focus/30 sm:mt-4 sm:h-[4.05rem] sm:gap-5 sm:rounded-[1.2rem] sm:px-6">
        <LockKeyhole className="size-[1.15rem] text-auth-muted sm:size-5" strokeWidth={1.75} />
        <input type={visible ? "text" : "password"} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="min-w-0 flex-1 bg-transparent text-[0.98rem] font-normal leading-none text-auth-ink outline-none placeholder:text-auth-muted/85 sm:text-lg" />
        <button type="button" onClick={() => setVisible((current) => !current)} className="text-auth-muted transition-colors hover:text-auth-ink" aria-label={visible ? "Hide password" : "Show password"}>
          {visible ? <EyeOff className="size-5 sm:size-6" strokeWidth={1.75} /> : <Eye className="size-5 sm:size-6" strokeWidth={1.75} />}
        </button>
      </span>
    </label>
  );
};

const TextField = ({ label, placeholder, value, onChange, type = "text", icon: Icon }: { label: string; placeholder: string; value: string; onChange: (value: string) => void; type?: string; icon: typeof User }) => (
  <label className="block text-[0.95rem] font-bold leading-none text-auth-ink sm:text-base">
    {label}
    <span className="mt-3 flex h-[3.55rem] items-center gap-3 rounded-[1.05rem] border border-auth-line bg-auth-field px-4 shadow-auth-input transition-colors duration-150 focus-within:border-auth-primary focus-within:ring-2 focus-within:ring-auth-focus/30 sm:mt-4 sm:h-[4.05rem] sm:gap-5 sm:rounded-[1.2rem] sm:px-6">
      <Icon className="size-[1.15rem] text-auth-muted sm:size-5" strokeWidth={1.75} />
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="min-w-0 flex-1 bg-transparent text-[0.98rem] font-normal leading-none text-auth-ink outline-none placeholder:text-auth-muted/85 sm:text-lg" />
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
  const { user, loading, signIn, signUp, resetPassword } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const isLogin = mode === "login";
  const isRegister = mode === "register";

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

  if (!loading && user) {
    const redirect = searchParams.get("redirect") || "/dashboard";
    return <Navigate to={redirect} replace />;
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError("");

    if (isRegister && password !== confirmPassword) {
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
        : await resetPassword(email);
    setSubmitting(false);

    if (!result.error && isLogin) navigate(redirect || "/dashboard", { replace: true });
    if (!result.error && mode === "forgot") navigate("/login");
  };

  return (
    <main className="auth-shell min-h-screen overflow-x-hidden bg-auth-page px-4 py-4 font-sans text-auth-ink sm:px-6 sm:py-5">
      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-[43rem] flex-col sm:min-h-[calc(100vh-2.5rem)]">
        <header className="pt-2 text-center sm:pt-10">
          <Link to="/" className="mx-auto inline-flex items-center justify-center">
            <BrandMark />
          </Link>
          <p className="mt-3 text-[1.05rem] font-normal leading-none text-auth-muted sm:mt-4 sm:text-[1.45rem]">Split. Track. Grow.</p>
        </header>

        <section className="mt-7 sm:mt-12">
          <div className="mx-auto max-w-[34rem] space-y-2 text-left sm:space-y-4">
            <h1 className="text-[1.55rem] font-bold leading-tight text-auth-ink sm:text-[1.95rem]">{isLogin ? "Welcome back!" : isRegister ? "Create account" : "Forgot password"}</h1>
            <p className="text-[1.05rem] font-normal leading-6 text-auth-muted sm:text-[1.32rem] sm:leading-7">
              {isLogin ? "Login to continue managing your expenses." : isRegister ? "Register to start managing your expenses." : "Enter your email to reset your password."}
            </p>
          </div>
        </section>

        <form onSubmit={handleSubmit} className="mt-6 rounded-[1.75rem] bg-auth-panel px-5 py-6 shadow-auth sm:mt-9 sm:rounded-[2.45rem] sm:px-12 sm:py-11">
          <div className="space-y-5 sm:space-y-8">
            {isRegister && <TextField label="Full name" value={fullName} onChange={setFullName} placeholder="Enter full name" icon={UserRound} />}
            {isRegister && (
              <div>
                <TextField label="Username" value={username} onChange={(value) => setUsername(value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} placeholder="Choose username" icon={User} />
                {username && <p className={`mt-2 text-sm font-semibold ${usernameStatus === "available" ? "text-success" : usernameStatus === "checking" ? "text-auth-muted" : "text-destructive"}`}>{usernameStatus === "available" ? "Username is available" : usernameStatus === "checking" ? "Checking username..." : "Username must be unique and at least 3 characters"}</p>}
              </div>
            )}
            <TextField label="Email" value={email} onChange={setEmail} placeholder="Enter email address" type="email" icon={Mail} />
            {mode !== "forgot" && <PasswordField label="Password" value={password} onChange={setPassword} placeholder="Enter password" />}
            {isRegister && <PasswordField label="Confirm password" value={confirmPassword} onChange={setConfirmPassword} placeholder="Confirm password" />}
          </div>

          {isLogin && (
            <div className="mt-4 flex justify-end sm:mt-7">
              <Link to="/forgot-password" className="text-base font-semibold text-auth-primary sm:text-[1.2rem]">Forgot password?</Link>
            </div>
          )}

          {formError && <p className="mt-4 text-sm font-semibold text-destructive">{formError}</p>}

          <Button type="submit" disabled={submitting || (isRegister && usernameStatus !== "available")} className="mt-7 h-14 w-full rounded-2xl bg-auth-primary text-lg font-bold text-primary-foreground shadow-primary-action transition duration-150 hover:bg-auth-primary/90 active:scale-[0.985] active:shadow-soft sm:mt-10 sm:h-[4.7rem] sm:rounded-[1.15rem] sm:text-[1.35rem]">
            <LogIn className="size-6 sm:size-7" strokeWidth={2} />
            {submitting ? "Please wait..." : isLogin ? "Login" : isRegister ? "Register" : "Send reset link"}
          </Button>

          <div className="mt-7 text-center text-base font-normal text-auth-muted sm:mt-10 sm:text-[1.18rem]">
            {isLogin ? (
              <>Don&apos;t have an account? <Link to="/register" className="ml-3 font-semibold text-auth-primary">Register</Link></>
            ) : (
              <>Already have an account? <Link to="/login" className="ml-3 font-semibold text-auth-primary">Login</Link></>
            )}
          </div>
        </form>

        <footer className="mt-auto pt-6 text-center sm:pt-9">
          <p className="inline-flex items-center justify-center gap-2 text-sm font-normal text-auth-muted sm:text-[1.05rem]">
            <Shield className="size-4 text-auth-primary sm:size-5" fill="currentColor" strokeWidth={1.8} />
            Secure login • Encrypted data
          </p>
          <p className="mt-2 text-sm font-normal text-auth-muted sm:mt-4 sm:text-[1.05rem]">© 2026 Spendova. All rights reserved.</p>
        </footer>
      </div>
    </main>
  );
};

export default Auth;
