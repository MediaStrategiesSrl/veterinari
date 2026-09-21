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

    const { userId, type, values } = await req.json();
    if (!userId || !type || !values) {
      return new Response(JSON.stringify({ error: "Dati mancanti." }), { headers: corsHeaders, status: 400 });
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

    // 1. Aggiorna il profilo
    const profileData: Record<string, unknown> = {
      nome: values.nome,
      cognome: values.cognome,
      email: values.email,
      telefono: values.telefono || "",
      citta: values.citta || "",
    };

    if (values.data_nascita !== undefined) profileData.data_nascita = values.data_nascita || null;
    if (values.indirizzo !== undefined) profileData.indirizzo = values.indirizzo || null;
    if (values.cap !== undefined) profileData.cap = values.cap || null;

    const { error: profileErr } = await admin
      .from("profiles").update(profileData).eq("id", userId);
    if (profileErr) {
      throw new Error(`Errore aggiornamento profilo: ${profileErr.message}`);
    }

    // Aggiorna email auth se cambiata
    if (values.email) {
      const { error: emailErr } = await admin.auth.admin.updateUserById(userId, {
        email: values.email,
        user_metadata: { nome: values.nome, cognome: values.cognome },
      });
      if (emailErr) {
        console.error("Profilo aggiornato, ma email auth non aggiornata:", emailErr.message);
      }
    }

    // 2. Aggiorna la tabella correlata
    if (type === "vet") {
      const { error } = await admin.from("veterinarians").update({
        numero_ordine: values.numero_ordine,
      }).eq("user_id", userId);
      if (error) throw new Error(`Errore aggiornamento veterinario: ${error.message}`);
    } else if (type === "professional") {
      const { error } = await admin.from("professionals").update({
        tipo_professione: values.tipo_professione,
        tariffa_oraria: values.tariffa_oraria ? Number(values.tariffa_oraria) : null,
      }).eq("user_id", userId);
      if (error) throw new Error(`Errore aggiornamento professionista: ${error.message}`);
    } else if (type === "sponsor") {
      const { error } = await admin.from("sponsors").update({
        nome_azienda: values.nome_azienda,
        partita_iva: values.partita_iva,
      }).eq("user_id", userId);
      if (error) throw new Error(`Errore aggiornamento sponsor: ${error.message}`);
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
