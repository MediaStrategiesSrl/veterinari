// ==========================================
// 1. IMPORT CENTRALIZZATI
// ==========================================
import { supabase } from '../utils/supabaseClient.js';
import { logError } from '../utils/logger.js';
import { checkApprovalStatus, showApprovalPendingOverlay } from '../utils/approvalGuard.js';
import { SEZIONI_APP, etichettaSezioni } from '../utils/sezioniApp.js';
import { OFFERTE_SPONSOR, OFFERTA_DEFAULT, trovaOfferta, formattaEuro } from '../utils/offerteSponsor.js';

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
const checkboxSezioniContainer = document.getElementById('checkboxSezioni');
const radioOfferteContainer = document.getElementById('radioOfferte');
const inputTestoBanner = document.getElementById('inputTestoBanner');
const inputUrlDestinazione = document.getElementById('inputUrlDestinazione');
const inputCitta = document.getElementById('inputCitta');
const inputRaggio = document.getElementById('inputRaggio');
const inputDataInizio = document.getElementById('inputDataInizio');
const inputDataFine = document.getElementById('inputDataFine');
const inputCreativita = document.getElementById('inputCreativita');
const creativitaFileName = document.getElementById('creativitaFileName');
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

           const { isApproved, hasProfile } = await checkApprovalStatus(currentUser.id, 'sponsor');
                if (!isApproved) {
                    showApprovalPendingOverlay(document.querySelector('.app-container'), 'sponsor', hasProfile);
                    return; // Blocca il resto della dashboard: niente disponibilità, niente agenda
                }

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

        // Popola le checkbox delle sezioni target a partire dall'elenco condiviso
        renderCheckboxSezioni();

        // Popola le 3 offerte fisse di visualizzazioni.
        renderRadioOfferte();

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
// ANTEPRIMA FILE CREATIVITÀ SELEZIONATO
// ==========================================
inputCreativita.addEventListener('change', () => {
    const file = inputCreativita.files[0];
    creativitaFileName.textContent = file ? `${file.name} ✓` : '';
});

// ==========================================
// UPLOAD IMMAGINE CREATIVITÀ SU STORAGE
// ==========================================
// Salva l'immagine nel bucket "storage_veterinari", nella cartella
// "campagne_sponsor/<sponsor_id>/<uuid>.<estensione>" - stessa
// convenzione delle altre cartelle già presenti nel bucket (es.
// mercatino/, pets_avatar/). Ritorna l'URL pubblico da salvare su
// sponsor_campaigns.banner_image_url.
async function caricaImmagineCreativita(file) {
    const MAX_DIMENSIONE_MB = 5;
    if (file.size > MAX_DIMENSIONE_MB * 1024 * 1024) {
        throw Object.assign(new Error(`L'immagine supera i ${MAX_DIMENSIONE_MB}MB.`), { code: 'FILE_TROPPO_GRANDE' });
    }

    const estensione = file.name.split('.').pop().toLowerCase();
    const percorso = `campagne_sponsor/${currentUser.id}/${crypto.randomUUID()}.${estensione}`;

    const { error: uploadError } = await supabase.storage
        .from('storage_veterinari')
        .upload(percorso, file, { cacheControl: '3600', upsert: false });

    if (uploadError) throw Object.assign(new Error(uploadError.message), { code: uploadError.code || 'STORAGE_UPLOAD_ERROR' });

    const { data } = supabase.storage.from('storage_veterinari').getPublicUrl(percorso);
    return data.publicUrl;
}

// ==========================================
// RENDER CHECKBOX SEZIONI (form "Nuova campagna")
// ==========================================
function renderCheckboxSezioni() {
    checkboxSezioniContainer.innerHTML = SEZIONI_APP.map(sezione => `
        <label class="checkbox-item">
            <input type="checkbox" name="sezione" value="${sezione.value}">
            ${sezione.label}${sezione.richiedeRuoloProprietario ? ' <span class="checkbox-item__nota">(solo proprietari)</span>' : ''}
        </label>
    `).join('');
}

function leggiSezioniSelezionate() {
    return Array.from(checkboxSezioniContainer.querySelectorAll('input[name="sezione"]:checked'))
        .map(cb => cb.value);
}

