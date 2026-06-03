import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff, LockKeyhole, LogIn, Mail, ShieldCheck, User, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { getFriendlyErrorMessage, getFriendlyErrorTitle } from "@/lib/friendly-error";
import { LEGACY_THEME_STORAGE_KEY, THEME_STORAGE_KEY } from "@/hooks/useTheme";
import { safeStorage } from "@/lib/startup-safety";

type AuthMode = "login" | "register" | "forgot" | "reset";
type Theme = "light" | "dark";
const AUTH_BRAND_IMAGE = "/brand/login-branding-image.png";
const AUTH_BRAND_IMAGE_MOBILE = "/brand/login-branding-image-mobile.webp";
const AUTH_BRAND_IMAGE_TABLET = "/brand/login-branding-image-tablet.webp";
const AUTH_BRAND_IMAGE_DESKTOP = "/brand/login-branding-image-desktop.webp";
const SIGNUP_PASSWORD_KEY = "spendova_pending_signup_password";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 6;

const getInitialTheme = (): Theme => {
  if (typeof window === "undefined") return "light";
  const saved = safeStorage.getItem(THEME_STORAGE_KEY);
  if (saved === "light" || saved === "dark") return saved;
  const legacy = safeStorage.getItem(LEGACY_THEME_STORAGE_KEY);
  if (legacy === "light" || legacy === "dark") {
    safeStorage.setItem(THEME_STORAGE_KEY, legacy);
    safeStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
    return legacy;
  }
  return "light";
};

const PasswordField = ({ label, placeholder, value, onChange }: { label: string; placeholder: string; value: string; onChange: (value: string) => void }) => {
  const [visible, setVisible] = useState(false);

  return (
    <label className="block text-sm font-semibold text-[#11103a]">
      {label}
      <span className="mt-2 flex h-[42px] items-center gap-3 rounded-xl border border-[#cbbdff] bg-[#f4f0ff] px-3.5 text-[#6b5f91] shadow-[inset_0_1px_2px_rgba(113,70,220,0.08)] transition focus-within:border-[#7c3aed] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#8b5cf6]/20 sm:h-12 sm:px-4">
        <LockKeyhole className="size-4 shrink-0 text-[#7c3aed]" strokeWidth={1.8} />
        <input required type={visible ? "text" : "password"} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="min-w-0 flex-1 bg-transparent text-sm font-medium text-[#171445] outline-none placeholder:text-[#7c719c]" />
        <button type="button" onClick={() => setVisible((current) => !current)} className="text-[#7c3aed] transition hover:text-[#5b21b6]" aria-label={visible ? "Hide password" : "Show password"}>
          {visible ? <EyeOff className="size-4" strokeWidth={1.8} /> : <Eye className="size-4" strokeWidth={1.8} />}
        </button>
      </span>
    </label>
  );
};

