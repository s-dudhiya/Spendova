import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Check, Loader2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { getFriendlyErrorMessage } from "@/lib/friendly-error";
import { safeStorage, withTimeout } from "@/lib/startup-safety";
import { getLedgerIcon } from "./components/LedgerIcon";

type InviteStatus = "loading" | "ready" | "accepting" | "done" | "error";

type LedgerInvite = {
  status: string;
  expires_at?: string | null;
  ledger_id: string;
  ledgers?: {
    id: string;
    name: string;
    icon?: string | null;
  } | null;
};

export default function InviteLedgerAccept() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || safeStorage.getItem("pending_ledger_invite_token");
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [invite, setInvite] = useState<LedgerInvite | null>(null);
  const [status, setStatus] = useState<InviteStatus>("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setError("Invalid invite link.");
      return;
    }

    const loadInvite = async () => {
      const { data, error: loadError } = (await withTimeout(
        (supabase.from("ledger_invites" as never) as any)
          .select("status, expires_at, ledger_id, ledgers(id, name, icon)")
          .eq("token", token)
          .maybeSingle(),
        8000,
        "invite lookup"
      )) as any;

      const loadedInvite = data as unknown as LedgerInvite | undefined;
      
      if (loadError || !loadedInvite) {
        setStatus("error");
        setError("Invite not found, expired, or already used.");
        return;
      }

      if (loadedInvite.status !== "pending") {
        setStatus("error");
        setError(`This invite has already been ${loadedInvite.status}.`);
        return;
      }
      if (loadedInvite.expires_at && new Date(loadedInvite.expires_at).getTime() <= Date.now()) {
        setStatus("error");
        setError("This invite has expired.");
        return;
      }

      setInvite(loadedInvite);
      setStatus("ready");
    };

    loadInvite();
  }, [token]);

  useEffect(() => {
    if (status !== "ready" || !user || !invite || !token) return;

    const acceptInvite = async () => {
      setStatus("accepting");
      try {
        const { error: acceptError } = await supabase.rpc("accept_ledger_invite" as never, { p_token: token } as never);
        if (acceptError) throw acceptError;
        safeStorage.removeItem("pending_ledger_invite_token");
        setStatus("done");
        toast({ title: `Welcome to ${invite.ledgers?.name || "the ledger"}!`, description: "You've been added successfully." });
        window.setTimeout(() => navigate(`/ledger/${invite.ledger_id}`), 1400);
      } catch (acceptError) {
        setStatus("error");
        const message = getFriendlyErrorMessage(acceptError, "invite");
        setError(message);
        toast({ title: "Could not accept invite", description: message, variant: "destructive" });
      }
    };

    acceptInvite();
  }, [status, user, invite, token, navigate, toast]);

  if (authLoading || status === "loading" || status === "accepting") {
    return (
      <InviteShell>
        <Loader2 className="mx-auto size-8 animate-spin text-primary" />
        <p className="mt-3 text-sm font-semibold text-muted-foreground">
          {status === "accepting" ? "Joining ledger..." : "Loading invite..."}
        </p>
      </InviteShell>
    );
  }

  if (status === "error") {
    return (
      <InviteShell>
        <Users className="mx-auto size-10 text-muted-foreground" />
        <h1 className="mt-4 text-2xl font-bold text-foreground">Invite unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        <Button className="mt-6 rounded-full" onClick={() => navigate("/dashboard")}>
          Go to Spendova
        </Button>
      </InviteShell>
    );
  }

  if (status === "done") {
    return (
      <InviteShell>
        <div className="mx-auto grid size-16 place-items-center rounded-3xl bg-success/15">
          <Check className="size-8 text-success" />
        </div>
        <h1 className="mt-4 text-2xl font-bold text-foreground">You're in</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Added to {invite?.ledgers?.name || "the ledger"}. Redirecting...
        </p>
      </InviteShell>
    );
  }

  const ActiveIcon = getLedgerIcon(invite?.ledgers?.icon);

  return (
    <InviteShell>
      <div className="mx-auto grid size-16 place-items-center rounded-3xl bg-primary/10 text-primary">
        <ActiveIcon className="size-8" />
      </div>
      <h1 className="mt-4 text-2xl font-bold text-foreground">{invite?.ledgers?.name || "Ledger invite"}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Sign in or create an account to accept this Spendova ledger invite.
      </p>
      <div className="mt-6 space-y-3">
        <Button className="w-full rounded-full" onClick={() => {
          if (token) safeStorage.setItem("pending_ledger_invite_token", token);
          navigate(`/login?redirect=/invite-ledger?token=${token}`);
        }}>
          Login to accept
        </Button>
        <Button variant="quiet" className="w-full rounded-full" onClick={() => {
          if (token) safeStorage.setItem("pending_ledger_invite_token", token);
          navigate(`/register?redirect=/invite-ledger?token=${token}`);
        }}>
          Create account
        </Button>
      </div>
    </InviteShell>
  );
}

const InviteShell = ({ children }: { children: React.ReactNode }) => (
  <main className="grid min-h-screen place-items-center bg-background px-6 text-center text-foreground">
    <section className="w-full max-w-sm rounded-[1.5rem] bg-card p-6 shadow-panel">
      {children}
    </section>
  </main>
);
