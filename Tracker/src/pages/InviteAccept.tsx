import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Check, Loader2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

type InviteStatus = "loading" | "ready" | "accepting" | "done" | "error";

type GroupInvite = {
  group_id: string;
  invited_by: string | null;
  status: string;
  expires_at?: string | null;
  groups?: {
    id: string;
    name: string;
    emoji?: string | null;
    description?: string | null;
  } | null;
};

export default function InviteAccept() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || localStorage.getItem("pending_invite_token");
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [invite, setInvite] = useState<GroupInvite | null>(null);
  const [status, setStatus] = useState<InviteStatus>("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setError("Invalid invite link.");
      return;
    }

    const loadInvite = async () => {
      const { data, error: loadError } = await supabase
        .rpc("lookup_group_invite" as never, { invite_token: token } as never);

      const loadedInvite = Array.isArray(data) ? data[0] as unknown as GroupInvite | undefined : data as unknown as GroupInvite | undefined;
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
        await supabase.from("group_members").upsert(
          { group_id: invite.group_id, user_id: user.id },
          { onConflict: "group_id,user_id", ignoreDuplicates: true },
        );

        if (invite.invited_by && invite.invited_by !== user.id) {
          await supabase.from("connections").upsert(
            { requester_id: invite.invited_by, receiver_id: user.id, status: "accepted" },
            { onConflict: "requester_id,receiver_id", ignoreDuplicates: true },
          );
        }

        const { error: updateError } = await supabase.from("group_invites" as never).update({ status: "accepted" } as never).eq("token", token);
        if (updateError) throw updateError;
        localStorage.removeItem("pending_invite_token");
        setStatus("done");
        toast({ title: `Welcome to ${invite.groups?.name || "the group"}!`, description: "You've been added successfully." });
        window.setTimeout(() => navigate("/dashboard"), 1400);
      } catch (acceptError) {
        setStatus("error");
        setError(acceptError instanceof Error ? acceptError.message : "Could not accept invite.");
      }
    };

    acceptInvite();
  }, [status, user, invite, token, navigate, toast]);

  if (authLoading || status === "loading" || status === "accepting") {
    return <InviteShell><Loader2 className="mx-auto size-8 animate-spin text-primary" /><p className="mt-3 text-sm font-semibold text-muted-foreground">{status === "accepting" ? "Joining group..." : "Loading invite..."}</p></InviteShell>;
  }

  if (status === "error") {
    return <InviteShell><Users className="mx-auto size-10 text-muted-foreground" /><h1 className="mt-4 text-2xl font-bold text-foreground">Invite unavailable</h1><p className="mt-2 text-sm text-muted-foreground">{error}</p><Button className="mt-6 rounded-full" onClick={() => navigate("/dashboard")}>Go to Spendova</Button></InviteShell>;
  }

  if (status === "done") {
    return <InviteShell><div className="mx-auto grid size-16 place-items-center rounded-3xl bg-success/15"><Check className="size-8 text-success" /></div><h1 className="mt-4 text-2xl font-bold text-foreground">You're in</h1><p className="mt-2 text-sm text-muted-foreground">Added to {invite?.groups?.name || "the group"}. Redirecting...</p></InviteShell>;
  }

  return (
    <InviteShell>
      <div className="text-5xl">{invite?.groups?.emoji || "👥"}</div>
      <h1 className="mt-4 text-2xl font-bold text-foreground">{invite?.groups?.name || "Group invite"}</h1>
      <p className="mt-2 text-sm text-muted-foreground">Sign in or create an account to accept this Spendova group invite.</p>
      <div className="mt-6 space-y-3">
        <Button className="w-full rounded-full" onClick={() => {
          if (token) localStorage.setItem("pending_invite_token", token);
          navigate(`/login?redirect=/accept-invite?token=${token}`);
        }}>Login to accept</Button>
        <Button variant="quiet" className="w-full rounded-full" onClick={() => {
          if (token) localStorage.setItem("pending_invite_token", token);
          navigate(`/register?redirect=/accept-invite?token=${token}`);
        }}>Create account</Button>
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
