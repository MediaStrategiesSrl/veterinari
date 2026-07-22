// ==========================================
// 1. IMPORT CENTRALIZZATI
// ==========================================
import { supabase } from '../utils/supabaseClient.js';
import { logError } from '../utils/logger.js';
import { verificaCampi, MESSAGGIO_BLOCCO, contieneDatiPersonali, AVVISO_DATI_PERSONALI } from './mercatino-moderation.js';

let currentUser = null;
let tabAttiva = 'ricevute';
let attivitaRicevute = [];
let attivitaInviate = [];
let ctxAperto = null; // contesto dell'attività attualmente apera nel modale

// Elementi DOM
const listaAttivita = document.getElementById('listaAttivita');
const tabSwitcher = document.getElementById('tabSwitcher');
const dettaglioModal = document.getElementById('dettaglioModal');
const dettaglioTitolo = document.getElementById('dettaglioTitolo');
const dettaglioBody = document.getElementById('dettaglioBody');
const btnChiudiDettaglio = document.getElementById('btnChiudiDettaglio');

function escapeHtml(str) {
    if (typeof str !== 'string') return str;
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function copertinaListing(listing) {
    const foto = (listing?.marketplace_listing_photos || []).slice().sort((a, b) => a.position - b.position);
    return foto.length > 0 ? foto[0].photo_url : 'https://via.placeholder.com/100/E2E8F0/94A3B8?text=--';
}

const STATO_LABEL = {
    PENDING: { testo: 'In attesa', colore: '#D97706', bg: '#FEF3C7' },
    ACCEPTED: { testo: 'Accettata', colore: '#16A34A', bg: '#F0FDF4' },
    REJECTED: { testo: 'Rifiutata', colore: '#EF4444', bg: '#FEE2E2' },
    CANCELLED: { testo: 'Annullata', colore: '#64748B', bg: '#F1F5F9' }
};

// ==========================================
// INIZIALIZZAZIONE
// ==========================================
async function initPagina() {
    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) throw Object.assign(new Error(authError.message), { code: authError.code || 'AUTH_CHECK_ERROR' });

        if (!user) {
            window.location.href = "../../index.html";
            return;
        }
        currentUser = user;

        wireTabSwitcher();
        btnChiudiDettaglio.addEventListener('click', chiudiDettaglio);
        dettaglioModal.addEventListener('click', (e) => { if (e.target === dettaglioModal) chiudiDettaglio(); });

        await caricaTutto();

    } catch (error) {
        console.error("Errore inizializzazione le mie attività:", error);
        listaAttivita.innerHTML = `<p style="color:#DC2626; text-align:center; padding:30px;">Errore nel caricamento. Riprova più tardi.</p>`;
        await logError({
            source: 'mercatino_attivita', action: 'init_page',
            errorMessage: error.message, errorCode: error.code || 'UNKNOWN_SYS_ERROR',
            context: { user_id: currentUser ? currentUser.id : 'sconosciuto' }
        });
    }
}

function wireTabSwitcher() {
    tabSwitcher.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            tabAttiva = btn.dataset.tab;
            tabSwitcher.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderLista();
        });
    });
}

