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
    const resendApiKey = Deno.env.get("RESEND_API_KEY")!;

    const admin = createClient(supabaseUrl, serviceKey);

    // Verifica che la richiesta provenga da un admin autenticato
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

    // Verifica che l'utente sia admin
    const { data: userRoles, error: urErr } = await admin
      .from("user_roles")
      .select("role_id")
      .eq("user_id", user.id);

    if (urErr) {
      throw new Error(`Errore verifica ruoli: ${urErr.message}`);
    }

    if (!userRoles || userRoles.length === 0) {
      return new Response(
        JSON.stringify({ error: "Non autorizzato: nessun ruolo assegnato." }),
        { headers: corsHeaders, status: 403 }
      );
    }

    const roleIds = userRoles.map((r: { role_id: number }) => r.role_id);
    const { data: roles, error: rErr } = await admin
      .from("roles")
      .select("nome")
      .in("id", roleIds);

    if (rErr) {
      throw new Error(`Errore verifica ruoli: ${rErr.message}`);
    }

    const hasAdmin = (roles ?? []).some((r: { nome: string }) => r.nome === "admin");

    if (!hasAdmin) {
      return new Response(
        JSON.stringify({ error: "Non autorizzato: ruolo admin non trovato." }),
        { headers: corsHeaders, status: 403 }
      );
    }

    const body = await req.json();
    const { type, values } = body;

    if (!type || !values || typeof values !== "object") {
      return new Response(JSON.stringify({ error: "Dati mancanti." }), { headers: corsHeaders, status: 400 });
    }

    // 1. Crea l'utente auth con una password temporanea
    const tempPassword = crypto.randomUUID().replace(/-/g, "").slice(0, 12) + "A1!";

    const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
      email: values.email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        nome: values.nome,
        cognome: values.cognome,
      },
    });

    if (createErr) {
      throw new Error(`Errore creazione utente: ${createErr.message}`);
    }

    const userId = newUser.user.id;

    // 2. Inserisci il profilo
    const profileData: Record<string, unknown> = {
      id: userId,
      nome: values.nome,
      cognome: values.cognome,
      email: values.email,
      telefono: values.telefono || "",
      citta: values.citta || "",
      email_notifications_enabled: false,
      created_via: "admin",
    };

    if (values.data_nascita) profileData.data_nascita = values.data_nascita;
    if (values.indirizzo) profileData.indirizzo = values.indirizzo;
    if (values.cap) profileData.cap = values.cap;

    const { error: profileErr } = await admin.from("profiles").insert(profileData);
    if (profileErr) {
      await admin.auth.admin.deleteUser(userId);
      throw new Error(`Errore creazione profilo: ${profileErr.message}`);
    }

    // 3. Inserisci la tabella correlata
    let ruoloLabel = "utente";
    if (type === "vet") {
      ruoloLabel = "veterinario";
      const { error } = await admin.from("veterinarians").insert({
        user_id: userId,
        numero_ordine: values.numero_ordine,
        is_available_now: false,
        is_approved: false,
      });
      if (error) {
        await admin.auth.admin.deleteUser(userId);
        throw new Error(`Errore creazione veterinario: ${error.message}`);
      }
    } else if (type === "professional") {
      ruoloLabel = "professionista";
      const { error } = await admin.from("professionals").insert({
        user_id: userId,
        tipo_professione: values.tipo_professione,
        tariffa_oraria: values.tariffa_oraria ? Number(values.tariffa_oraria) : null,
      });
      if (error) {
        await admin.auth.admin.deleteUser(userId);
        throw new Error(`Errore creazione professionista: ${error.message}`);
      }
    } else if (type === "sponsor") {
      ruoloLabel = "sponsor";
      const { error } = await admin.from("sponsors").insert({
        user_id: userId,
        nome_azienda: values.nome_azienda,
        partita_iva: values.partita_iva,
        is_approved: false,
      });
      if (error) {
        await admin.auth.admin.deleteUser(userId);
        throw new Error(`Errore creazione sponsor: ${error.message}`);
      }
    }

    // 4. Invia email con credenziali temporanee
    const nomeCompleto = `${values.nome} ${values.cognome}`.trim();
    const html = `
      <div style="font-family: Inter, Arial, sans-serif; max-width:600px; margin:auto; border:1px solid #e2e8f0; border-radius:16px; overflow:hidden;">
        <div style="background:#db761b; padding:24px; text-align:center;">
          <h2 style="margin:0; color:white;">Benvenuto su Veterinari.it</h2>
        </div>
        <div style="padding:30px; color:#1e293b; line-height:1.6;">
          <p>Ciao <strong>${escHtml(nomeCompleto)}</strong>,</p>
          <p>è stato creato il tuo account <strong>${escHtml(ruoloLabel)}</strong> su Veterinari.it.</p>
          <p>Puoi accedere utilizzando le seguenti credenziali:</p>
          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:16px; margin:16px 0;">
            <p style="margin:4px 0;"><strong>Email:</strong> ${escHtml(values.email)}</p>
            <p style="margin:4px 0;"><strong>Password temporanea:</strong> <code style="background:#fef3c7; padding:2px 6px; border-radius:4px; font-size:14px;">${escHtml(tempPassword)}</code></p>
          </div>
          <p style="color:#dc2626; font-size:13px;">Ti consigliamo di cambiare password al primo accesso.</p>
          <hr style="border:0; border-top:1px solid #e2e8f0; margin:28px 0;">
          <p style="font-size:13px; color:#64748b; text-align:center;">Il team di Veterinari.it</p>
        </div>
      </div>`;

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: "Veterinari.it <onboarding@resend.dev>",
        to: values.email,
        subject: `Credenziali di accesso - Veterinari.it`,
        html,
      }),
    });

    if (!emailRes.ok) {
      console.error("Email non inviata:", await emailRes.text());
    }

    return new Response(
      JSON.stringify({ success: true, userId, tempPassword }),
      { headers: corsHeaders, status: 200 }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: corsHeaders, status: 400 }
    );
  }
});

function escHtml(s: string): string {
  return String(s ?? "").replace(/[&<>"']/g, (m) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m])
  );
}
