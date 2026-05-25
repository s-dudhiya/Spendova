import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

const AUTH_BRAND_IMAGE = "/brand/login-branding-image.png";
const SIGNUP_PASSWORD_KEY = "spendova_pending_signup_password";
const OTP_LENGTH = 6;
const OTP_TTL_SECONDS = 10 * 60;
const RESEND_SECONDS = 60;

type OtpPurpose = "signup_verify" | "reset_password";

const PasswordField = ({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) => {
  const [visible, setVisible] = useState(false);
  return (
    <label className="block text-sm font-semibold text-[#11103a]">
      {label}
      <span className="mt-2 flex h-[42px] items-center gap-3 rounded-xl border border-[#cbbdff] bg-[#f4f0ff] px-3.5 text-[#6b5f91] shadow-[inset_0_1px_2px_rgba(113,70,220,0.08)] transition focus-within:border-[#7c3aed] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#8b5cf6]/20 sm:h-12 sm:px-4">
        <LockKeyhole className="size-4 shrink-0 text-[#7c3aed]" strokeWidth={1.8} />
        <input required type={visible ? "text" : "password"} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="min-w-0 flex-1 bg-transparent text-sm font-medium text-[#171445] outline-none placeholder:text-[#7c719c]" />
        <button type="button" onClick={() => setVisible((current) => !current)} className="text-[#7c3aed]" aria-label={visible ? "Hide password" : "Show password"}>
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </span>
    </label>
  );
};

const formatTimer = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
};

