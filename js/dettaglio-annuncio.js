// ==========================================
// ==========================================
// 1. IMPORT CENTRALIZZATI
// ==========================================
import { supabase } from '../utils/supabaseClient.js';
import { logError } from '../utils/logger.js';
import { verificaCampi, MESSAGGIO_BLOCCO } from './mercatino-moderation.js';

const urlParams = new URLSearchParams(window.location.search);
const listingId = urlParams.get('id');

let currentUser = null;
let listing = null;

// Elementi DOM
const loadingState = document.getElementById('loadingState');
const contentWrapper = document.getElementById('contentWrapper');
const galleria = document.getElementById('galleria');
const listingTitle = document.getElementById('listingTitle');
const listingTags = document.getElementById('listingTags');
const listingLocation = document.getElementById('listingLocation');
const listingDescription = document.getElementById('listingDescription');
const pickupNotesBox = document.getElementById('pickupNotesBox');
const pickupNotesText = document.getElementById('pickupNotesText');
const ownerAvatar = document.getElementById('ownerAvatar');
const ownerName = document.getElementById('ownerName');
const ownerReputation = document.getElementById('ownerReputation');
const actionBox = document.getElementById('actionBox');

function escapeHtml(str) {
    if (typeof str !== 'string') return str;
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

async function initPagina() {
    if (!listingId) {
        alert("Annuncio non specificato.");
        window.location.href = "mercatino.html";
        return;
    }

    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) throw Object.assign(new Error(authError.message), { code: authError.code || 'AUTH_CHECK_ERROR' });

        if (!user) {
            window.location.href = "../../index.html";
            return;
        }
        currentUser = user;

        await caricaAnnuncio();

    } catch (error) {
        console.error("Errore inizializzazione dettaglio annuncio:", error);
        loadingState.innerHTML = `<div style="text-align:center; color:#DC2626; padding: 2rem;"><b>Ops!</b><br>${error.message || "Errore nel caricamento dell'annuncio."}</div>`;
        
        await logError({
            source: 'mercatino_dettaglio', action: 'init_page',
            errorMessage: error.message, errorCode: error.code || 'UNKNOWN_SYS_ERROR',
            context: { listing_id: listingId }
        });
    }
}

async function caricaAnnuncio() {
    const { data, error } = await supabase
        .from('marketplace_listings')
        .select(`
            id, title, description, condition, species, size, postal_code, city, province, region,
            pickup_notes, status, owner_user_id, created_at,
            category:marketplace_categories(name),
            marketplace_listing_photos(photo_url, position)
        `)
        .eq('id', listingId)
        .maybeSingle(); 

    if (error) throw Object.assign(new Error(error.message), { code: error.code || 'DB_FETCH_LISTING_ERROR' });

    if (!data) {
        throw new Error("Questo annuncio non esiste o è stato rimosso dal proprietario.");
    }

    listing = data;

    const [{ data: ownerProfile }, { data: reputation }, { data: existingRequest }] = await Promise.all([
        supabase.from('profiles').select('nome, avatar_url').eq('id', listing.owner_user_id).maybeSingle(),
        supabase.from('marketplace_user_reputation').select('*').eq('user_id', listing.owner_user_id).maybeSingle(),
        supabase.from('marketplace_requests').select('id, status').eq('listing_id', listingId).eq('requester_user_id', currentUser.id).maybeSingle()
    ]);

    renderAnnuncio(ownerProfile, reputation, existingRequest);
}