// ==========================================
// RENDER OFFERTE FISSE (form "Nuova campagna")
// ==========================================
function renderRadioOfferte() {
    radioOfferteContainer.innerHTML = OFFERTE_SPONSOR.map(offerta => {
        const consigliata = offerta.value === OFFERTA_DEFAULT;
        const prezzoPienoHtml = offerta.prezzoPieno
            ? `<span class="offer-option__prezzo-pieno">${formattaEuro(offerta.prezzoPieno)}</span>`
            : '';
        const scontoHtml = offerta.scontoPercentuale
            ? `<span class="offer-option__badge">-${offerta.scontoPercentuale}%</span>`
            : '';
        return `
            <label class="offer-option ${consigliata ? 'offer-option--consigliata' : ''}">
                ${consigliata ? '<span class="offer-option__tag">Consigliata</span>' : ''}
                <input type="radio" name="offerta" value="${offerta.value}" ${consigliata ? 'checked' : ''}>
                <div class="offer-option__body">
                    <div class="offer-option__riga-top">
                        <span class="offer-option__views">${offerta.views.toLocaleString('it-IT')} visualizzazioni</span>
                        <span class="offer-option__prezzo">${formattaEuro(offerta.prezzo)}</span>
                    </div>
                    <div class="offer-option__riga-bottom">
                        <span class="offer-option__base">€${offerta.costoBase.toFixed(3)} / visualizzazione</span>
                        ${prezzoPienoHtml}
                        ${scontoHtml}
                    </div>
                </div>
            </label>
        `;
    }).join('');
}

