// ==========================================
// 1. IMPORT CENTRALIZZATI
// ==========================================
import { supabase } from '../utils/supabaseClient.js';
import { logError } from '../utils/logger.js';
import { checkApprovalStatus, showApprovalPendingOverlay } from '../utils/approvalGuard.js';

let currentUser = null;
let campaignIds = [];

// Elementi DOM
const nomeAzienda = document.getElementById('nomeAzienda');
const testoReach = document.getElementById('testoReach');
const statVisualizzazioni = document.getElementById('statVisualizzazioni');
const statClic = document.getElementById('statClic');
const deltaVisualizzazioni = document.getElementById('deltaVisualizzazioni');
const deltaClic = document.getElementById('deltaClic');
const campagnaAttivaContainer = document.getElementById('campagnaAttivaContainer');

// ==========================================
// UTILITY DATE
// ==========================================
function startOfDay(d) { const nd = new Date(d); nd.setHours(0, 0, 0, 0); return nd; }
function addDays(d, n) { const nd = new Date(d); nd.setDate(nd.getDate() + n); return nd; }
function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }

// ==========================================
// INIZIALIZZAZIONE PAGINA
// ==========================================
async function init() {
    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) throw Object.assign(new Error(authError.message), { code: authError.code || 'AUTH_SYS_ERROR' });
        if (!user) {
            window.location.href = "../../index.html";
            return;
        }
        currentUser = user;

           const { isApproved, hasProfile } = await checkApprovalStatus(currentUser.id, 'sponsor');
        if (!isApproved) {
            showApprovalPendingOverlay(document.querySelector('.app-container'), 'sponsor', hasProfile);
            return; // Blocca il resto della dashboard: niente disponibilità, niente agenda
        }

        const { data: sponsor, error: sponsorError } = await supabase
            .from('sponsors')
            .select('nome_azienda')
            .eq('user_id', user.id)
            .single();

        if (sponsorError) throw Object.assign(new Error(sponsorError.message), { code: sponsorError.code || 'DB_FETCH_SPONSOR_ERROR' });

        nomeAzienda.textContent = sponsor.nome_azienda;

        // Tutte le campagne di questo sponsor (ci servono gli ID per filtrare gli eventi)
        const { data: campagne, error: campagneError } = await supabase
            .from('sponsor_campaigns')
            .select('id, title, banner_type, target_city, target_radius_km, start_date, end_date, status')
            .eq('sponsor_id', user.id);

        if (campagneError) throw Object.assign(new Error(campagneError.message), { code: campagneError.code || 'DB_FETCH_CAMPAIGNS_ERROR' });

        campaignIds = (campagne || []).map(c => c.id);

        if (campaignIds.length === 0) {
            testoReach.textContent = "Non hai ancora nessuna campagna. Creane una per iniziare a raggiungere nuovi utenti.";
            statVisualizzazioni.textContent = "0";
            statClic.textContent = "0";
            campagnaAttivaContainer.innerHTML = `<div class="sp-empty">Nessuna campagna al momento.<br><a href="campagne.html" style="color:#F58220; font-weight:700;">Crea la tua prima campagna</a></div>`;
            return;
        }

        await caricaStatistiche();
        await caricaCampagnaAttiva(campagne);

    } catch (error) {
        console.error("Errore inizializzazione dashboard sponsor:", error);
        nomeAzienda.textContent = "Errore di caricamento";
        testoReach.textContent = "Riprova più tardi.";
        await logError({
            source: 'dashboard_sponsor',
            action: 'init_page',
            errorMessage: error.message || "Errore imprevisto nel caricamento della dashboard sponsor",
            errorCode: error.code || 'UNKNOWN_SYS_ERROR',
            context: { sponsorId: currentUser?.id }
        });
    }
}