function renderAnnuncio(ownerProfile, reputation, existingRequest) {
    // Galleria
    const foto = (listing.marketplace_listing_photos || []).slice().sort((a, b) => a.position - b.position);
    if (foto.length > 0) {
        galleria.innerHTML = `
            <img id="mainPhoto" src="${foto[0].photo_url}" style="width:100%; height:260px; object-fit:cover; border-radius:16px; margin-bottom:8px;">
            <div style="display:flex; gap:8px; overflow-x:auto;">
                ${foto.map((f, i) => `<img src="${f.photo_url}" data-src="${f.photo_url}" class="thumb-foto" style="width:56px; height:56px; object-fit:cover; border-radius:8px; cursor:pointer; border:2px solid ${i === 0 ? '#F58220' : 'transparent'};">`).join('')}
            </div>
        `;
        galleria.querySelectorAll('.thumb-foto').forEach(thumb => {
            thumb.addEventListener('click', () => {
                document.getElementById('mainPhoto').src = thumb.dataset.src;
                galleria.querySelectorAll('.thumb-foto').forEach(t => t.style.borderColor = 'transparent');
                thumb.style.borderColor = '#F58220';
            });
        });
    } else {
        galleria.innerHTML = `<div style="width:100%; height:200px; background:#F1F5F9; border-radius:16px; display:flex; align-items:center; justify-content:center; color:#94A3B8;"><i class="fa-solid fa-image" style="font-size:2rem;"></i></div>`;
    }

    listingTitle.textContent = listing.title;

    const tags = [
        { label: 'GRATIS', color: '#16A34A', bg: '#F0FDF4' },
        listing.category ? { label: listing.category.name, color: '#0284C7', bg: '#F0F9FF' } : null,
        { label: listing.condition, color: '#475569', bg: '#F1F5F9' },
        listing.species && listing.species !== 'Tutti' ? { label: listing.species, color: '#475569', bg: '#F1F5F9' } : null,
        listing.size ? { label: listing.size, color: '#475569', bg: '#F1F5F9' } : null
    ].filter(Boolean);

    listingTags.innerHTML = tags.map(t =>
        `<span style="background:${t.bg}; color:${t.color}; font-size:0.78rem; font-weight:700; padding:5px 12px; border-radius:20px;">${escapeHtml(t.label)}</span>`
    ).join('');

    listingLocation.textContent = `${listing.city} (${listing.province}) · CAP ${listing.postal_code}`;
    listingDescription.textContent = listing.description;

    if (listing.pickup_notes) {
        pickupNotesBox.hidden = false;
        pickupNotesText.textContent = listing.pickup_notes;
    }

    // Donatore
    const nomeVisualizzato = (ownerProfile && ownerProfile.nome) ? ownerProfile.nome : 'Utente Veterinari.it';
    ownerName.textContent = nomeVisualizzato;
    ownerAvatar.textContent = nomeVisualizzato.charAt(0).toUpperCase();
    if (ownerProfile && ownerProfile.avatar_url) {
        const { data } = supabase.storage.from('storage_veterinari').getPublicUrl(ownerProfile.avatar_url);
        ownerAvatar.innerHTML = `<img src="${data.publicUrl}" style="width:100%; height:100%; object-fit:cover;">`;
    }

    if (reputation) {
        const punti = reputation.punti_affidabilita || 0;
        const regalati = reputation.oggetti_regalati || 0;
        const media = reputation.valutazione_media ? `${reputation.valutazione_media}/5` : 'nessuna valutazione';
        ownerReputation.textContent = `${punti} punti affidabilità · ${regalati} regalati · ${media}`;
    } else {
        ownerReputation.textContent = 'Nuovo utente del Mercatino';
    }

    renderActionBox(existingRequest);

    loadingState.hidden = true;
    contentWrapper.hidden = false;
}

// ==========================================
// GESTIONE AZIONI (BOX INFERIORE)
// ==========================================
function renderActionBox(existingRequest) {
    const eProprioAnnuncio = listing.owner_user_id === currentUser.id;

    // SCENARIO 1: L'UTENTE È IL PROPRIETARIO DELL'ANNUNCIO
    if (eProprioAnnuncio) {
        
        // Se l'annuncio è DISPONIBILE -> Può Modificare
        if (listing.status === 'AVAILABLE') {
            actionBox.innerHTML = `
                <div style="background:#F1F5F9; border-radius:16px; padding:16px; text-align:center;">
                    <p style="margin:0 0 15px 0; color:#475569; font-size:0.95rem; font-weight:600;">Gestione Annuncio</p>
                    <div style="display:flex; flex-direction:column; gap:10px;">
                        <a href="modifica-annuncio.html?id=${listing.id}" style="display:block; background:#fff; color:#1E293B; border:2px solid #E2E8F0; padding:14px; border-radius:12px; text-decoration:none; font-weight:700; font-size:0.95rem;">
                            <i class="fa-solid fa-pen" style="margin-right:8px;"></i> Modifica titolo/foto
                        </a>
                        <a href="le-mie-attivita.html" style="display:block; background:#1E293B; color:#fff; padding:14px; border-radius:12px; text-decoration:none; font-weight:700; font-size:0.95rem;">
                            <i class="fa-solid fa-inbox" style="margin-right:8px;"></i> Gestisci richieste ricevute
                        </a>
                    </div>
                </div>
            `;
        } 
        // Se l'annuncio è IN TRATTATIVA (RESERVED) -> Modifica Bloccata
        else if (listing.status === 'RESERVED') {
            actionBox.innerHTML = `
                <div style="background:#FFFBEB; border:1px solid #FEF3C7; border-radius:16px; padding:16px; text-align:center;">
                    <p style="margin:0 0 5px 0; color:#D97706; font-size:1rem; font-weight:700;"><i class="fa-solid fa-handshake"></i> Oggetto in trattativa</p>
                    <p style="margin:0 0 15px 0; color:#78350F; font-size:0.85rem;">Non puoi modificare l'annuncio mentre sei in accordo con un'altra persona per la cessione.</p>
                    <a href="le-mie-attivita.html" style="display:block; background:#D97706; color:#fff; padding:14px; border-radius:12px; text-decoration:none; font-weight:700; font-size:0.95rem;">
                        Vai alla chat / trattativa
                    </a>
                </div>
            `;
        } 
        // Altri stati (completato, archiviato)
        else {
            actionBox.innerHTML = `
                <div style="background:#F1F5F9; border-radius:16px; padding:16px; text-align:center;">
                    <p style="margin:0; color:#475569; font-size:0.9rem;">Questo annuncio è stato chiuso o ceduto con successo.</p>
                </div>
            `;
        }
        return;
    }

    // SCENARIO 2: L'UTENTE È UN VISITATORE, MA L'OGGETTO NON È PIÙ DISPONIBILE
    if (listing.status !== 'AVAILABLE') {
        actionBox.innerHTML = `
            <div style="background:#F1F5F9; border-radius:16px; padding:16px; text-align:center; color:#64748B; font-size:0.9rem;">
                Questo oggetto non è più disponibile o è in trattativa con un'altra persona.
            </div>
        `;
        return;
    }

    // SCENARIO 3: L'UTENTE HA GIÀ FATTO UNA RICHIESTA
    if (existingRequest) {
        const statoTesti = {
            PENDING: { testo: 'Richiesta inviata, in attesa di risposta.', colore: '#D97706' },
            ACCEPTED: { testo: 'Richiesta accettata! Continua nella chat.', colore: '#16A34A' },
            REJECTED: { testo: 'La tua richiesta non è stata accettata.', colore: '#EF4444' },
            CANCELLED: { testo: 'Hai annullato questa richiesta.', colore: '#64748B' }
        };
        const info = statoTesti[existingRequest.status] || { testo: existingRequest.status, colore: '#64748B' };

        actionBox.innerHTML = `
            <div style="background:#fff; border:1px solid #E2E8F0; border-radius:16px; padding:16px; text-align:center;">
                <p style="margin:0 0 10px 0; color:${info.colore}; font-weight:700; font-size:0.9rem;">${info.testo}</p>
                ${existingRequest.status === 'ACCEPTED'
                    ? `<a href="richiesta.html?id=${existingRequest.id}" style="display:inline-block; background:#F58220; color:#fff; padding:12px 20px; border-radius:12px; text-decoration:none; font-weight:700; font-size:0.9rem;">Apri la chat</a>`
                    : ''}
            </div>
        `;
        return;
    }

    // SCENARIO 4: L'ANNUNCIO È LIBERO E L'UTENTE PUÒ RICHIEDERLO
    actionBox.innerHTML = `
        <div id="interesseBox">
            <button type="button" id="btnMiInteressa" style="width:100%; background:#F58220; color:#fff; border:none; padding:16px; border-radius:16px; font-weight:700; font-size:1rem; cursor:pointer;">
                Mi interessa
            </button>
        </div>
    `;
    document.getElementById('btnMiInteressa').addEventListener('click', mostraFormRichiesta);
}

