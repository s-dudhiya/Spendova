// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { isMaintenance, password } = await req.json();

    // Verify the hardcoded frontend password (same as in Admin.tsx)
    // Note: In a production environment with proper auth, we would use Supabase JWT tokens.
    // For this specific portal implementation, we authorize based on this secure shared secret.
    if (password !== 'exp_admin_2026') {
      return new Response(JSON.stringify({ error: "Unauthorized access" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Initialize Supabase admin client to bypass RLS
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        }
      }
    );

    // Update the site settings table
    const { error: updateError } = await supabaseClient
      .from("site_settings")
      .upsert({
        id: 1,
        is_maintenance_mode: isMaintenance,
        updated_at: new Date().toISOString()
      });

    if (updateError) {
      throw updateError;
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Maintenance mode successfully set to ${isMaintenance}`
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error: any) {
    console.error("Error toggling maintenance:", error);
    return new Response(
      JSON.stringify({ error: error.message || "An unexpected error occurred" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