// ==========================================
// STATISTICHE RAPIDE (ultimi 30gg vs 30gg precedenti)
// ==========================================
async function caricaStatistiche() {
    const oggi = startOfDay(new Date());
    const inizioPeriodoCorrente = addDays(oggi, -29); // ultimi 30 giorni (incluso oggi)
    const inizioPeriodoPrecedente = addDays(inizioPeriodoCorrente, -30);

    // Un'unica query sugli ultimi 60gg, poi dividiamo in JS tra periodo
    // corrente e precedente (evita due andata-ritorno separati al DB).
    const { data: eventi, error } = await supabase
        .from('campaign_events')
        .select('event_type, created_at')
        .in('campaign_id', campaignIds)
        .gte('created_at', inizioPeriodoPrecedente.toISOString());

    if (error) throw Object.assign(new Error(error.message), { code: error.code || 'DB_FETCH_EVENTS_ERROR' });

    let impCorrente = 0, clicCorrente = 0, impPrecedente = 0, clicPrecedente = 0;

    (eventi || []).forEach(e => {
        const data = new Date(e.created_at);
        const inCorrente = data >= inizioPeriodoCorrente;
        if (e.event_type === 'impression') {
            inCorrente ? impCorrente++ : impPrecedente++;
        } else if (e.event_type === 'click') {
            inCorrente ? clicCorrente++ : clicPrecedente++;
        }
    });

    statVisualizzazioni.textContent = formattaNumero(impCorrente);
    statClic.textContent = formattaNumero(clicCorrente);

    mostraDelta(deltaVisualizzazioni, impCorrente, impPrecedente);
    mostraDelta(deltaClic, clicCorrente, clicPrecedente);

        // "Visualizzazioni questo mese" = numero di impression nel mese solare corrente.
    // Non è un conteggio di utenti unici: non tracciamo l'identità di chi vede il
    // banner, quindi lo stesso utente può contribuire più volte a questo numero.
    const inizioMese = startOfMonth(new Date());
    const impQuestoMese = (eventi || []).filter(e => e.event_type === 'impression' && new Date(e.created_at) >= inizioMese).length;
    testoReach.textContent = `Le tue campagne hanno totalizzato ${formattaNumero(impQuestoMese)} visualizzazioni questo mese.`;
}

function mostraDelta(el, valoreCorrente, valorePrecedente) {
    if (valorePrecedente === 0) {
        el.hidden = true;
        return;
    }
    const variazione = ((valoreCorrente - valorePrecedente) / valorePrecedente) * 100;
    const segno = variazione >= 0 ? '+' : '';
    el.textContent = `${segno}${Math.round(variazione)}%`;
    el.className = 'stat-card__delta' + (variazione < 0 ? ' stat-card__delta--down' : '');
    el.hidden = false;
}

function formattaNumero(n) {
    if (n >= 1000) return (n / 1000).toFixed(1).replace('.', ',') + 'K';
    return String(n);
}

// ==========================================
// CAMPAGNA ATTIVA (la più recente tra quelle in corso oggi)
// ==========================================
async function caricaCampagnaAttiva(campagne) {
    const oggiStr = new Date().toISOString().split('T')[0];

    const attive = campagne.filter(c => c.status === 'ACTIVE' && c.start_date <= oggiStr && c.end_date >= oggiStr);

    if (attive.length === 0) {
        campagnaAttivaContainer.innerHTML = `<div class="sp-empty">Nessuna campagna attiva al momento.<br><a href="campagne.html" style="color:#F58220; font-weight:700;">Vai a Campagne</a></div>`;
        return;
    }

    const campagna = attive[attive.length - 1];

    const { data: eventiCampagna, error } = await supabase
        .from('campaign_events')
        .select('event_type')
        .eq('campaign_id', campagna.id);

    if (error) throw Object.assign(new Error(error.message), { code: error.code || 'DB_FETCH_CAMPAIGN_EVENTS_ERROR' });

    const impressions = (eventiCampagna || []).filter(e => e.event_type === 'impression').length;
    const clicks = (eventiCampagna || []).filter(e => e.event_type === 'click').length;

    const inizio = new Date(campagna.start_date);
    const fine = new Date(campagna.end_date);
    const oggi = new Date();
    const percentuale = Math.min(100, Math.max(0, ((oggi - inizio) / (fine - inizio)) * 100));

    const etichettaBanner = campagna.banner_type === 'banner_app' ? 'Banner app' : campagna.banner_type;
    const raggioTesto = campagna.target_radius_km ? ` · raggio ${campagna.target_radius_km} km` : '';
    const dataInizioStr = inizio.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
    const dataFineStr = fine.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });

    campagnaAttivaContainer.innerHTML = `
        <div class="campaign-card">
            <span class="campaign-card__tag">${escapeHtml(etichettaBanner)}</span>
            <h3 class="campaign-card__title">${escapeHtml(campagna.title)}</h3>
            <div class="campaign-card__meta">${escapeHtml(campagna.target_city)}${raggioTesto} · ${dataInizioStr} - ${dataFineStr}</div>
            <div class="campaign-card__progress">
                <div class="campaign-card__progress-fill" style="width:${percentuale}%;"></div>
            </div>
            <div class="campaign-card__stats">
                <span>${formattaNumero(impressions)} impression</span>
                <span><strong>${formattaNumero(clicks)}</strong> clic</span>
            </div>
        </div>
    `;
}

function escapeHtml(str) {
    if (typeof str !== 'string') return str;
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

init();