export default function VerifyOtp() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { signIn } = useAuth();
  const email = (searchParams.get("email") || "").trim().toLowerCase();
  const purpose = searchParams.get("purpose") as OtpPurpose | null;
  const redirect = searchParams.get("redirect") || "/dashboard";
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [secondsLeft, setSecondsLeft] = useState(OTP_TTL_SECONDS);
  const [cooldown, setCooldown] = useState(RESEND_SECONDS);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState("");
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
  const otp = useMemo(() => digits.join(""), [digits]);
  const isReset = purpose === "reset_password";

  useEffect(() => {
    const timer = window.setInterval(() => setSecondsLeft((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  if (!email || !purpose || !["signup_verify", "reset_password"].includes(purpose)) {
    return <Navigate to="/login" replace />;
  }

  const setOtpFromString = (value: string) => {
    const clean = value.replace(/\D/g, "").slice(0, OTP_LENGTH);
    const next = Array(OTP_LENGTH).fill("");
    clean.split("").forEach((digit, index) => { next[index] = digit; });
    setDigits(next);
    inputsRef.current[Math.min(clean.length, OTP_LENGTH - 1)]?.focus();
  };

  const handleDigitChange = (index: number, value: string) => {
    const clean = value.replace(/\D/g, "");
    if (clean.length > 1) {
      setOtpFromString(clean);
      return;
    }
    setDigits((current) => current.map((digit, itemIndex) => itemIndex === index ? clean : digit));
    if (clean && index < OTP_LENGTH - 1) inputsRef.current[index + 1]?.focus();
  };

  const handleKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace" && !digits[index] && index > 0) inputsRef.current[index - 1]?.focus();
  };

  const verifyOtp = async () => {
    setFormError("");
    if (otp.length !== OTP_LENGTH) {
      setFormError("Enter the 6-digit code.");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("verify-auth-otp", { body: { email, purpose, otp } });
      if (error) throw error;
      if (isReset) {
        setResetToken(data.resetToken);
        toast({ title: "Code verified", description: "Set your new password." });
        return;
      }

      toast({ title: "Email verified", description: "Your Spendova account is ready." });
      const signupPassword = sessionStorage.getItem(SIGNUP_PASSWORD_KEY);
      if (signupPassword) {
        sessionStorage.removeItem(SIGNUP_PASSWORD_KEY);
        const result = await signIn(email, signupPassword);
        if (!result.error) {
          navigate(redirect, { replace: true });
          return;
        }
      }
      navigate("/login", { replace: true });
    } catch (error) {
      console.error("OTP verification failed", error);
      setFormError(error instanceof Error ? error.message : "Invalid or expired code.");
    } finally {
      setSubmitting(false);
    }
  };

  const resendOtp = async () => {
    if (cooldown > 0 || resending) return;
    setResending(true);
    setFormError("");
    try {
      const { error } = await supabase.functions.invoke("send-auth-otp", { body: { email, purpose } });
      if (error) throw error;
      setSecondsLeft(OTP_TTL_SECONDS);
      setCooldown(RESEND_SECONDS);
      setDigits(Array(OTP_LENGTH).fill(""));
      inputsRef.current[0]?.focus();
      toast({ title: "Code sent", description: isReset ? "If this email is registered, we'll send a verification code." : "Check your email for a new code." });
    } catch (error) {
      console.error("OTP resend failed", error);
      setFormError("Could not resend code. Please try again later.");
    } finally {
      setResending(false);
    }
  };

  const updatePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError("");
    if (newPassword !== confirmPassword) {
      setFormError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.functions.invoke("reset-password-with-otp", { body: { email, resetToken, password: newPassword } });
      if (error) throw error;
      toast({ title: "Password updated", description: "Please sign in with your new password." });
      navigate("/login", { replace: true });
    } catch (error) {
      console.error("OTP password reset failed", error);
      setFormError(error instanceof Error ? error.message : "Could not update password.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-[#f4efff] px-4 py-5 text-[#171445] sm:px-6 sm:py-7">
      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-2.5rem)] w-full max-w-[392px] flex-col items-center justify-center sm:min-h-[calc(100vh-3.5rem)]">
        <header className="text-center">
          <Link to="/" className="block h-[116px] overflow-hidden sm:h-[132px]" aria-label="Spendova home">
            <img src={AUTH_BRAND_IMAGE} alt="Spendova" className="h-auto w-[21rem] max-w-none -translate-y-[52px] sm:w-[24rem] sm:-translate-y-[58px]" />
          </Link>
        </header>

        <section className="mt-3 w-full rounded-[1.35rem] border border-white/80 bg-white/78 p-7 shadow-[0_22px_36px_rgba(76,61,130,0.18)] backdrop-blur-xl sm:mt-4 sm:p-8">
          <div className="mb-4 border-b border-[#ddd3f6] pb-4 text-left">
            <p className="text-[0.68rem] font-bold uppercase tracking-[0.22em] text-[#6e6295]">Spendova account</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#0d0b35]">{resetToken ? "Set new password" : "Verify your email"}</h1>
            <p className="mt-2 flex items-center gap-2 text-sm leading-6 text-[#6d638e]"><Mail className="size-4" />{email}</p>
          </div>

          {!resetToken ? (
            <div className="space-y-4">
              <div className="flex w-full flex-nowrap items-center justify-center gap-1.5 overflow-hidden sm:gap-2.5 md:gap-3">
                {digits.map((digit, index) => (
                  <input
                    key={index}
                    ref={(node) => { inputsRef.current[index] = node; }}
                    value={digit}
                    inputMode="numeric"
                    maxLength={1}
                    onPaste={(event) => {
                      event.preventDefault();
                      setOtpFromString(event.clipboardData.getData("text"));
                    }}
                    onKeyDown={(event) => handleKeyDown(index, event)}
                    onChange={(event) => handleDigitChange(index, event.target.value)}
                    className="box-border aspect-square h-[calc((100vw-60px)/6)] min-h-9 w-[calc((100vw-60px)/6)] min-w-9 max-w-[42px] flex-shrink rounded-xl border border-[#cbbdff] bg-[#f4f0ff] text-center text-base font-black text-[#171445] outline-none focus:border-[#7c3aed] focus:bg-white focus:ring-2 focus:ring-[#8b5cf6]/20 sm:h-12 sm:min-h-12 sm:w-12 sm:min-w-12 sm:max-w-12 sm:text-xl md:h-14 md:min-h-14 md:w-14 md:min-w-14 md:max-w-14"
                  />
                ))}
              </div>
              <p className="text-center text-xs font-semibold text-[#6d638e]">Code expires in {formatTimer(secondsLeft)}</p>
              {formError && <p className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">{formError}</p>}
              <Button onClick={verifyOtp} disabled={submitting || otp.length !== OTP_LENGTH || secondsLeft === 0} className="h-12 w-full rounded-xl bg-[#7c3aed] text-white shadow-[0_14px_24px_rgba(109,40,217,0.22)] hover:bg-[#6d28d9]">
                {submitting ? "Verifying..." : "Verify"}
              </Button>
              <Button type="button" variant="quiet" onClick={resendOtp} disabled={cooldown > 0 || resending} className="h-11 w-full rounded-xl">
                {resending ? "Sending..." : cooldown > 0 ? `Resend OTP in ${cooldown}s` : "Resend OTP"}
              </Button>
            </div>
          ) : (
            <form onSubmit={updatePassword} className="space-y-4">
              <PasswordField label="New password" value={newPassword} onChange={setNewPassword} placeholder="Enter new password" />
              <PasswordField label="Confirm password" value={confirmPassword} onChange={setConfirmPassword} placeholder="Confirm password" />
              {formError && <p className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">{formError}</p>}
              <Button type="submit" disabled={submitting || !newPassword || !confirmPassword} className="h-12 w-full rounded-xl bg-[#7c3aed] text-white shadow-[0_14px_24px_rgba(109,40,217,0.22)] hover:bg-[#6d28d9]">
                {submitting ? "Updating..." : "Update password"}
              </Button>
            </form>
          )}
        </section>

        <footer className="mt-5 space-y-3 text-center">
          <p className="inline-flex items-center justify-center gap-2 text-sm font-medium text-[#6d638e]">
            <ShieldCheck className="size-4 text-[#7c3aed]" />
            Secure login. Encrypted data.
          </p>
        </footer>
      </div>
    </main>
  );
}
