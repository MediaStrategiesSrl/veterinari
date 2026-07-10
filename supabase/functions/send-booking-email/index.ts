// supabase/functions/send-booking-email/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const resendApiKey = Deno.env.get('RESEND_API_KEY')

serve(async (req) => {
  // Configurazione CORS per permettere alla tua app web di chiamare questa funzione
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
  if (req.method === 'OPTIONS') return new Response('ok', { headers })

  try {
    // 1. Riceviamo i dati dal tuo JavaScript (Frontend)
    const { emailProprietario, emailProfessionista, nomeAnimale, nomeProfessionista, dataVisita, noteAggiuntive } = await req.json()

    // 2. Prepariamo la MAIL PER IL PROPRIETARIO (Calda e accogliente)
    const htmlProprietario = `
      <div style="font-family: sans-serif; color: #1E293B; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #F58220;">Prenotazione Confermata! 🎉</h2>
        <p>Ciao! La tua visita per <strong>${nomeAnimale}</strong> è stata confermata.</p>
        <div style="background: #F8FAFC; padding: 15px; border-radius: 10px; margin: 20px 0;">
          <p><strong>Dottore/Professionista:</strong> ${nomeProfessionista}</p>
          <p><strong>Data e Ora:</strong> ${dataVisita}</p>
          ${noteAggiuntive ? `<p><strong>Note del medico:</strong> <em>"${noteAggiuntive}"</em></p>` : ''}
        </div>
        <p>A presto!</p>
      </div>
    `;

    // 3. Prepariamo la MAIL PER IL PROFESSIONISTA (Professionale e schematica)
    const htmlProfessionista = `
      <div style="font-family: sans-serif; color: #1E293B; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #3B82F6;">Nuovo Appuntamento in Agenda 📅</h2>
        <p>Gentile ${nomeProfessionista}, hai ricevuto una nuova prenotazione.</p>
        <div style="background: #F1F5F9; padding: 15px; border-radius: 10px; margin: 20px 0;">
          <p><strong>Paziente:</strong> ${nomeAnimale}</p>
          <p><strong>Data e Ora:</strong> ${dataVisita}</p>
          <p><strong>Email Cliente:</strong> ${emailProprietario}</p>
        </div>
      </div>
    `;

    // 4. Inviamo la mail al Proprietario tramite Resend
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendApiKey}` },
      body: JSON.stringify({
        from: 'VeterinariApp <onboarding@resend.dev>', // Usa questo indirizzo di test per ora
        to: emailProprietario,
        subject: `Conferma Visita per ${nomeAnimale}`,
        html: htmlProprietario,
      }),
    })

    // 5. Inviamo la mail al Professionista tramite Resend
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendApiKey}` },
      body: JSON.stringify({
        from: 'VeterinariApp <onboarding@resend.dev>',
        to: emailProfessionista,
        subject: `Nuovo appuntamento: ${nomeAnimale}`,
        html: htmlProfessionista,
      }),
    })

    return new Response(JSON.stringify({ success: true }), { headers: { ...headers, 'Content-Type': 'application/json' }, status: 200 })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { headers: { ...headers, 'Content-Type': 'application/json' }, status: 400 })
  }
})