// ==========================================
// CARICAMENTO DATI
// ==========================================
async function caricaTutto() {
    listaAttivita.innerHTML = `<div style="text-align:center; padding:40px; color:#94A3B8;"><i class="fa-solid fa-spinner fa-spin" style="font-size:1.6rem;"></i></div>`;

    try {
        // Richieste RICEVUTE: tutte le richieste sui MIEI annunci
        const { data: mieiAnnunci, error: err1 } = await supabase
            .from('marketplace_listings')
            .select(`
                id, title, status,
                marketplace_listing_photos(photo_url, position),
                marketplace_requests!marketplace_requests_listing_fkey(id, requester_user_id, message, status, accepted_at, rejected_at, cancelled_at, created_at)
            `)
            .eq('owner_user_id', currentUser.id);

        if (err1) throw Object.assign(new Error(err1.message), { code: err1.code || 'DB_FETCH_RECEIVED_ERROR' });

        const ricevuteFlat = [];
        (mieiAnnunci || []).forEach(listing => {
            (listing.marketplace_requests || []).forEach(req => {
                ricevuteFlat.push({
                    request: req,
                    listing: { id: listing.id, title: listing.title, status: listing.status, marketplace_listing_photos: listing.marketplace_listing_photos },
                    ruolo: 'ricevuta'
                });
            });
        });

        // Richieste INVIATE: le richieste che io ho mandato su annunci altrui
        const { data: mieRichieste, error: err2 } = await supabase
            .from('marketplace_requests')
            .select(`
                id, listing_id, requester_user_id, message, status, accepted_at, rejected_at, cancelled_at, created_at,
                listing:marketplace_listings!marketplace_requests_listing_fkey(id, title, status, owner_user_id, marketplace_listing_photos(photo_url, position))
            `)
            .eq('requester_user_id', currentUser.id)
            .order('created_at', { ascending: false });

        if (err2) throw Object.assign(new Error(err2.message), { code: err2.code || 'DB_FETCH_SENT_ERROR' });

        const inviateFlat = (mieRichieste || []).map(req => ({
            request: { id: req.id, requester_user_id: req.requester_user_id, message: req.message, status: req.status, accepted_at: req.accepted_at, rejected_at: req.rejected_at, cancelled_at: req.cancelled_at, created_at: req.created_at },
            listing: req.listing,
            ruolo: 'inviata'
        }));

        // Profili degli "altri" utenti coinvolti (richiedenti per le ricevute, proprietari per le inviate)
        const idsDaCaricare = new Set();
        ricevuteFlat.forEach(a => idsDaCaricare.add(a.request.requester_user_id));
        inviateFlat.forEach(a => idsDaCaricare.add(a.listing.owner_user_id));

        let profiliMap = new Map();
        if (idsDaCaricare.size > 0) {
            const { data: profili } = await supabase
                .from('profiles')
                .select('id, nome, avatar_url')
                .in('id', Array.from(idsDaCaricare));
            profiliMap = new Map((profili || []).map(p => [p.id, p]));
        }

        ricevuteFlat.forEach(a => { a.otherProfile = profiliMap.get(a.request.requester_user_id) || null; });
        inviateFlat.forEach(a => { a.otherProfile = profiliMap.get(a.listing.owner_user_id) || null; });

        ricevuteFlat.sort((a, b) => new Date(b.request.created_at) - new Date(a.request.created_at));

        attivitaRicevute = ricevuteFlat;
        attivitaInviate = inviateFlat;

        renderLista();

    } catch (error) {
        console.error("Errore caricamento attività:", error);
        listaAttivita.innerHTML = `<p style="color:#DC2626; text-align:center; padding:30px;">Errore nel caricamento delle attività.</p>`;
        await logError({
            source: 'mercatino_attivita', action: 'fetch_activities',
            errorMessage: error.message, errorCode: error.code || 'FETCH_ACTIVITIES_ERROR',
            context: { user_id: currentUser.id }
        });
    }
}

// ==========================================
// RENDER LISTA
// ==========================================
function renderLista() {
    const lista = tabAttiva === 'ricevute' ? attivitaRicevute : attivitaInviate;
    listaAttivita.innerHTML = '';

    if (lista.length === 0) {
        listaAttivita.innerHTML = `
            <div style="background:#fff; border-radius:16px; padding:30px; text-align:center; border:1px dashed #CBD5E1;">
                <p style="color:#64748B; margin:0;">${tabAttiva === 'ricevute' ? 'Nessuna richiesta ricevuta finora.' : 'Non hai ancora manifestato interesse per nessun annuncio.'}</p>
            </div>
        `;
        return;
    }

    lista.forEach(item => listaAttivita.appendChild(creaCardAttivita(item)));
}

