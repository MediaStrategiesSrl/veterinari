// supabase/functions/send-walk-friend-email/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const resendApiKey = Deno.env.get('RESEND_API_KEY')

// Client con Service Role Key: bypassa la RLS, disponibile automaticamente in ogni Edge Function Supabase
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
    // 1. Il client ci manda SOLO gli ID dei due animali coinvolti nel match (niente email/nomi)
    const { pet1Id, pet2Id } = await req.json()

    // 2. Recuperiamo i due animali e i rispettivi proprietari usando la Service Role
    //    (qui la RLS "lettura solo profilo personale" viene bypassata legittimamente,
    //     perché è la nostra Edge Function verificata a farlo, non il client)
    const { data: pets, error: petsError } = await supabaseAdmin
      .from('pets')
      .select('id, nome, owner_id')
      .in('id', [pet1Id, pet2Id])
    if (petsError) throw petsError

    const petA = pets.find((p) => p.id === pet1Id)
    const petB = pets.find((p) => p.id === pet2Id)
    if (!petA || !petB) throw new Error('Uno dei due animali non è stato trovato')

    const { data: profili, error: profiliError } = await supabaseAdmin
      .from('profiles')
      .select('id, nome, email')
      .in('id', [petA.owner_id, petB.owner_id])
    if (profiliError) throw profiliError

    const ownerA = profili.find((p) => p.id === petA.owner_id)
    const ownerB = profili.find((p) => p.id === petB.owner_id)
    if (!ownerA?.email || !ownerB?.email) throw new Error('Email dei proprietari non disponibile')

    // 3. Funzione che genera l'HTML mostrando i dati dell'ALTRO proprietario/animale
    const generaHtmlAmico = (
      nomeDestinatario: string,
      nomeAnimaleDestinatario: string,
      nomeAltroProprietario: string,
      nomeAltroAnimale: string
    ) => `
      <div style="font-family: 'Inter', Helvetica, sans-serif; color: #1E293B; max-width: 600px; margin: 0 auto; border: 1px solid #E2E8F0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">

        <div style="background-color: #F58220; padding: 25px; text-align: center;">
            <h2 style="color: #ffffff; margin: 0; font-size: 24px;">Hai un nuovo amico di passeggiata! 🐾🎉</h2>
        </div>

        <div style="padding: 30px;">
            <p style="font-size: 16px; line-height: 1.5;">Ciao ${nomeDestinatario}! ${nomeAnimaleDestinatario} ha trovato un nuovo amico su Veterinari.it.</p>

            <div style="background: #F8FAFC; padding: 20px; border-radius: 12px; margin: 25px 0; border-left: 5px solid #F58220;">
              <p style="margin: 8px 0; font-size: 15px;"><strong>🐕 Nuovo amico:</strong> ${nomeAltroAnimale}</p>
              <p style="margin: 8px 0; font-size: 15px;"><strong>👤 Proprietario:</strong> ${nomeAltroProprietario}</p>
            </div>

            <p style="font-size: 15px; line-height: 1.5;">Accedi all'app per mettervi in contatto e organizzare la prossima passeggiata insieme!</p>

            <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 30px 0;">
            <p style="font-size: 14px; color: #94A3B8; text-align: center; margin: 0;">A presto,<br>Il team di <strong>Veterinari.it</strong></p>
        </div>
      </div>
    `;

    // 4. Mail per il Proprietario A (mostra i dati di B)
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendApiKey}` },
      body: JSON.stringify({
        from: 'VeterinariApp <onboarding@resend.dev>', // Sostituisci con il tuo dominio verificato su Resend in futuro
        to: ownerA.email,
        subject: `${petB.nome} vuole fare amicizia con ${petA.nome}! 🐾`,
        html: generaHtmlAmico(ownerA.nome, petA.nome, ownerB.nome, petB.nome),
      }),
    })

    // 5. Mail per il Proprietario B (mostra i dati di A)
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendApiKey}` },
      body: JSON.stringify({
        from: 'VeterinariApp <onboarding@resend.dev>',
        to: ownerB.email,
        subject: `${petA.nome} vuole fare amicizia con ${petB.nome}! 🐾`,
        html: generaHtmlAmico(ownerB.nome, petB.nome, ownerA.nome, petA.nome),
      }),
    })

    return new Response(JSON.stringify({ success: true }), { headers: { ...headers, 'Content-Type': 'application/json' }, status: 200 })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { headers: { ...headers, 'Content-Type': 'application/json' }, status: 400 })
  }
})