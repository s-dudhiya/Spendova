import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const safeRedirect = (value: string | null) => {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
};

export default function AuthCallback() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const [message, setMessage] = useState("Confirming your Spendova session...");

  useEffect(() => {
    let active = true;

    const handleCallback = async () => {
      try {
        const code = searchParams.get("code");
        const tokenHash = searchParams.get("token_hash");
        const type = searchParams.get("type");
        const redirectTo = safeRedirect(searchParams.get("redirect"));

        if (code) {
          setMessage("Securing your session...");
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (tokenHash && type) {
          setMessage("Verifying your email link...");
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: type as "signup" | "invite" | "magiclink" | "recovery" | "email_change",
          });
          if (error) throw error;
        } else {
          setMessage("Loading your account...");
          const { error } = await supabase.auth.getSession();
          if (error) throw error;
        }

        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!active) return;

        if (type === "recovery") {
          navigate("/reset-password", { replace: true });
          return;
        }

        if (!session) {
          toast({ title: "Email verified", description: "Please sign in to continue." });
          navigate("/login", { replace: true });
          return;
        }

        const pendingInvite = localStorage.getItem("pending_invite_token");
        if (pendingInvite) {
          navigate(`/accept-invite?token=${pendingInvite}`, { replace: true });
          return;
        }

        toast({ title: "Account confirmed", description: "You're signed in and ready to go." });
        navigate(redirectTo, { replace: true });
      } catch (error) {
        console.error("Supabase auth callback error", error);
        if (!active) return;
        toast({
          title: "Email link failed",
          description: error instanceof Error ? error.message : "The link is invalid or expired.",
          variant: "destructive",
        });
        navigate("/login", { replace: true });
      }
    };

    handleCallback();

    return () => {
      active = false;
    };
  }, [navigate, searchParams, toast]);

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4 text-foreground">
      <section className="w-full max-w-sm rounded-[1.25rem] bg-card p-6 text-center shadow-panel">
        <div className="mx-auto grid size-14 place-items-center rounded-full bg-primary/10 text-primary">
          <ShieldCheck className="size-7" />
        </div>
        <h1 className="mt-4 text-xl font-bold">Spendova Auth</h1>
        <p className="mt-2 text-sm font-medium text-muted-foreground">{message}</p>
        <Loader2 className="mx-auto mt-5 size-5 animate-spin text-primary" />
      </section>
    </main>
  );
}