function creaCardAttivita(item) {
    const { request, listing, otherProfile, ruolo } = item;
    const stato = STATO_LABEL[request.status] || { testo: request.status, colore: '#64748B', bg: '#F1F5F9' };
    const nomeAltro = otherProfile?.nome || 'Utente';

    const card = document.createElement('div');
    card.className = 'attivita-card';
    card.innerHTML = `
        <div style="display:flex; gap:12px; align-items:center;">
            <img src="${copertinaListing(listing)}" style="width:50px; height:50px; border-radius:10px; object-fit:cover; flex-shrink:0;">
            <div style="flex:1; min-width:0;">
                <div style="font-weight:700; color:#1E293B; font-size:0.92rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(listing.title)}</div>
                <div style="color:#64748B; font-size:0.8rem; margin-top:2px;">${ruolo === 'ricevuta' ? 'Da' : 'A'} ${escapeHtml(nomeAltro)}</div>
            </div>
            <span style="background:${stato.bg}; color:${stato.colore}; font-size:0.72rem; font-weight:700; padding:4px 10px; border-radius:20px; flex-shrink:0;">${stato.testo}</span>
        </div>
    `;
    card.addEventListener('click', () => apriDettaglio(item));
    return card;
}

// ==========================================
// APERTURA DETTAGLIO / CHAT
// ==========================================
async function apriDettaglio(item) {
    dettaglioTitolo.textContent = item.listing.title;
    dettaglioBody.innerHTML = `<div style="text-align:center; padding:30px;"><i class="fa-solid fa-spinner fa-spin"></i></div>`;
    dettaglioModal.style.display = 'flex';

    try {
        let giveaway = null, rating = null, messages = [];

        if (item.request.status === 'ACCEPTED') {
            const { data: g } = await supabase
                .from('marketplace_giveaways')
                .select('*')
                .eq('request_id', item.request.id)
                .maybeSingle();
            giveaway = g || null;

            if (giveaway) {
                const { data: r } = await supabase
                    .from('marketplace_ratings')
                    .select('*')
                    .eq('giveaway_id', giveaway.id)
                    .maybeSingle();
                rating = r || null;
            }

            const { data: msgs } = await supabase
                .from('marketplace_chat_messages')
                .select('id, sender_user_id, body, created_at')
                .eq('request_id', item.request.id)
                .order('created_at', { ascending: true });
            messages = msgs || [];
        }

        ctxAperto = { ...item, giveaway, rating, messages };
        renderDettaglioBody(ctxAperto);

    } catch (error) {
        console.error("Errore apertura dettaglio:", error);
        dettaglioBody.innerHTML = `<p style="color:#DC2626; text-align:center;">Errore nel caricamento del dettaglio.</p>`;
        await logError({
            source: 'mercatino_attivita', action: 'open_detail',
            errorMessage: error.message, errorCode: error.code || 'OPEN_DETAIL_ERROR',
            context: { request_id: item.request.id }
        });
    }
}

function chiudiDettaglio() {
    dettaglioModal.style.display = 'none';
    ctxAperto = null;
}