function leggiOffertaSelezionata() {
    const radio = radioOfferteContainer.querySelector('input[name="offerta"]:checked');
    return radio ? radio.value : null;
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
            .select('id, title, target_sections, target_city, target_radius_km, start_date, end_date, status, banner_image_url, banner_text, click_url, target_views, cost_per_view, total_cost')
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
        const isEsaurita = (c) => {
            const stats = statsPerCampagna.get(c.id) || { impressions: 0 };
            return c.target_views != null && stats.impressions >= c.target_views;
        };
        const attive = campagne.filter(c => c.status === 'ACTIVE' && c.end_date >= oggiStr && !isEsaurita(c));
        const concluse = campagne.filter(c => c.status !== 'ACTIVE' || c.end_date < oggiStr || isEsaurita(c));

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

    // Esaurita = ha un tetto di visualizzazioni acquistate ed è stato
    // raggiunto/superato dalle impression effettivamente consegnate.
    const esaurita = campagna.target_views != null && stats.impressions >= campagna.target_views;

    const badgeClass = campagna.status === 'ACTIVE' && !mostraProgresso ? (esaurita ? 'status-badge--esaurita' : 'status-badge--paused') : (mostraProgresso ? 'status-badge--active' : 'status-badge--done');
    const badgeTesto = mostraProgresso ? 'Attiva' : (campagna.status === 'PAUSED' ? 'In pausa' : (esaurita ? 'Esaurita' : 'Conclusa'));

    // Le vecchie "banner_app" fisse sono sostituite dall'elenco delle
    // sezioni target scelte in fase di creazione campagna.
    const etichettaSezioniTesto = etichettaSezioni(campagna.target_sections);
    const raggioTesto = campagna.target_radius_km ? ` · raggio ${campagna.target_radius_km} km` : '';

    // Miniatura della creatività caricata (se assente, campagne create
    // prima dell'introduzione di questo campo restano senza immagine).
    const immagineHtml = campagna.banner_image_url
        ? `<img src="${escapeHtml(campagna.banner_image_url)}" alt="${escapeHtml(campagna.title)}" class="campaign-card__image">`
        : '';

    // Costo totale pagato (valore storico salvato sulla campagna, non
    // ricalcolato dal listino attuale che potrebbe nel frattempo essere
    // cambiato).
    const costoTesto = campagna.total_cost != null ? ` · ${formattaEuro(campagna.total_cost)}` : '';

    // Testo visualizzazioni: "320 / 1000 visualizzazioni" se la campagna
    // ha un tetto acquistato, altrimenti solo il conteggio grezzo
    // (compatibilità con eventuali campagne precedenti a questo campo).
    const visualizzazioniTesto = campagna.target_views
        ? `${stats.impressions.toLocaleString('it-IT')} / ${campagna.target_views.toLocaleString('it-IT')} visualizzazioni`
        : `${stats.impressions.toLocaleString('it-IT')} impression`;

    let progressoHtml = '';
    if (mostraProgresso) {
        let percentuale;
        if (campagna.target_views) {
            // Progresso basato sulle visualizzazioni acquistate/consumate:
            // è il vincolo reale del nuovo modello a pagamento.
            percentuale = Math.min(100, Math.max(0, (stats.impressions / campagna.target_views) * 100));
        } else {
            const inizio = new Date(campagna.start_date);
            const fine = new Date(campagna.end_date);
            const oggi = new Date();
            percentuale = Math.min(100, Math.max(0, ((oggi - inizio) / (fine - inizio)) * 100));
        }
        progressoHtml = `
            <div class="campaign-card__progress">
                <div class="campaign-card__progress-fill" style="width:${percentuale}%;"></div>
            </div>
        `;
    }

    const dataInizioStr = new Date(campagna.start_date).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
    const dataFineStr = new Date(campagna.end_date).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });

    // Testo del banner (ciò che vede l'utente finale, diverso dal
    // titolo che è solo il nome interno della campagna qui in gestione).
    const testoBannerHtml = campagna.banner_text
        ? `<p class="campaign-card__banner-text">"${escapeHtml(campagna.banner_text)}"</p>`
        : '';

    // Link di destinazione impostato per questa campagna (se presente).
    const linkHtml = campagna.click_url
        ? `<p class="campaign-card__link"><i class="fa-solid fa-link"></i> ${escapeHtml(campagna.click_url)}</p>`
        : '';

    div.innerHTML = `
        ${immagineHtml}
        <span class="status-badge ${badgeClass}">${badgeTesto}</span>
        <h3 class="campaign-card__title">${escapeHtml(campagna.title)}</h3>
        ${testoBannerHtml}
        ${linkHtml}
        <div class="campaign-card__meta">${escapeHtml(etichettaSezioniTesto)} · ${escapeHtml(campagna.target_city)}${raggioTesto} · ${dataInizioStr} - ${dataFineStr}${costoTesto}</div>
        ${progressoHtml}
        <div class="campaign-card__stats">
            <span>${visualizzazioniTesto}</span>
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
    formNuovaCampagna.reset(); // .reset() deseleziona anche le checkbox/offerte
    formStatus.hidden = true;
    creativitaFileName.textContent = '';
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
    const sezioniSelezionate = leggiSezioniSelezionate();
    const offerta = trovaOfferta(leggiOffertaSelezionata());
    const testoBanner = inputTestoBanner.value.trim();
    const urlDestinazione = inputUrlDestinazione.value.trim();
    const citta = inputCitta.value.trim();
    const raggio = inputRaggio.value ? parseInt(inputRaggio.value, 10) : null;
    const dataInizio = inputDataInizio.value;
    const dataFine = inputDataFine.value;
    const fileCreativita = inputCreativita.files[0];

    if (!titolo || !citta || !dataInizio || !dataFine) {
        mostraStatus('Compila tutti i campi obbligatori.', false);
        return;
    }

    if (sezioniSelezionate.length === 0) {
        mostraStatus('Seleziona almeno una sezione target per il banner.', false);
        return;
    }

    if (!offerta) {
        mostraStatus('Seleziona un\'offerta.', false);
        return;
    }

    if (!testoBanner) {
        mostraStatus('Scrivi il testo del banner.', false);
        return;
    }

    if (!urlDestinazione) {
        mostraStatus('Inserisci l\'URL di destinazione del banner.', false);
        return;
    }

    try {
        new URL(urlDestinazione);
    } catch {
        mostraStatus('L\'URL di destinazione non è valido (deve iniziare con https://).', false);
        return;
    }

    if (!fileCreativita) {
        mostraStatus('Carica un\'immagine per la creatività del banner.', false);
        return;
    }

    if (dataFine < dataInizio) {
        mostraStatus('La data di fine non può essere precedente alla data di inizio.', false);
        return;
    }

    btnConfermaCampagna.disabled = true;
    btnConfermaCampagna.textContent = 'Caricamento immagine...';

    try {
        const bannerImageUrl = await caricaImmagineCreativita(fileCreativita);

        btnConfermaCampagna.textContent = 'Creazione...';

        const { error } = await supabase.from('sponsor_campaigns').insert({
            sponsor_id: currentUser.id,
            title: titolo,
            target_sections: sezioniSelezionate,
            target_city: citta,
            target_radius_km: raggio,
            start_date: dataInizio,
            end_date: dataFine,
            status: 'ACTIVE',
            banner_image_url: bannerImageUrl,
            banner_text: testoBanner,
            click_url: urlDestinazione,
            target_views: offerta.views,
            cost_per_view: offerta.costoBase,
            total_cost: offerta.prezzo
        });

        if (error) throw Object.assign(new Error(error.message), { code: error.code || 'DB_INSERT_CAMPAIGN_ERROR' });

        chiudiModale();
        await caricaCampagne();

    } catch (error) {
        console.error("Errore creazione campagna:", error);
        mostraStatus(error.code === 'FILE_TROPPO_GRANDE' ? error.message : 'Errore durante la creazione. Riprova.', false);
        await logError({
            source: 'campagne_sponsor',
            action: 'crea_campagna',
            errorMessage: error.message || "Errore durante l'inserimento della nuova campagna",
            errorCode: error.code || 'UNKNOWN_DB_ERROR',
            context: { sponsorId: currentUser.id, titolo, citta, sezioniSelezionate, offerta: offerta?.value }
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