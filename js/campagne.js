// ==========================================
// 1. IMPORT CENTRALIZZATI
// ==========================================
import { supabase } from '../utils/supabaseClient.js';
import { logError } from '../utils/logger.js';

let currentUser = null;

// Elementi DOM - liste
const listaAttive = document.getElementById('listaAttive');
const listaConcluse = document.getElementById('listaConcluse');

// Elementi DOM - modale
const modalOverlay = document.getElementById('modalOverlay');
const btnNuovaCampagna = document.getElementById('btnNuovaCampagna');
const btnAnnullaModale = document.getElementById('btnAnnullaModale');
const formNuovaCampagna = document.getElementById('formNuovaCampagna');
const inputTitolo = document.getElementById('inputTitolo');
const selBannerType = document.getElementById('selBannerType');
const inputCitta = document.getElementById('inputCitta');
const inputRaggio = document.getElementById('inputRaggio');
const inputDataInizio = document.getElementById('inputDataInizio');
const inputDataFine = document.getElementById('inputDataFine');
const formStatus = document.getElementById('formStatus');
const btnConfermaCampagna = document.getElementById('btnConfermaCampagna');

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

        // Verifica che l'account sia effettivamente registrato come sponsor
        const { data: sponsor, error: sponsorError } = await supabase
            .from('sponsors')
            .select('user_id')
            .eq('user_id', user.id)
            .single();

        if (sponsorError) throw Object.assign(new Error(sponsorError.message), { code: sponsorError.code || 'DB_FETCH_SPONSOR_ERROR' });
        if (!sponsor) {
            alert("Il tuo account non risulta registrato come sponsor.");
            window.location.href = "../../index.html";
            return;
        }

        // Imposta la data odierna come minimo selezionabile per l'inizio campagna
        const oggiStr = new Date().toISOString().split('T')[0];
        inputDataInizio.min = oggiStr;
        inputDataInizio.value = oggiStr;
        inputDataFine.min = oggiStr;

        await caricaCampagne();

    } catch (error) {
        console.error("Errore inizializzazione campagne:", error);
        listaAttive.innerHTML = `<div class="sp-empty">Errore nel caricamento delle campagne.</div>`;
        listaConcluse.innerHTML = '';
        await logError({
            source: 'campagne_sponsor',
            action: 'init_page',
            errorMessage: error.message || "Errore imprevisto nel caricamento delle campagne",
            errorCode: error.code || 'UNKNOWN_SYS_ERROR',
            context: { sponsorId: currentUser?.id }
        });
    }
}

// ==========================================
// CARICAMENTO CAMPAGNE + STATISTICHE
// ==========================================
async function caricaCampagne() {
    listaAttive.innerHTML = `<div class="sp-skeleton"><i class="fa-solid fa-spinner fa-spin"></i> Caricamento...</div>`;
    listaConcluse.innerHTML = `<div class="sp-skeleton"><i class="fa-solid fa-spinner fa-spin"></i> Caricamento...</div>`;

    try {
        const { data: campagne, error } = await supabase
            .from('sponsor_campaigns')
            .select('id, title, banner_type, target_city, target_radius_km, start_date, end_date, status')
            .eq('sponsor_id', currentUser.id)
            .order('created_at', { ascending: false });

        if (error) throw Object.assign(new Error(error.message), { code: error.code || 'DB_FETCH_CAMPAIGNS_ERROR' });

        if (!campagne || campagne.length === 0) {
            listaAttive.innerHTML = `<div class="sp-empty">Nessuna campagna attiva. Creane una con "+ Nuova".</div>`;
            listaConcluse.innerHTML = `<div class="sp-empty">Nessuna campagna conclusa finora.</div>`;
            return;
        }

        // Statistiche di tutte le campagne in un'unica query, aggregate poi in JS
        const campaignIds = campagne.map(c => c.id);
        const { data: eventi, error: eventiError } = await supabase
            .from('campaign_events')
            .select('campaign_id, event_type')
            .in('campaign_id', campaignIds);

        if (eventiError) throw Object.assign(new Error(eventiError.message), { code: eventiError.code || 'DB_FETCH_EVENTS_ERROR' });

        const statsPerCampagna = new Map();
        (eventi || []).forEach(e => {
            if (!statsPerCampagna.has(e.campaign_id)) statsPerCampagna.set(e.campaign_id, { impressions: 0, clicks: 0 });
            const s = statsPerCampagna.get(e.campaign_id);
            if (e.event_type === 'impression') s.impressions++;
            else if (e.event_type === 'click') s.clicks++;
        });

        const oggiStr = new Date().toISOString().split('T')[0];
        const attive = campagne.filter(c => c.status === 'ACTIVE' && c.end_date >= oggiStr);
        const concluse = campagne.filter(c => c.status !== 'ACTIVE' || c.end_date < oggiStr);

        renderLista(listaAttive, attive, statsPerCampagna, true, 'Nessuna campagna attiva. Creane una con "+ Nuova".');
        renderLista(listaConcluse, concluse, statsPerCampagna, false, 'Nessuna campagna conclusa finora.');

    } catch (error) {
        console.error("Errore caricamento campagne:", error);
        listaAttive.innerHTML = `<div class="sp-empty">Errore nel caricamento.</div>`;
        listaConcluse.innerHTML = '';
        await logError({
            source: 'campagne_sponsor',
            action: 'carica_campagne',
            errorMessage: error.message || "Errore durante il caricamento delle campagne",
            errorCode: error.code || 'UNKNOWN_DB_ERROR',
            context: { sponsorId: currentUser.id }
        });
    }
}