// ==========================================
// RENDER DETTAGLIO
// ==========================================
function renderDettaglioBody(ctx) {
    const { request, listing, otherProfile, ruolo } = ctx;
    const isOwner = ruolo === 'ricevuta';
    const nomeAltro = otherProfile?.nome || 'Utente';

    let html = `
        <div style="display:flex; gap:12px; align-items:center; background:#fff; border-radius:14px; padding:12px; margin-bottom:16px;">
            <img src="${copertinaListing(listing)}" style="width:50px; height:50px; border-radius:10px; object-fit:cover;">
            <div>
                <div style="font-weight:700; color:#1E293B; font-size:0.9rem;">${escapeHtml(listing.title)}</div>
                <div style="color:#64748B; font-size:0.78rem;">${isOwner ? 'Richiesta di' : 'Annuncio di'} ${escapeHtml(nomeAltro)}</div>
            </div>
        </div>
    `;

    if (request.status === 'PENDING') {
        html += `
            <div style="background:#fff; border-radius:14px; padding:16px; margin-bottom:14px;">
                <div style="font-size:0.7rem; color:#94A3B8; margin-bottom:4px;">Messaggio</div>
                <p style="margin:0; color:#334155; font-size:0.9rem;">${escapeHtml(request.message || '(nessun messaggio)')}</p>
            </div>
        `;
        if (isOwner) {
            html += `
                <div style="display:flex; gap:10px;">
                    <button type="button" id="btnAccetta" style="flex:1; background:#16A34A; color:#fff; border:none; padding:14px; border-radius:12px; font-weight:700; cursor:pointer;">Accetta</button>
                    <button type="button" id="btnRifiuta" style="flex:1; background:#F1F5F9; color:#475569; border:none; padding:14px; border-radius:12px; font-weight:700; cursor:pointer;">Rifiuta</button>
                </div>
            `;
        } else {
            html += `
                <div style="color:#D97706; text-align:center; font-weight:600; margin-bottom:10px;">In attesa di risposta dal donatore.</div>
                <button type="button" id="btnAnnullaRichiesta" style="width:100%; background:transparent; color:#94A3B8; border:1px solid #E2E8F0; padding:12px; border-radius:12px; font-weight:600; cursor:pointer;">Annulla la mia richiesta</button>
            `;
        }
    } else if (request.status === 'REJECTED') {
        html += `<div style="background:#FEE2E2; color:#EF4444; border-radius:12px; padding:14px; text-align:center; font-weight:600;">Richiesta rifiutata.</div>`;
    } else if (request.status === 'CANCELLED') {
        html += `<div style="background:#F1F5F9; color:#64748B; border-radius:12px; padding:14px; text-align:center; font-weight:600;">Richiesta annullata.</div>`;
    } else if (request.status === 'ACCEPTED') {
        html += renderChat(ctx, isOwner, nomeAltro);
        html += renderGestioneConsegna(ctx, isOwner, nomeAltro);
    }

    dettaglioBody.innerHTML = html;
    wireDettaglioEvents(ctx, isOwner);
}

// ==========================================
// CHAT (con regola dei turni alternati)
// ==========================================
function ultimoMittente(messages, request) {
    if (messages.length > 0) return messages[messages.length - 1].sender_user_id;
    // Il messaggio iniziale della richiesta conta come primo turno del richiedente:
    // appena la chat si apre tocca sempre al donatore rispondere per primo.
    return request.requester_user_id;
}

function possoScrivere(messages, request) {
    return ultimoMittente(messages, request) !== currentUser.id;
}

function renderChat(ctx, isOwner, nomeAltro) {
    const { request, messages } = ctx;

    const bolle = messages.map(m => {
        const mine = m.sender_user_id === currentUser.id;
        return `<div class="chat-bubble ${mine ? 'mine' : 'other'}">${escapeHtml(m.body)}</div>`;
    }).join('');

    const posso = possoScrivere(messages, request);

    return `
        <div id="chatThread" style="background:#F1F5F9; border-radius:14px; padding:12px; margin-bottom:10px; max-height:260px; overflow-y:auto; display:flex; flex-direction:column;">
            <div class="chat-bubble other" style="opacity:0.85;">
                <div style="font-size:0.68rem; opacity:0.7; margin-bottom:2px;">Messaggio iniziale</div>
                ${escapeHtml(request.message || '(nessun messaggio)')}
            </div>
            ${bolle}
        </div>
        <div id="chatAvviso" style="color:#D97706; font-size:0.78rem; margin-bottom:8px;" hidden></div>
        <div style="display:flex; gap:8px; margin-bottom:16px;">
            <input type="text" id="chatInput" placeholder="${posso ? 'Scrivi un messaggio...' : `In attesa della risposta di ${escapeHtml(nomeAltro)}...`}" ${posso ? '' : 'disabled'}
                style="flex:1; padding:12px; border:1px solid #E2E8F0; border-radius:12px; box-sizing:border-box; background:${posso ? '#fff' : '#F1F5F9'};">
            <button type="button" id="btnInviaChat" ${posso ? '' : 'disabled'}
                style="background:${posso ? '#F58220' : '#CBD5E1'}; color:#fff; border:none; width:46px; border-radius:12px; cursor:${posso ? 'pointer' : 'not-allowed'}; flex-shrink:0;">
                <i class="fa-solid fa-paper-plane"></i>
            </button>
        </div>
    `;
}

