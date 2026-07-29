// supabase/functions/send-listing-created-email/index.ts
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
    // 1. Il client ci manda SOLO l'ID dell'annuncio appena creato
    const { listingId } = await req.json()

    const { data: listing, error: listingError } = await supabaseAdmin
      .from('marketplace_listings')
      .select('title, description, condition, species, size, city, province, postal_code, pickup_notes, expiry_date, category_id, owner_user_id')
      .eq('id', listingId)
      .single()
    if (listingError) throw listingError

    // 2. Proprietario: nome, email e consenso, con la Service Role (bypassa RLS)
    const { data: proprietario, error: proprietarioError } = await supabaseAdmin
      .from('profiles')
      .select('nome, email, email_notifications_enabled')
      .eq('id', listing.owner_user_id)
      .single()
    if (proprietarioError) throw proprietarioError
    if (!proprietario?.email) throw new Error('Email del proprietario non disponibile')

    // 3. Nome leggibile della categoria, se presente (facoltativo, solo per il recap)
    let categoriaNome = null
    if (listing.category_id) {
      const { data: categoria } = await supabaseAdmin
        .from('marketplace_categories')
        .select('name')
        .eq('id', listing.category_id)
        .single()
      categoriaNome = categoria?.name ?? null
    }

    // 4. Invia solo se il proprietario ha attivato le notifiche email
    if (proprietario.email_notifications_enabled) {
      const dataScadenza = listing.expiry_date
        ? new Date(listing.expiry_date).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })
        : null

      const html = `
        <div style="font-family: 'Inter', Helvetica, sans-serif; color: #1E293B; max-width: 600px; margin: 0 auto; border: 1px solid #E2E8F0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">

          <div style="background-color: #059669; padding: 25px; text-align: center;">
              <h2 style="color: #ffffff; margin: 0; font-size: 24px;">Annuncio pubblicato! 📢</h2>
          </div>

          <div style="padding: 30px;">
              <p style="font-size: 16px; line-height: 1.5;">Ciao ${proprietario.nome}! Il tuo annuncio è stato creato sul Mercatino di Veterinari.it. Ecco il riepilogo:</p>

              <div style="background: #F0FDF4; padding: 20px; border-radius: 12px; margin: 25px 0; border-left: 5px solid #059669;">
                <p style="margin: 8px 0; font-size: 15px;"><strong>📦 Titolo:</strong> ${listing.title}</p>
                ${categoriaNome ? `<p style="margin: 8px 0; font-size: 15px;"><strong>🏷️ Categoria:</strong> ${categoriaNome}</p>` : ''}
                <p style="margin: 8px 0; font-size: 15px;"><strong>📝 Descrizione:</strong> ${listing.description}</p>
                <p style="margin: 8px 0; font-size: 15px;"><strong>✨ Condizione:</strong> ${listing.condition}</p>
                ${listing.species ? `<p style="margin: 8px 0; font-size: 15px;"><strong>🐾 Adatto a:</strong> ${listing.species}</p>` : ''}
                ${listing.size ? `<p style="margin: 8px 0; font-size: 15px;"><strong>📏 Taglia:</strong> ${listing.size}</p>` : ''}
                <p style="margin: 8px 0; font-size: 15px;"><strong>📍 Ritiro:</strong> ${listing.city} (${listing.province}), ${listing.postal_code}</p>
                ${listing.pickup_notes ? `<p style="margin: 8px 0; font-size: 15px;"><strong>ℹ️ Note ritiro:</strong> ${listing.pickup_notes}</p>` : ''}
                ${dataScadenza ? `<p style="margin: 8px 0; font-size: 15px;"><strong>⏳ Scadenza annuncio:</strong> ${dataScadenza}</p>` : ''}
              </div>

              <p style="font-size: 15px; line-height: 1.5;">Riceverai una notifica non appena qualcuno sarà interessato. Puoi modificarlo o ritirarlo in qualsiasi momento dalla sezione "Le mie attività" dell'app.</p>

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
          to: proprietario.email,
          subject: `Annuncio pubblicato: ${listing.title} 📢`,
          html,
        }),
      })
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...headers, 'Content-Type': 'application/json' }, status: 200 })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { headers: { ...headers, 'Content-Type': 'application/json' }, status: 400 })
  }
})