function renderLista(container, lista, statsPerCampagna, mostraProgresso, messaggioVuoto) {
    if (lista.length === 0) {
        container.innerHTML = `<div class="sp-empty">${messaggioVuoto}</div>`;
        return;
    }

    container.innerHTML = '';
    lista.forEach(c => container.appendChild(creaCardCampagna(c, statsPerCampagna.get(c.id) || { impressions: 0, clicks: 0 }, mostraProgresso)));
}

function creaCardCampagna(campagna, stats, mostraProgresso) {
    const div = document.createElement('div');
    div.className = 'campaign-card';

    const badgeClass = campagna.status === 'ACTIVE' && !mostraProgresso ? 'status-badge--paused' : (mostraProgresso ? 'status-badge--active' : 'status-badge--done');
    const badgeTesto = mostraProgresso ? 'Attiva' : (campagna.status === 'PAUSED' ? 'In pausa' : 'Conclusa');

    const etichettaBanner = campagna.banner_type === 'banner_app' ? 'Banner app' : campagna.banner_type;
    const raggioTesto = campagna.target_radius_km ? ` · raggio ${campagna.target_radius_km} km` : '';

    let progressoHtml = '';
    if (mostraProgresso) {
        const inizio = new Date(campagna.start_date);
        const fine = new Date(campagna.end_date);
        const oggi = new Date();
        const percentuale = Math.min(100, Math.max(0, ((oggi - inizio) / (fine - inizio)) * 100));
        progressoHtml = `
            <div class="campaign-card__progress">
                <div class="campaign-card__progress-fill" style="width:${percentuale}%;"></div>
            </div>
        `;
    }

    const dataInizioStr = new Date(campagna.start_date).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
    const dataFineStr = new Date(campagna.end_date).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });

    div.innerHTML = `
        <span class="status-badge ${badgeClass}">${badgeTesto}</span>
        <h3 class="campaign-card__title">${escapeHtml(campagna.title)}</h3>
        <div class="campaign-card__meta">${escapeHtml(etichettaBanner)} · ${escapeHtml(campagna.target_city)}${raggioTesto} · ${dataInizioStr} - ${dataFineStr}</div>
        ${progressoHtml}
        <div class="campaign-card__stats">
            <span>${stats.impressions.toLocaleString('it-IT')} impression</span>
            <span>${stats.clicks.toLocaleString('it-IT')} clic</span>
        </div>
    `;
    return div;
}

function escapeHtml(str) {
    if (typeof str !== 'string') return str;
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ==========================================
// MODALE: APERTURA / CHIUSURA
// ==========================================
btnNuovaCampagna.addEventListener('click', () => {
    modalOverlay.hidden = false;
});

btnAnnullaModale.addEventListener('click', chiudiModale);
modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) chiudiModale(); });

function chiudiModale() {
    modalOverlay.hidden = true;
    formNuovaCampagna.reset();
    formStatus.hidden = true;
    const oggiStr = new Date().toISOString().split('T')[0];
    inputDataInizio.value = oggiStr;
}

// ==========================================
// CREAZIONE NUOVA CAMPAGNA
// ==========================================
formNuovaCampagna.addEventListener('submit', async (e) => {
    e.preventDefault();
    formStatus.hidden = true;

    const titolo = inputTitolo.value.trim();
    const citta = inputCitta.value.trim();
    const raggio = inputRaggio.value ? parseInt(inputRaggio.value, 10) : null;
    const dataInizio = inputDataInizio.value;
    const dataFine = inputDataFine.value;

    if (!titolo || !citta || !dataInizio || !dataFine) {
        mostraStatus('Compila tutti i campi obbligatori.', false);
        return;
    }

    if (dataFine < dataInizio) {
        mostraStatus('La data di fine non può essere precedente alla data di inizio.', false);
        return;
    }

    btnConfermaCampagna.disabled = true;
    btnConfermaCampagna.textContent = 'Creazione...';

    try {
        const { error } = await supabase.from('sponsor_campaigns').insert({
            sponsor_id: currentUser.id,
            title: titolo,
            banner_type: selBannerType.value,
            target_city: citta,
            target_radius_km: raggio,
            start_date: dataInizio,
            end_date: dataFine,
            status: 'ACTIVE'
        });

        if (error) throw Object.assign(new Error(error.message), { code: error.code || 'DB_INSERT_CAMPAIGN_ERROR' });

        chiudiModale();
        await caricaCampagne();

    } catch (error) {
        console.error("Errore creazione campagna:", error);
        mostraStatus('Errore durante la creazione. Riprova.', false);
        await logError({
            source: 'campagne_sponsor',
            action: 'crea_campagna',
            errorMessage: error.message || "Errore durante l'inserimento della nuova campagna",
            errorCode: error.code || 'UNKNOWN_DB_ERROR',
            context: { sponsorId: currentUser.id, titolo, citta }
        });
    } finally {
        btnConfermaCampagna.disabled = false;
        btnConfermaCampagna.textContent = 'Crea campagna';
    }
});

function mostraStatus(testo, successo) {
    formStatus.textContent = testo;
    formStatus.className = 'sp-form-status ' + (successo ? 'sp-form-status--successo' : 'sp-form-status--errore');
    formStatus.hidden = false;
}

init();