// ==========================================
// GESTIONE CONSEGNA E VALUTAZIONE
// ==========================================
function renderGestioneConsegna(ctx, isOwner, nomeAltro) {
    const { giveaway, rating } = ctx;

    if (!giveaway) {
        if (isOwner) {
            return `
                <button type="button" id="btnConsegnato" style="width:100%; background:#1E293B; color:#fff; border:none; padding:14px; border-radius:12px; font-weight:700; cursor:pointer;">
                    <i class="fa-solid fa-box-open"></i> Oggetto consegnato
                </button>
            `;
        }
        return '';
    }

    if (giveaway.status === 'AWAITING_CONFIRMATION') {
        if (isOwner) {
            return `
                <div style="background:#FEF3C7; color:#92400E; border-radius:12px; padding:14px; text-align:center; font-weight:600; margin-bottom:8px;">
                    In attesa che ${escapeHtml(nomeAltro)} confermi la ricezione.
                </div>
                <button type="button" id="btnPromemoria" style="width:100%; background:transparent; color:#64748B; border:1px solid #E2E8F0; padding:12px; border-radius:12px; font-weight:600; cursor:pointer;">
                    Invia un promemoria in chat
                </button>
            `;
        }
        return `
            <div style="background:#fff; border-radius:14px; padding:16px;">
                <p style="margin:0 0 12px 0; font-weight:700; color:#1E293B;">Confermi di aver ricevuto l'oggetto?</p>
                <div style="display:flex; gap:8px; margin-bottom:8px;">
                    <button type="button" id="btnConfermo" style="flex:1; background:#16A34A; color:#fff; border:none; padding:12px; border-radius:10px; font-weight:700; cursor:pointer;">Confermo</button>
                    <button type="button" id="btnNonConfermo" style="flex:1; background:#F1F5F9; color:#475569; border:none; padding:12px; border-radius:10px; font-weight:700; cursor:pointer;">Non confermo</button>
                </div>
                <button type="button" id="btnSegnalaProblema" style="width:100%; background:transparent; color:#EF4444; border:none; padding:8px; font-weight:600; cursor:pointer; font-size:0.85rem;">Segnala un problema</button>
            </div>
        `;
    }

    if (giveaway.status === 'COMPLETED') {
        let html = `<div style="background:#F0FDF4; color:#16A34A; border-radius:12px; padding:14px; text-align:center; font-weight:600; margin-bottom:10px;"><i class="fa-solid fa-circle-check"></i> Cessione completata.</div>`;
        if (!isOwner) {
            if (rating) {
                html += `<div style="text-align:center; color:#475569; font-size:0.9rem;">Hai valutato questa cessione: <strong>${rating.score}/5</strong></div>`;
            } else {
                html += renderFormValutazione();
            }
        }
        return html;
    }

    if (giveaway.status === 'DISPUTED') {
        return `<div style="background:#FEE2E2; color:#EF4444; border-radius:12px; padding:14px; text-align:center; font-weight:600;">Segnalazione aperta. Il team di Veterinari.it verificherà la situazione.</div>`;
    }

    return '';
}

function renderFormValutazione() {
    return `
        <div style="background:#fff; border-radius:14px; padding:16px;">
            <p style="margin:0 0 12px 0; font-weight:700; color:#1E293B; font-size:0.9rem;">Come valuti l'affidabilità di chi ti ha regalato l'oggetto?</p>
            <div id="ratingDots" style="margin-bottom:14px;">
                ${[0, 1, 2, 3, 4, 5].map(n => `<span class="rating-dot" data-score="${n}">${n}</span>`).join('')}
            </div>
            <textarea id="notaPrivata" rows="2" placeholder="Nota privata (facoltativa, visibile solo a te)" style="width:100%; padding:10px; border:1px solid #E2E8F0; border-radius:10px; box-sizing:border-box; font-family:inherit; margin-bottom:10px;"></textarea>
            <button type="button" id="btnInviaValutazione" disabled style="width:100%; background:#CBD5E1; color:#fff; border:none; padding:12px; border-radius:12px; font-weight:700; cursor:not-allowed;">Invia valutazione</button>
        </div>
    `;
}