function mostraFormRichiesta() {
    const interesseBox = document.getElementById('interesseBox');
    interesseBox.innerHTML = `
        <div style="background:#fff; border:1px solid #E2E8F0; border-radius:16px; padding:16px;">
            <label style="display:block; font-size:0.85rem; font-weight:600; color:#475569; margin-bottom:8px;">Messaggio per il donatore</label>
            <textarea id="messaggioRichiesta" rows="3" placeholder="Es. Mi interessa il trasportino per il mio gatto. Posso ritirarlo sabato mattina." style="width:100%; padding:12px; border:1px solid #E2E8F0; border-radius:12px; box-sizing:border-box; font-family:inherit; resize:vertical;"></textarea>
            <div id="richiestaErr" style="color:#EF4444; font-size:0.8rem; margin-top:8px;" hidden></div>
            <button type="button" id="btnInviaRichiesta" style="width:100%; background:#F58220; color:#fff; border:none; padding:14px; border-radius:12px; font-weight:700; font-size:0.95rem; cursor:pointer; margin-top:10px;">
                Invia richiesta
            </button>
        </div>
    `;
    document.getElementById('btnInviaRichiesta').addEventListener('click', inviaRichiesta);
}

async function inviaRichiesta() {
    const messaggioEl = document.getElementById('messaggioRichiesta');
    const errEl = document.getElementById('richiestaErr');
    const btn = document.getElementById('btnInviaRichiesta');
    const messaggio = messaggioEl.value.trim();

    errEl.hidden = true;

    const { bloccato } = verificaCampi(messaggio);
    if (bloccato) {
        errEl.textContent = MESSAGGIO_BLOCCO;
        errEl.hidden = false;
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Invio in corso...';

    try {
        const { data: nuovaRichiesta, error } = await supabase
            .from('marketplace_requests')
            .insert({
                listing_id: listingId,
                requester_user_id: currentUser.id,
                message: messaggio || null
            })
            .select('id, status')
            .single();

        if (error) throw Object.assign(new Error(error.message), { code: error.code || 'DB_INSERT_REQUEST_ERROR' });

        renderActionBox(nuovaRichiesta);

    } catch (error) {
        console.error("Errore invio richiesta:", error);
        errEl.textContent = "Errore durante l'invio della richiesta. Riprova.";
        errEl.hidden = false;
        btn.disabled = false;
        btn.innerHTML = 'Invia richiesta';
        await logError({
            source: 'mercatino_dettaglio', action: 'send_request',
            errorMessage: error.message, errorCode: error.code || 'SEND_REQUEST_ERROR',
            context: { listing_id: listingId, user_id: currentUser.id }
        });
    }
}

initPagina();