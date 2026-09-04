// supabase/functions/send-walk-created-email/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const resendApiKey = Deno.env.get('RESEND_API_KEY')

// Finché non verifichi un dominio tuo su Resend, onboarding@resend.dev consegna
// SOLO all'indirizzo email registrato sul tuo account Resend. Per ora tutte le
// mail di questa function vanno lì, indipendentemente da chi ha creato la passeggiata.
const EMAIL_REGISTRATA_RESEND = 'mediastrategiessrl@gmail.com'

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

serve(async (req) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }

  if (req.method === 'OPTIONS') return new Response('ok', { headers })

  try {
    // 1. Il client ci manda SOLO l'ID della passeggiata appena creata
    const { walkId } = await req.json()

    // 2. Recuperiamo la passeggiata
    const { data: walk, error: walkError } = await supabaseAdmin
      .from('walks')
      .select('titolo, luogo, data_passeggiata, max_animali, creator_id')
      .eq('id', walkId)
      .single()
    if (walkError) throw walkError

    // 3. Nome del proprietario da "profiles" (facoltativo, con fallback se manca)
    const { data: profilo } = await supabaseAdmin
      .from('profiles')
      .select('nome')
      .eq('id', walk.creator_id)
      .single()

    // 4. L'EMAIL la recuperiamo SEMPRE da auth.users con l'Admin API:
    // la colonna "email" su "profiles" potrebbe non esistere o non essere
    // valorizzata, mentre auth.users.email è garantita per ogni utente registrato.
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(walk.creator_id)
    if (userError) throw userError

    const emailProprietario = userData?.user?.email
    if (!emailProprietario) throw new Error('Email del proprietario non disponibile')

    const nomeProprietario = profilo?.nome || 'Utente'

    const dataStr = new Date(walk.data_passeggiata).toLocaleDateString('it-IT', {
      weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
    })

    // 5. Mail di conferma creazione passeggiata
    const htmlProprietario = `
      <div style="font-family: 'Inter', Helvetica, sans-serif; color: #1E293B; max-width: 600px; margin: 0 auto; border: 1px solid #E2E8F0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">

        <div style="background-color: #F58220; padding: 25px; text-align: center;">
            <h2 style="color: #ffffff; margin: 0; font-size: 24px;">Passeggiata Creata! 🐕🎉</h2>
        </div>

        <div style="padding: 30px;">
            <p style="font-size: 12px; color: #94A3B8; margin: 0 0 15px 0;">[Modalità test] Destinatario reale: ${emailProprietario}</p>
            <p style="font-size: 16px; line-height: 1.5;">Ciao ${nomeProprietario}! La tua passeggiata è stata pubblicata con successo su Veterinari.it.</p>

            <div style="background: #F8FAFC; padding: 20px; border-radius: 12px; margin: 25px 0; border-left: 5px solid #F58220;">
              <p style="margin: 8px 0; font-size: 15px;"><strong>🚶 Titolo:</strong> ${walk.titolo}</p>
              <p style="margin: 8px 0; font-size: 15px;"><strong>📅 Data e Ora:</strong> ${dataStr}</p>
              <p style="margin: 8px 0; font-size: 15px;"><strong>📍 Luogo:</strong> ${walk.luogo}</p>
              ${walk.max_animali ? `<p style="margin: 8px 0; font-size: 15px;"><strong>🐾 Posti disponibili:</strong> fino a ${walk.max_animali} animali</p>` : ''}
            </div>

            <p style="font-size: 15px; line-height: 1.5;">Ti avviseremo non appena un altro proprietario si unirà alla tua passeggiata!</p>

            <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 30px 0;">
            <p style="font-size: 14px; color: #94A3B8; text-align: center; margin: 0;">A presto,<br>Il team di <strong>Veterinari.it</strong></p>
        </div>
      </div>
    `;

    // 6. Inviamo la mail al Proprietario tramite Resend
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendApiKey}` },
      body: JSON.stringify({
        from: 'VeterinariApp <onboarding@resend.dev>',
        to: EMAIL_REGISTRATA_RESEND, // TODO: tornare a emailProprietario quando verifichi un dominio su Resend
        subject: `Passeggiata pubblicata: ${walk.titolo} 🐾`,
        html: htmlProprietario,
      }),
    })

    // NOVITÀ: controlliamo che Resend abbia davvero accettato la richiesta,
    // altrimenti l'errore vero (es. dominio non verificato, rate limit) restava invisibile
    if (!resendResponse.ok) {
      const resendErrorBody = await resendResponse.text()
      throw new Error(`Resend error (${resendResponse.status}): ${resendErrorBody}`)
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...headers, 'Content-Type': 'application/json' }, status: 200 })

  } catch (error) {
    console.error('send-walk-created-email error:', error)
    return new Response(JSON.stringify({ error: error.message }), { headers: { ...headers, 'Content-Type': 'application/json' }, status: 400 })
  }
})