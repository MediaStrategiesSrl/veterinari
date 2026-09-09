import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const admin = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");

    if (!token) {
      return new Response(JSON.stringify({ error: "Token mancante." }), { headers: corsHeaders, status: 401 });
    }

    const anonClient = createClient(supabaseUrl, anonKey);
    const { data: { user }, error: authErr } = await anonClient.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Non autenticato." }), { headers: corsHeaders, status: 401 });
    }

    // Verifica admin
    const { data: userRoles } = await admin
      .from("user_roles").select("role_id").eq("user_id", user.id);
    if (!userRoles || userRoles.length === 0) {
      return new Response(JSON.stringify({ error: "Non autorizzato." }), { headers: corsHeaders, status: 403 });
    }
    const roleIds = userRoles.map((r: { role_id: number }) => r.role_id);
    const { data: roles } = await admin
      .from("roles").select("nome").in("id", roleIds);
    if (!(roles ?? []).some((r: { nome: string }) => r.nome === "admin")) {
      return new Response(JSON.stringify({ error: "Non autorizzato." }), { headers: corsHeaders, status: 403 });
    }

    const { userId } = await req.json();
    if (!userId) {
      return new Response(JSON.stringify({ error: "userId mancante." }), { headers: corsHeaders, status: 400 });
    }

    // Verifica che il profilo sia stato creato dall'admin
    const { data: profile } = await admin
      .from("profiles").select("created_via").eq("id", userId).single();
    if (!profile || profile.created_via !== "admin") {
      return new Response(
        JSON.stringify({ error: "Questo record non è stato creato dall'admin." }),
        { headers: corsHeaders, status: 403 }
      );
    }

    // Elimina le tabelle correlate prima (FK senza CASCADE)
    await admin.from("veterinarians").delete().eq("user_id", userId);
    await admin.from("professionals").delete().eq("user_id", userId);
    await admin.from("sponsors").delete().eq("user_id", userId);
    await admin.from("error_logs").delete().eq("user_id", userId);

    // Elimina il profilo
    const { error: delProfileErr } = await admin.from("profiles").delete().eq("id", userId);
    if (delProfileErr) {
      throw new Error(`Errore eliminazione profilo: ${delProfileErr.message}`);
    }

    // Elimina l'utente auth
    const { error: delUserErr } = await admin.auth.admin.deleteUser(userId);
    if (delUserErr) {
      console.error("Profilo eliminato, ma utente auth non eliminato:", delUserErr.message);
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: corsHeaders, status: 200 }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: corsHeaders, status: 400 }
    );
  }
});