// ==========================================
// WIRING EVENTI DEL DETTAGLIO
// ==========================================
function wireDettaglioEvents(ctx, isOwner) {
    const { request, listing, giveaway } = ctx;

    const btnAccetta = document.getElementById('btnAccetta');
    if (btnAccetta) btnAccetta.addEventListener('click', () => rispondiRichiesta(request.id, listing.id, 'ACCEPTED'));

    const btnRifiuta = document.getElementById('btnRifiuta');
    if (btnRifiuta) btnRifiuta.addEventListener('click', () => rispondiRichiesta(request.id, listing.id, 'REJECTED'));

    const btnAnnulla = document.getElementById('btnAnnullaRichiesta');
    if (btnAnnulla) btnAnnulla.addEventListener('click', () => annullaRichiesta(request.id));

    const btnInviaChat = document.getElementById('btnInviaChat');
    const chatInput = document.getElementById('chatInput');
    if (btnInviaChat && chatInput) {
        const invia = () => inviaMessaggioChat(request.id, chatInput);
        btnInviaChat.addEventListener('click', invia);
        chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') invia(); });
        chatInput.addEventListener('input', () => {
            const avviso = document.getElementById('chatAvviso');
            if (contieneDatiPersonali(chatInput.value)) {
                avviso.textContent = AVVISO_DATI_PERSONALI;
                avviso.hidden = false;
            } else {
                avviso.hidden = true;
            }
        });
    }

    const btnConsegnato = document.getElementById('btnConsegnato');
    if (btnConsegnato) btnConsegnato.addEventListener('click', () => segnaConsegnato(ctx));

    const btnPromemoria = document.getElementById('btnPromemoria');
    if (btnPromemoria) btnPromemoria.addEventListener('click', () => inviaPromemoria(request.id));

    const btnConfermo = document.getElementById('btnConfermo');
    if (btnConfermo) btnConfermo.addEventListener('click', () => confermaRicezione(ctx));

    const btnNonConfermo = document.getElementById('btnNonConfermo');
    if (btnNonConfermo) btnNonConfermo.addEventListener('click', () => alert("Va bene, l'accordo resta in sospeso. Puoi continuare a scrivere in chat con il donatore."));

    const btnSegnalaProblema = document.getElementById('btnSegnalaProblema');
    if (btnSegnalaProblema) btnSegnalaProblema.addEventListener('click', () => segnalaProblema(ctx));

    const ratingDots = document.getElementById('ratingDots');
    if (ratingDots) {
        let punteggioScelto = null;
        ratingDots.querySelectorAll('.rating-dot').forEach(dot => {
            dot.addEventListener('click', () => {
                punteggioScelto = parseInt(dot.dataset.score, 10);
                ratingDots.querySelectorAll('.rating-dot').forEach(d => d.classList.remove('selected'));
                ratingDots.querySelectorAll('.rating-dot').forEach(d => {
                    if (parseInt(d.dataset.score, 10) <= punteggioScelto) d.classList.add('selected');
                });
                const btn = document.getElementById('btnInviaValutazione');
                btn.disabled = false;
                btn.style.background = '#F58220';
                btn.style.cursor = 'pointer';
                btn.dataset.score = punteggioScelto;
            });
        });

        const btnInviaValutazione = document.getElementById('btnInviaValutazione');
        btnInviaValutazione.addEventListener('click', () => {
            const score = parseInt(btnInviaValutazione.dataset.score, 10);
            const notaPrivata = document.getElementById('notaPrivata').value.trim();
            inviaValutazione(ctx, score, notaPrivata);
        });
    }
}

