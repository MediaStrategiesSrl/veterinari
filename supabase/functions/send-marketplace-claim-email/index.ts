// supabase/functions/send-marketplace-claim-email/index.ts
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
    // 1. Il client ci manda SOLO l'ID della richiesta appena segnata come "consegnata"
    const { requestId } = await req.json()

    const { data: request, error: requestError } = await supabaseAdmin
      .from('marketplace_requests')
      .select('requester_user_id, listing_id')
      .eq('id', requestId)
      .single()
    if (requestError) throw requestError

    const { data: listing, error: listingError } = await supabaseAdmin
      .from('marketplace_listings')
      .select('title, description, owner_user_id')
      .eq('id', request.listing_id)
      .single()
    if (listingError) throw listingError

    const { data: profili, error: profiliError } = await supabaseAdmin
      .from('profiles')
      .select('id, nome, email')
      .in('id', [listing.owner_user_id, request.requester_user_id])
    if (profiliError) throw profiliError

    const venditore = profili.find((p) => p.id === listing.owner_user_id)
    const acquirente = profili.find((p) => p.id === request.requester_user_id)
    if (!venditore?.email || !acquirente?.email) throw new Error('Email non disponibile per venditore o acquirente')

    // 2. Mail per chi ha DONATO l'oggetto: conferma di aver segnato la consegna
    const htmlVenditore = `
      <div style="font-family: 'Inter', Helvetica, sans-serif; color: #1E293B; max-width: 600px; margin: 0 auto; border: 1px solid #E2E8F0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">

        <div style="background-color: #059669; padding: 25px; text-align: center;">
            <h2 style="color: #ffffff; margin: 0; font-size: 24px;">Consegna Registrata! 📦✅</h2>
        </div>

        <div style="padding: 30px;">
            <p style="font-size: 16px; line-height: 1.5;">Ciao ${venditore.nome}! Hai segnato <strong>${listing.title}</strong> come consegnato sul Mercatino di Veterinari.it.</p>

            <div style="background: #F0FDF4; padding: 20px; border-radius: 12px; margin: 25px 0; border-left: 5px solid #059669;">
              <p style="margin: 8px 0; font-size: 15px;"><strong>📦 Oggetto:</strong> ${listing.title}</p>
              <p style="margin: 8px 0; font-size: 15px;"><strong>👤 Consegnato a:</strong> ${acquirente.nome}</p>
              <p style="margin: 8px 0; font-size: 15px;"><strong>✉️ Contatto:</strong> <a href="mailto:${acquirente.email}" style="color: #059669;">${acquirente.email}</a></p>
            </div>

            <p style="font-size: 15px; line-height: 1.5;">Siamo in attesa che ${acquirente.nome} confermi la ricezione dall'app. Grazie per aver dato una seconda vita a questo oggetto! 🌱</p>

            <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 30px 0;">
            <p style="font-size: 14px; color: #94A3B8; text-align: center; margin: 0;">A presto,<br>Il team di <strong>Veterinari.it</strong></p>
        </div>
      </div>
    `;

    // 3. Mail per chi RICEVE l'oggetto: dettagli e invito a confermare la ricezione in app
    const htmlAcquirente = `
      <div style="font-family: 'Inter', Helvetica, sans-serif; color: #1E293B; max-width: 600px; margin: 0 auto; border: 1px solid #E2E8F0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">

        <div style="background-color: #10B981; padding: 25px; text-align: center;">
            <h2 style="color: #ffffff; margin: 0; font-size: 24px;">Il tuo oggetto è pronto! 📦</h2>
        </div>

        <div style="padding: 30px;">
            <p style="font-size: 16px; line-height: 1.5;">Ciao ${acquirente.nome}! ${venditore.nome} ha segnato come consegnato l'oggetto gratuito che avevi richiesto sul Mercatino di Veterinari.it.</p>

            <div style="background: #F0FDF4; padding: 20px; border-radius: 12px; margin: 25px 0; border-left: 5px solid #10B981;">
              <p style="margin: 8px 0; font-size: 15px;"><strong>📦 Oggetto:</strong> ${listing.title}</p>
              ${listing.description ? `<p style="margin: 8px 0; font-size: 15px;"><strong>📝 Descrizione:</strong> ${listing.description}</p>` : ''}
              <p style="margin: 8px 0; font-size: 15px;"><strong>👤 Donato da:</strong> ${venditore.nome}</p>
              <p style="margin: 8px 0; font-size: 15px;"><strong>✉️ Contatto:</strong> <a href="mailto:${venditore.email}" style="color: #10B981;">${venditore.email}</a></p>
            </div>

            <p style="font-size: 15px; line-height: 1.5;">Ricorda: appena lo ricevi, apri l'app e conferma la ricezione nella sezione "Le mie attività" — è totalmente gratuito!</p>

            <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 30px 0;">
            <p style="font-size: 14px; color: #94A3B8; text-align: center; margin: 0;">A presto,<br>Il team di <strong>Veterinari.it</strong></p>
        </div>
      </div>
    `;

    // 4. Inviamo la mail al Venditore/Donatore tramite Resend
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendApiKey}` },
      body: JSON.stringify({
        from: 'VeterinariApp <onboarding@resend.dev>', // Sostituisci con il tuo dominio verificato su Resend in futuro
        to: venditore.email,
        subject: `Consegna registrata: ${listing.title} 📦`,
        html: htmlVenditore,
      }),
    })

    // 5. Inviamo la mail all'Acquirente tramite Resend
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendApiKey}` },
      body: JSON.stringify({
        from: 'VeterinariApp <onboarding@resend.dev>',
        to: acquirente.email,
        subject: `${listing.title} è pronto per te! 📦`,
        html: htmlAcquirente,
      }),
    })

    return new Response(JSON.stringify({ success: true }), { headers: { ...headers, 'Content-Type': 'application/json' }, status: 200 })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { headers: { ...headers, 'Content-Type': 'application/json' }, status: 400 })
  }
})