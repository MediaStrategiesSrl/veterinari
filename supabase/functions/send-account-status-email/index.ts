import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const resendApiKey = Deno.env.get("RESEND_API_KEY");

serve(async (req) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Content-Type": "application/json",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers });
  }

  try {
    const { email, nome, ruolo, isApproved } = await req.json();

    if (!email || !ruolo || typeof isApproved !== "boolean") {
      throw new Error("Dati email non validi.");
    }

    const ruoloLabel = ruolo === "veterinario"
      ? "veterinario"
      : "sponsor";

    const titolo = isApproved
      ? `Il tuo account ${ruoloLabel} è stato approvato ✅`
      : `Il tuo account ${ruoloLabel} è stato disattivato`;

    const messaggio = isApproved
      ? `
          <p>Gentile <strong>${nome || "utente"}</strong>,</p>
          <p>il tuo profilo <strong>${ruoloLabel}</strong> è stato approvato.</p>
          <p>Ora puoi accedere alle funzionalità riservate del tuo account.</p>
        `
      : `
          <p>Gentile <strong>${nome || "utente"}</strong>,</p>
          <p>il tuo profilo <strong>${ruoloLabel}</strong> è stato disattivato.</p>
          <p>Per maggiori informazioni, contatta il supporto Veterinari.it.</p>
        `;

    const html = `
      <div style="font-family: Inter, Arial, sans-serif; max-width:600px; margin:auto; border:1px solid #e2e8f0; border-radius:16px; overflow:hidden;">
        <div style="background:${isApproved ? "#16a34a" : "#dc2626"}; padding:24px; text-align:center;">
          <h2 style="margin:0; color:white;">${isApproved ? "Account approvato" : "Account disattivato"}</h2>
        </div>

        <div style="padding:30px; color:#1e293b; line-height:1.6;">
          ${messaggio}
          <hr style="border:0; border-top:1px solid #e2e8f0; margin:28px 0;">
          <p style="font-size:13px; color:#64748b; text-align:center;">
            Il team di Veterinari.it
          </p>
        </div>
      </div>
    `;

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: "VeterinariApp <onboarding@resend.dev>",
        to: email,
        subject: titolo,
        html,
      }),
    });

    if (!resendResponse.ok) {
      throw new Error(await resendResponse.text());
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers, status: 200 }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers, status: 400 }
    );
  }
});