// ==========================================
// AZIONI: ACCETTA / RIFIUTA / ANNULLA
// ==========================================
async function rispondiRichiesta(requestId, listingId, nuovoStato) {
    try {
        const updateRequest = { status: nuovoStato };
        if (nuovoStato === 'ACCEPTED') updateRequest.accepted_at = new Date().toISOString();
        if (nuovoStato === 'REJECTED') updateRequest.rejected_at = new Date().toISOString();

        const { error: reqError } = await supabase.from('marketplace_requests').update(updateRequest).eq('id', requestId);
        if (reqError) throw reqError;

        if (nuovoStato === 'ACCEPTED') {
            const { error: listingError } = await supabase
                .from('marketplace_listings')
                .update({ status: 'RESERVED', selected_request_id: requestId })
                .eq('id', listingId);
            if (listingError) throw listingError;
        }

        chiudiDettaglio();
        await caricaTutto();

    } catch (error) {
        console.error("Errore risposta richiesta:", error);
        alert("Errore durante l'operazione. Riprova.");
        await logError({
            source: 'mercatino_attivita', action: 'respond_request',
            errorMessage: error.message, errorCode: error.code || 'RESPOND_REQUEST_ERROR',
            context: { request_id: requestId, nuovo_stato: nuovoStato }
        });
    }
}

async function annullaRichiesta(requestId) {
    if (!confirm("Vuoi annullare questa richiesta?")) return;
    try {
        const { error } = await supabase
            .from('marketplace_requests')
            .update({ status: 'CANCELLED', cancelled_at: new Date().toISOString() })
            .eq('id', requestId);
        if (error) throw error;

        chiudiDettaglio();
        await caricaTutto();
    } catch (error) {
        console.error("Errore annullamento richiesta:", error);
        alert("Errore durante l'annullamento. Riprova.");
    }
}

// ==========================================
// AZIONI: CHAT
// ==========================================
async function inviaMessaggioChat(requestId, inputEl) {
    const testo = inputEl.value.trim();
    if (!testo) return;

    const avviso = document.getElementById('chatAvviso');

    const { bloccato } = verificaCampi(testo);
    if (bloccato) {
        avviso.textContent = MESSAGGIO_BLOCCO;
        avviso.hidden = false;
        return;
    }

    const contieneDati = contieneDatiPersonali(testo);

    try {
        const { error } = await supabase
            .from('marketplace_chat_messages')
            .insert({
                request_id: requestId,
                sender_user_id: currentUser.id,
                body: testo,
                contains_personal_data: contieneDati
            });

        if (error) throw error;

        inputEl.value = '';
        // Ricarica solo il dettaglio corrente per aggiornare la chat e lo stato dei turni
        await ricaricaDettaglioAperto();

    } catch (error) {
        console.error("Errore invio messaggio:", error);
        if (error.message && error.message.includes('row-level security')) {
            avviso.textContent = "Non puoi ancora scrivere: aspetta la risposta dell'altro utente.";
        } else {
            avviso.textContent = "Errore durante l'invio del messaggio. Riprova.";
        }
        avviso.hidden = false;
        await logError({
            source: 'mercatino_attivita', action: 'send_chat_message',
            errorMessage: error.message, errorCode: error.code || 'SEND_CHAT_ERROR',
            context: { request_id: requestId }
        });
    }
}

async function inviaPromemoria(requestId) {
    try {
        const { error } = await supabase
            .from('marketplace_chat_messages')
            .insert({
                request_id: requestId,
                sender_user_id: currentUser.id,
                body: "Promemoria: confermi di aver ricevuto l'oggetto?",
                contains_personal_data: false
            });
        if (error) throw error;
        await ricaricaDettaglioAperto();
    } catch (error) {
        console.error("Errore invio promemoria:", error);
        alert("Non è stato possibile inviare il promemoria (probabilmente non è ancora il tuo turno in chat).");
    }
}

async function ricaricaDettaglioAperto() {
    if (!ctxAperto) return;
    await apriDettaglio(ctxAperto);
}