const TextField = ({ label, placeholder, value, onChange, type = "text", icon: Icon }: { label: string; placeholder: string; value: string; onChange: (value: string) => void; type?: string; icon: typeof User }) => (
  <label className="block text-sm font-semibold text-[#11103a]">
    {label}
    <span className="mt-2 flex h-[42px] items-center gap-3 rounded-xl border border-[#cbbdff] bg-[#f4f0ff] px-3.5 text-[#6b5f91] shadow-[inset_0_1px_2px_rgba(113,70,220,0.08)] transition focus-within:border-[#7c3aed] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#8b5cf6]/20 sm:h-12 sm:px-4">
      <Icon className="size-4 shrink-0 text-[#7c3aed]" strokeWidth={1.8} />
      <input required type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="min-w-0 flex-1 bg-transparent text-sm font-medium text-[#171445] outline-none placeholder:text-[#7c719c]" />
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
  const { user, loading, signIn } = useAuth();
  const { toast } = useToast();
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

  const heading = isLogin ? "Welcome back" : isRegister ? "Create your account" : isReset ? "Reset password" : "Reset your password";
  const description = isLogin
    ? "Sign in to continue tracking expenses, splits, and balances."
    : isRegister
      ? "Start with a clean profile built for personal spends and shared costs."
      : isReset
        ? "Enter your email and we will send a verification code."
        : "Enter your email and we will send a verification code.";
  const buttonLabel = submitting ? "Please wait..." : isLogin ? "Login" : isRegister ? "Send verification code" : "Send verification code";
  const redirectParam = searchParams.get("redirect");
  const loginLink = redirectParam ? `/login?redirect=${encodeURIComponent(redirectParam)}` : "/login";
  const registerLink = redirectParam ? `/register?redirect=${encodeURIComponent(redirectParam)}` : "/register";

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError("");

    if (!isLogin && !EMAIL_PATTERN.test(email.trim())) {
      const message = getFriendlyErrorMessage("invalid email", "auth");
      setFormError(message);
      toast({ title: getFriendlyErrorTitle(message, "auth"), description: message, variant: "destructive" });
      return;
    }
    if (isLogin && !email.trim()) {
      const message = "Please enter your email or username.";
      setFormError(message);
      toast({ title: "Check your login", description: message, variant: "destructive" });
      return;
    }
    if (isRegister && password !== confirmPassword) {
      const message = getFriendlyErrorMessage("passwords do not match", "signup");
      setFormError(message);
      toast({ title: getFriendlyErrorTitle(message, "signup"), description: message, variant: "destructive" });
      return;
    }
    if (isRegister && password.length < MIN_PASSWORD_LENGTH) {
      const message = getFriendlyErrorMessage("weak password", "signup");
      setFormError(message);
      toast({ title: getFriendlyErrorTitle(message, "signup"), description: message, variant: "destructive" });
      return;
    }
    if (isRegister && usernameStatus !== "available") {
      setFormError("Please choose a valid and unique username.");
      return;
    }

    setSubmitting(true);
    const redirect = searchParams.get("redirect") || undefined;
    try {
      if (isLogin) {
        const result = await signIn(email, password);
        if (result.error) throw result.error;
        navigate(redirect || "/dashboard", { replace: true });
        return;
      }

      const purpose = isRegister ? "signup_verify" : "reset_password";
      const { error } = await supabase.functions.invoke("send-auth-otp", {
        body: isRegister
          ? { purpose, email, password, fullName, username }
          : { purpose, email },
      });
      if (error) throw error;

      if (isRegister) safeStorage.setItem(SIGNUP_PASSWORD_KEY, password);
      toast({
        title: isRegister ? "Verification code sent" : "Check your email",
        description: isRegister ? "Enter the 6-digit code to verify your account." : "If this email is registered, we'll send a verification code.",
      });
      const params = new URLSearchParams({ purpose, email });
      if (redirect) params.set("redirect", redirect);
      navigate(`/verify-otp?${params.toString()}`, { replace: true });
    } catch (error) {
      console.error("OTP auth form error", error);
      const context = isLogin ? "auth" : isRegister ? "signup" : "password_reset";
      const message = getFriendlyErrorMessage(error, context);
      setFormError(message);
      toast({ title: getFriendlyErrorTitle(error, context), description: message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-[#f4efff] px-4 py-5 text-[#171445] sm:px-6 sm:py-7">
      <div className="pointer-events-none absolute left-[-5rem] top-[18%] hidden h-40 w-56 rotate-[-32deg] rounded-[2rem] bg-[#d8c9ff]/45 blur-[1px] sm:block" />
      <div className="pointer-events-none absolute left-[-2.5rem] top-[27%] hidden h-24 w-44 rotate-[-32deg] rounded-[1.5rem] bg-white/35 sm:block" />
      <div className="pointer-events-none absolute right-[-4.5rem] top-[58%] hidden h-36 w-48 rotate-[-32deg] rounded-[2rem] bg-[#d8c9ff]/45 sm:block" />
      <div className="pointer-events-none absolute right-10 top-14 hidden h-24 w-24 bg-[radial-gradient(circle,#bba7f4_1.5px,transparent_1.5px)] [background-size:13px_13px] opacity-70 sm:block" />
      <div className="pointer-events-none absolute bottom-10 left-8 hidden h-24 w-24 bg-[radial-gradient(circle,#bba7f4_1.5px,transparent_1.5px)] [background-size:13px_13px] opacity-70 sm:block" />

      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-2.5rem)] w-full max-w-[392px] flex-col items-center justify-center sm:min-h-[calc(100vh-3.5rem)]">
        <header className="text-center">
          <Link to="/" className="block h-[116px] overflow-hidden sm:h-[132px]" aria-label="Spendova home">
            <picture>
              <source media="(max-width: 640px)" srcSet={AUTH_BRAND_IMAGE_MOBILE} type="image/webp" />
              <source media="(max-width: 1024px)" srcSet={AUTH_BRAND_IMAGE_TABLET} type="image/webp" />
              <source srcSet={AUTH_BRAND_IMAGE_DESKTOP} type="image/webp" />
              <img
                src={AUTH_BRAND_IMAGE}
                alt="Spendova"
                width="400"
                height="267"
                loading="eager"
                decoding="async"
                fetchPriority="high"
                className="h-auto w-[19rem] max-w-none -translate-y-[48px] min-[380px]:w-[21rem] min-[380px]:-translate-y-[52px] sm:w-[24rem] sm:-translate-y-[58px]"
              />
            </picture>
          </Link>
        </header>

        <section className="mt-3 w-full rounded-[1.35rem] border border-white/80 bg-white/78 p-5 shadow-[0_22px_36px_rgba(76,61,130,0.18)] backdrop-blur-xl min-[380px]:p-7 sm:mt-4 sm:p-8">
          <div className="mb-4 border-b border-[#ddd3f6] pb-4 text-left">
            <p className="text-[0.68rem] font-bold uppercase tracking-[0.22em] text-[#6e6295]">Spendova account</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#0d0b35] sm:text-[1.7rem]">{heading}</h1>
            <p className="mt-2 text-sm leading-6 text-[#6d638e]">{description}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegister && <TextField label="Full name" value={fullName} onChange={setFullName} placeholder="Enter full name" icon={UserRound} />}
            {isRegister && (
              <div>
                <TextField label="Username" value={username} onChange={(value) => setUsername(value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} placeholder="Choose username" icon={User} />
                {username && <p className={`mt-2 text-xs font-semibold ${usernameStatus === "available" ? "text-success" : usernameStatus === "checking" ? "text-muted-foreground" : "text-destructive"}`}>{usernameStatus === "available" ? "Username is available" : usernameStatus === "checking" ? "Checking username..." : "Username must be unique and at least 3 characters"}</p>}
              </div>
            )}
            {!isReset && <TextField label={isLogin ? "Email or username" : "Email"} value={email} onChange={setEmail} placeholder={isLogin ? "Enter email or username" : "Enter email address"} type={isLogin ? "text" : "email"} icon={isLogin ? User : Mail} />}
            {isReset && <TextField label="Email" value={email} onChange={setEmail} placeholder="Enter email address" type="email" icon={Mail} />}
            {!isForgot && !isReset && <PasswordField label="Password" value={password} onChange={setPassword} placeholder="Enter password" />}
            {isRegister && <PasswordField label="Confirm password" value={confirmPassword} onChange={setConfirmPassword} placeholder="Confirm password" />}

            {isLogin && (
              <div className="flex justify-end">
                <Link to="/forgot-password" className="text-sm font-semibold text-[#6d28d9]">Forgot password?</Link>
              </div>
            )}

            {formError && <p className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">{formError}</p>}

            <Button type="submit" disabled={submitting || (isRegister && usernameStatus !== "available")} className="h-12 w-full rounded-xl bg-[linear-gradient(135deg,#7c3aed,#6d28d9)] text-white shadow-[0_14px_24px_rgba(109,40,217,0.26)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60">
              <LogIn className="size-4" strokeWidth={2} />
              {buttonLabel}
            </Button>
          </form>

          <div className="mt-4 flex items-center gap-3 text-xs font-medium text-[#81769f]">
            <span className="h-px flex-1 bg-[#ddd3f6]" />
            <span>or</span>
            <span className="h-px flex-1 bg-[#ddd3f6]" />
          </div>

          <div className="mt-3 text-center text-sm font-medium text-[#6d638e]">
            {isLogin ? (
              <>New to Spendova? <Link to={registerLink} className="font-semibold text-[#6d28d9]">Create account</Link></>
            ) : (
              <>Already have access? <Link to={loginLink} className="font-semibold text-[#6d28d9]">Login</Link></>
            )}
          </div>
        </section>

        <footer className="mt-5 space-y-3 text-center">
          <p className="inline-flex items-center justify-center gap-2 text-sm font-medium text-[#6d638e]">
            <ShieldCheck className="size-4 text-[#7c3aed]" strokeWidth={1.8} />
            Secure login. Encrypted data.
          </p>
          <p className="text-xs font-medium text-[#766b96]">© 2026 Spendova. All rights reserved.</p>
        </footer>
      </div>
    </main>
  );
};

export default Auth;
