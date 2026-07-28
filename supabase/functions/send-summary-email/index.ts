// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts";

// Configurazione CORS per permettere la chiamata dal tuo frontend JS
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export default {
  async fetch(req: Request) {
    // 1. Gestione della pre-flight request (CORS) inviata dal browser
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }

    try {
      // 2. Estrazione dinamica dei dati dal payload JSON inviato dal frontend
      const {
        emailProprietario,
        nomePet,
        nomeVet,
        motivo,
        anamnesi,
        diagnosi,
        terapia
      } = await req.json();

      // Validazione base
      if (!emailProprietario || !nomePet) {
        throw new Error("Campi obbligatori mancanti: email o nome paziente.");
      }

      // 3. Recupero della chiave API del provider email (es. Resend) salvata nei secrets di Supabase
      const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
      if (!RESEND_API_KEY) {
        throw new Error("Manca la chiave API di Resend configurata nei secrets.");
      }

      // 4. Costruzione del template HTML dell'email con i dati clinici
      const htmlContent = `
        <div style="font-family: Arial, sans-serif; color: #1E293B; max-width: 600px; margin: 0 auto; line-height: 1.6;">
          <h2 style="color: #0284C7; border-bottom: 2px solid #E2E8F0; padding-bottom: 10px;">Referto Veterinario: ${nomePet}</h2>
          <p>Ciao! Ecco il riepilogo dettagliato della visita effettuata con il <strong>${nomeVet}</strong>.</p>
          
          <div style="background: #F8FAFC; padding: 20px; border-radius: 12px; border: 1px solid #E2E8F0; margin: 20px 0;">
            <h3 style="color: #1E293B; margin-top: 0; font-size: 1.1rem;">Dettagli della Visita</h3>
            
            <p><strong>Motivo della consultazione:</strong><br>
            <span style="color: #475569;">${motivo || 'Non specificato'}</span></p>
            
            <p><strong>Anamnesi (Storia clinica):</strong><br>
            <span style="color: #475569;">${anamnesi || 'Nessuna nota aggiuntiva'}</span></p>
            
            <p><strong>Diagnosi:</strong><br>
            <span style="color: #475569;">${diagnosi || 'In attesa di refertazione'}</span></p>
            
            <div style="background: #FFFBEB; padding: 15px; border-left: 4px solid #F58220; margin-top: 20px; border-radius: 0 8px 8px 0;">
              <h4 style="margin-top: 0; color: #B45309;">Terapia Prescritta:</h4>
              <p style="margin-bottom: 0; white-space: pre-wrap; color: #78350F;">${terapia || 'Nessuna terapia farmacologica prescritta al momento.'}</p>
            </div>
          </div>
          
          <p style="font-size: 0.9em; color: #64748B; margin-top: 30px;">
            Puoi consultare la cartella clinica completa accedendo all'app <a href="https://test.app.veterinari.it" style="color: #F58220; text-decoration: none; font-weight: bold;">test.app.veterinari.it</a>.
          </p>
        </div>
      `;

      // 5. Chiamata API diretta al provider per spedire l'email
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${RESEND_API_KEY}`
        },
        body: JSON.stringify({
          from: 'VeterinariApp <onboarding@resend.dev>', // Assicurati che il dominio sia verificato su Resend
          to: [emailProprietario],
          subject: `Esito visita veterinaria per ${nomePet}`,
          html: htmlContent
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Errore durante l'invio dell'email via provider");
      }

      // 6. Risposta HTTP 200 al frontend
      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });

    } catch (error) {
      // 7. Intercettazione e risposta errori HTTP 400
      return new Response(JSON.stringify({ success: false, error: error.message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }
  }
};