// ==========================================
// AZIONI: CONSEGNA / CONFERMA / SEGNALAZIONE
// ==========================================
async function segnaConsegnato(ctx) {
    const { request, listing } = ctx;
    try {
        const { error } = await supabase
            .from('marketplace_giveaways')
            .insert({
                listing_id: listing.id,
                request_id: request.id,
                giver_user_id: currentUser.id,
                receiver_user_id: request.requester_user_id,
                status: 'AWAITING_CONFIRMATION',
                giver_confirmed_at: new Date().toISOString()
            });

        if (error) throw error;

        await supabase.from('marketplace_listings').update({ status: 'DELIVERED', delivered_at: new Date().toISOString() }).eq('id', listing.id);

        await ricaricaDettaglioAperto();

    } catch (error) {
        console.error("Errore segnalazione consegna:", error);
        alert("Errore durante l'operazione. Riprova.");
        await logError({
            source: 'mercatino_attivita', action: 'mark_delivered',
            errorMessage: error.message, errorCode: error.code || 'MARK_DELIVERED_ERROR',
            context: { request_id: request.id }
        });
    }
}

async function confermaRicezione(ctx) {
    const { giveaway, listing } = ctx;
    try {
        const oraCorrente = new Date().toISOString();

        const { error } = await supabase
            .from('marketplace_giveaways')
            .update({ receiver_confirmed_at: oraCorrente, status: 'COMPLETED', completed_at: oraCorrente })
            .eq('id', giveaway.id);

        if (error) throw error;

        await supabase.from('marketplace_listings').update({ status: 'ARCHIVED' }).eq('id', listing.id);

        await ricaricaDettaglioAperto();

    } catch (error) {
        console.error("Errore conferma ricezione:", error);
        alert("Errore durante la conferma. Riprova.");
        await logError({
            source: 'mercatino_attivita', action: 'confirm_receipt',
            errorMessage: error.message, errorCode: error.code || 'CONFIRM_RECEIPT_ERROR',
            context: { giveaway_id: giveaway.id }
        });
    }
}

async function segnalaProblema(ctx) {
    const motivo = prompt("Descrivi brevemente il problema:");
    if (!motivo || !motivo.trim()) return;

    try {
        const { error: reportError } = await supabase
            .from('marketplace_reports')
            .insert({ giveaway_id: ctx.giveaway.id, reporter_user_id: currentUser.id, reason: motivo.trim() });
        if (reportError) throw reportError;

        const { error: giveawayError } = await supabase
            .from('marketplace_giveaways')
            .update({ status: 'DISPUTED' })
            .eq('id', ctx.giveaway.id);
        if (giveawayError) throw giveawayError;

        alert("Segnalazione inviata. Il team di Veterinari.it verificherà la situazione.");
        await ricaricaDettaglioAperto();

    } catch (error) {
        console.error("Errore segnalazione:", error);
        alert("Errore durante l'invio della segnalazione. Riprova.");
        await logError({
            source: 'mercatino_attivita', action: 'report_issue',
            errorMessage: error.message, errorCode: error.code || 'REPORT_ERROR',
            context: { giveaway_id: ctx.giveaway.id }
        });
    }
}

async function inviaValutazione(ctx, score, notaPrivata) {
    const { giveaway } = ctx;
    try {
        const { error } = await supabase
            .from('marketplace_ratings')
            .insert({
                giveaway_id: giveaway.id,
                reviewer_user_id: currentUser.id,
                reviewed_user_id: giveaway.giver_user_id,
                score: score,
                reliability_points_awarded: score,
                private_note: notaPrivata || null
            });

        if (error) throw error;

        await ricaricaDettaglioAperto();

    } catch (error) {
        console.error("Errore invio valutazione:", error);
        alert("Errore durante l'invio della valutazione. Riprova.");
        await logError({
            source: 'mercatino_attivita', action: 'submit_rating',
            errorMessage: error.message, errorCode: error.code || 'SUBMIT_RATING_ERROR',
            context: { giveaway_id: giveaway.id }
        });
    }
}

initPagina();