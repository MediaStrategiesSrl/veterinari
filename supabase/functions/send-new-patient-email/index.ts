// supabase/functions/send-new-patient-email/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const resendApiKey = Deno.env.get('RESEND_API_KEY')

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
    // 1. Il client ci manda SOLO gli ID: l'animale e il veterinario appena approvato
    const { petId, veterinarianId } = await req.json()

    // 2. Recuperiamo l'animale e il suo proprietario
    const { data: pet, error: petError } = await supabaseAdmin
      .from('pets')
      .select('nome, owner_id')
      .eq('id', petId)
      .single()
    if (petError) throw petError

    // 3. Recuperiamo i profili di proprietario e veterinario in un'unica query (bypassa la RLS)
    const { data: profili, error: profiliError } = await supabaseAdmin
      .from('profiles')
      .select('id, nome, cognome, email')
      .in('id', [pet.owner_id, veterinarianId])
    if (profiliError) throw profiliError

    const proprietario = profili.find((p) => p.id === pet.owner_id)
    const veterinario = profili.find((p) => p.id === veterinarianId)
    if (!proprietario?.email || !veterinario?.email) throw new Error('Email non disponibile per proprietario o veterinario')

    const nomeVeterinarioCompleto = `Dott. ${veterinario.nome} ${veterinario.cognome || ''}`.trim()

    // 4. Mail PER IL VETERINARIO: nuovo paziente aggiunto in cartella
    const htmlVeterinario = `
      <div style="font-family: 'Inter', Helvetica, sans-serif; color: #1E293B; max-width: 600px; margin: 0 auto; border: 1px solid #E2E8F0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">

        <div style="background-color: #0284C7; padding: 25px; text-align: center;">
            <h2 style="color: #ffffff; margin: 0; font-size: 24px;">Nuovo Paziente in Cartella 🩺</h2>
        </div>

        <div style="padding: 30px;">
            <p style="font-size: 16px; line-height: 1.5;">Gentile ${nomeVeterinarioCompleto}, hai scansionato il QR code di un nuovo paziente su Veterinari.it.</p>

            <div style="background: #F1F5F9; padding: 20px; border-radius: 12px; margin: 25px 0; border-left: 5px solid #F58220;">
              <p style="margin: 8px 0; font-size: 15px;"><strong>🐾 Paziente:</strong> ${pet.nome}</p>
              <p style="margin: 8px 0; font-size: 15px;"><strong>👤 Proprietario:</strong> ${proprietario.nome}</p>
              <p style="margin: 8px 0; font-size: 15px;"><strong>✉️ Contatto:</strong> <a href="mailto:${proprietario.email}" style="color: #0284C7;">${proprietario.email}</a></p>
            </div>

            <p style="font-size: 14px; color: #64748B; text-align: center; margin-top: 30px;">Puoi consultare la cartella clinica completa dalla tua Dashboard su Veterinari.it</p>
        </div>
      </div>
    `;

    // 5. Mail PER IL PROPRIETARIO: nuovo veterinario associato al suo animale
    const htmlProprietario = `
      <div style="font-family: 'Inter', Helvetica, sans-serif; color: #1E293B; max-width: 600px; margin: 0 auto; border: 1px solid #E2E8F0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">

        <div style="background-color: #F58220; padding: 25px; text-align: center;">
            <h2 style="color: #ffffff; margin: 0; font-size: 24px;">Nuovo Veterinario per ${pet.nome} 🩺</h2>
        </div>

        <div style="padding: 30px;">
            <p style="font-size: 16px; line-height: 1.5;">Ciao ${proprietario.nome}! Il QR code di ${pet.nome} è stato scansionato da un nuovo veterinario, che ora ha accesso alla sua cartella clinica.</p>

            <div style="background: #F8FAFC; padding: 20px; border-radius: 12px; margin: 25px 0; border-left: 5px solid #0284C7;">
              <p style="margin: 8px 0; font-size: 15px;"><strong>👨‍⚕️ Veterinario:</strong> ${nomeVeterinarioCompleto}</p>
              <p style="margin: 8px 0; font-size: 15px;"><strong>🐾 Paziente:</strong> ${pet.nome}</p>
            </div>

            <p style="font-size: 15px; line-height: 1.5;">Se non riconosci questo veterinario, ti consigliamo di controllare i permessi di accesso dalla tua Dashboard.</p>

            <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 30px 0;">
            <p style="font-size: 14px; color: #94A3B8; text-align: center; margin: 0;">A presto,<br>Il team di <strong>Veterinari.it</strong></p>
        </div>
      </div>
    `;

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendApiKey}` },
      body: JSON.stringify({
        from: 'VeterinariApp <onboarding@resend.dev>', // Sostituisci con il tuo dominio verificato su Resend in futuro
        to: veterinario.email,
        subject: `Nuovo paziente: ${pet.nome} 🐾`,
        html: htmlVeterinario,
      }),
    })

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendApiKey}` },
      body: JSON.stringify({
        from: 'VeterinariApp <onboarding@resend.dev>',
        to: proprietario.email,
        subject: `Nuovo veterinario per ${pet.nome} 🩺`,
        html: htmlProprietario,
      }),
    })

    return new Response(JSON.stringify({ success: true }), { headers: { ...headers, 'Content-Type': 'application/json' }, status: 200 })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { headers: { ...headers, 'Content-Type': 'application/json' }, status: 400 })
  }
})