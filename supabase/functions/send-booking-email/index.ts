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
    // ABBIAMO AGGIUNTO: luogoAppuntamento e messaggioPersonalizzato
    const { 
        emailProprietario, 
        emailProfessionista, 
        nomeAnimale, 
        nomeProfessionista, 
        dataVisita, 
        luogoAppuntamento, 
        noteAggiuntive, 
        messaggioPersonalizzato 
    } = await req.json()

    // 2. Prepariamo la MAIL PER IL PROPRIETARIO (Calda, accogliente e in linea col design dell'app)
    const htmlProprietario = `
      <div style="font-family: 'Inter', Helvetica, sans-serif; color: #1E293B; max-width: 600px; margin: 0 auto; border: 1px solid #E2E8F0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
        
        <div style="background-color: #F58220; padding: 25px; text-align: center;">
            <h2 style="color: #ffffff; margin: 0; font-size: 24px;">Prenotazione Confermata! 🎉</h2>
        </div>
        
        <div style="padding: 30px;">
            <p style="font-size: 16px; line-height: 1.5;">Ciao! La tua visita per <strong>${nomeAnimale}</strong> è stata confermata con successo sulla piattaforma Veterinari.it.</p>
            
            <div style="background: #F8FAFC; padding: 20px; border-radius: 12px; margin: 25px 0; border-left: 5px solid #0284C7;">
              <p style="margin: 8px 0; font-size: 15px;"><strong>👨‍⚕️ Professionista:</strong> ${nomeProfessionista}</p>
              <p style="margin: 8px 0; font-size: 15px;"><strong>📅 Data e Ora:</strong> ${dataVisita}</p>
              <p style="margin: 8px 0; font-size: 15px;"><strong>📍 Luogo:</strong> ${luogoAppuntamento || 'Studio Principale'}</p>
            </div>

            <!-- SEZIONE OPZIONALE: Messaggio personalizzato del Veterinario -->
            ${messaggioPersonalizzato ? `
            <div style="background: #FEF3C7; padding: 20px; border-radius: 12px; margin: 25px 0; border: 1px solid #FDE68A;">
              <p style="margin: 0 0 8px 0; color: #D97706; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;"><strong>Messaggio dal professionista:</strong></p>
              <p style="margin: 0; font-style: italic; color: #92400E; font-size: 15px;">"${messaggioPersonalizzato}"</p>
            </div>
            ` : ''}

            ${noteAggiuntive ? `<p style="font-size: 14px; color: #64748B; background: #F1F5F9; padding: 15px; border-radius: 8px;"><strong>Le tue note in fase di prenotazione:</strong> <em>"${noteAggiuntive}"</em></p>` : ''}
            
            <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 30px 0;">
            <p style="font-size: 14px; color: #94A3B8; text-align: center; margin: 0;">A presto,<br>Il team di <strong>Veterinari.it</strong></p>
        </div>
      </div>
    `;

    // 3. Prepariamo la MAIL PER IL PROFESSIONISTA (Professionale, chiara e schematica)
    const htmlProfessionista = `
      <div style="font-family: 'Inter', Helvetica, sans-serif; color: #1E293B; max-width: 600px; margin: 0 auto; border: 1px solid #E2E8F0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
        
        <div style="background-color: #0284C7; padding: 25px; text-align: center;">
            <h2 style="color: #ffffff; margin: 0; font-size: 24px;">Nuovo Appuntamento in Agenda 📅</h2>
        </div>
        
        <div style="padding: 30px;">
            <p style="font-size: 16px; line-height: 1.5;">Gentile ${nomeProfessionista}, un utente ha appena prenotato un nuovo appuntamento nella tua agenda.</p>
            
            <div style="background: #F1F5F9; padding: 20px; border-radius: 12px; margin: 25px 0; border-left: 5px solid #F58220;">
              <p style="margin: 8px 0; font-size: 15px;"><strong>🐾 Paziente:</strong> ${nomeAnimale}</p>
              <p style="margin: 8px 0; font-size: 15px;"><strong>📅 Data e Ora:</strong> ${dataVisita}</p>
              <p style="margin: 8px 0; font-size: 15px;"><strong>📍 Sede:</strong> ${luogoAppuntamento || 'Studio Principale'}</p>
              <p style="margin: 8px 0; font-size: 15px;"><strong>✉️ Contatto Cliente:</strong> <a href="mailto:${emailProprietario}" style="color: #0284C7;">${emailProprietario}</a></p>
            </div>

            ${noteAggiuntive ? `
            <div style="background: #FEE2E2; padding: 15px; border-radius: 8px; border-left: 4px solid #EF4444;">
                <p style="margin: 0; font-size: 14px; color: #991B1B;"><strong>Note/Richieste del cliente:</strong> <em>"${noteAggiuntive}"</em></p>
            </div>` : ''}
            
            <p style="font-size: 14px; color: #64748B; text-align: center; margin-top: 30px;">Puoi gestire questo appuntamento dalla tua Dashboard su Veterinari.it</p>
        </div>
      </div>
    `;

    // 4. Inviamo la mail al Proprietario tramite Resend
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendApiKey}` },
      body: JSON.stringify({
        from: 'VeterinariApp <onboarding@resend.dev>', // Sostituisci con il tuo dominio verificato su Resend in futuro
        to: emailProprietario,
        subject: `Conferma Visita per ${nomeAnimale} 🐾`,
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
        subject: `Nuova prenotazione per ${nomeAnimale}`,
        html: htmlProfessionista,
      }),
    })

    return new Response(JSON.stringify({ success: true }), { headers: { ...headers, 'Content-Type': 'application/json' }, status: 200 })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { headers: { ...headers, 'Content-Type': 'application/json' }, status: 400 })
  }
})