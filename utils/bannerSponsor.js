// ==========================================
// BANNER SPONSOR - modulo riutilizzabile
// ==========================================
// Va importato in qualunque pagina dell'app dove si vuole mostrare
// un banner sponsor (mercatino, passeggiate, prenotazione, ecc.).
// Mostra solo campagne ACTIVE, in corso, che includono la sezione
// passata come parametro tra le proprie target_sections - così un
// banner "guinzagli" targettizzato solo su "passeggiate" non comparirà
// mai nel mercatino.
//
// USO MINIMO in una pagina (basta questo, il modulo si occupa da
// solo di trovare l'utente loggato e la sua città):
//
//   import { mostraBannerSponsor } from '../utils/bannerSponsor.js';
//   ...
//   mostraBannerSponsor(document.getElementById('bannerSponsor'), 'mercatino');
//
// e nell'HTML corrispondente, un contenitore vuoto (nascosto finché
// non c'è un banner da mostrare) messo dove preferisci visivamente:
//
//   <div id="bannerSponsor" hidden></div>
//
// USO AVANZATO (opzionale): se la pagina ha GIÀ caricato il profilo
// utente per altri motivi, puoi passare la città esplicitamente come
// terzo argomento per evitare una query duplicata:
//
//   mostraBannerSponsor(container, 'mercatino', profiloGiaCaricato.citta);

import { supabase } from './supabaseClient.js';
import { logError } from './logger.js';
import { SEZIONI_APP } from './sezioniApp.js';

/**
 * Cerca una campagna attiva per la sezione indicata e la mostra nel
 * container passato. Se non trova nulla, nasconde il container.
 *
 * @param {HTMLElement} container - elemento dove renderizzare il banner
 * @param {string} sezione - codice sezione (vedi js/utils/sezioniApp.js)
 * @param {string|null} [cittaUtente] - facoltativo: se omesso, il modulo
 *   recupera da solo l'utente loggato e la sua città da "profiles".
 *   Passalo esplicitamente solo se la pagina l'ha già caricato altrove.
 */
export async function mostraBannerSponsor(container, sezione, cittaUtente) {
    if (!container) return;

    // Controllo di sviluppo: avvisa se il codice sezione passato ha un
    // refuso e non corrisponde a nessuna voce di sezioniApp.js (non
    // blocca comunque la query, per non nascondere banner per un
    // semplice disallineamento dell'elenco).
    if (!SEZIONI_APP.some(s => s.value === sezione)) {
        console.warn(`mostraBannerSponsor: sezione "${sezione}" non è elencata in js/utils/sezioniApp.js. Controlla eventuali refusi.`);
    }

    try {
        // Alcune sezioni (dashboard_veterinario, dashboard_professionista)
        // sono marcate richiedeRuoloProprietario in sezioniApp.js: il
        // banner lì va mostrato solo a chi, oltre al ruolo vet/pro, ha
        // ANCHE il ruolo proprietario (cioè almeno un animale registrato).
        // Chi ha solo il ruolo veterinario/professionista non vede mai
        // il banner su quelle pagine.
        const sezioneInfo = SEZIONI_APP.find(s => s.value === sezione);
        if (sezioneInfo?.richiedeRuoloProprietario && !(await utenteHaRuoloProprietario())) {
            container.hidden = true;
            return;
        }

        // Se la pagina chiamante non passa una città esplicita, ce la
        // procuriamo da soli (utente loggato + profiles.citta). Così
        // ogni pagina deve solo importare e chiamare questa funzione,
        // senza ripetere ovunque la stessa query di profilo.
        const citta = cittaUtente !== undefined ? cittaUtente : await recuperaCittaUtenteCorrente();

        const oggiStr = new Date().toISOString().split('T')[0];

        let { data: campagne, error } = await supabase
            .from('sponsor_campaigns')
            .select('id, title, target_city, banner_image_url, banner_text, click_url, target_views')
            .eq('status', 'ACTIVE')
            .contains('target_sections', [sezione])
            .lte('start_date', oggiStr)
            .gte('end_date', oggiStr);

        if (error) throw Object.assign(new Error(error.message), { code: error.code || 'DB_FETCH_BANNER_ERROR' });

        if (!campagne || campagne.length === 0) {
            container.hidden = true;
            return;
        }

        // Modello a pagamento per visualizzazioni: escludiamo le campagne
        // che hanno già "consumato" tutte le visualizzazioni acquistate
        // (target_views). Le visualizzazioni consegnate si contano dagli
        // stessi campaign_events usati per le statistiche - nessun
        // contatore duplicato da tenere sincronizzato.
        const campagneConLimite = campagne.filter(c => c.target_views != null);
        if (campagneConLimite.length > 0) {
            const { data: eventiImpression } = await supabase
                .from('campaign_events')
                .select('campaign_id')
                .eq('event_type', 'impression')
                .in('campaign_id', campagneConLimite.map(c => c.id));

            const conteggioPerCampagna = new Map();
            (eventiImpression || []).forEach(e => {
                conteggioPerCampagna.set(e.campaign_id, (conteggioPerCampagna.get(e.campaign_id) || 0) + 1);
            });

            campagne = campagne.filter(c => c.target_views == null || (conteggioPerCampagna.get(c.id) || 0) < c.target_views);
        }

        if (campagne.length === 0) {
            container.hidden = true;
            return;
        }

        // Se disponibile la città dell'utente, dà priorità alle campagne
        // che la targettizzano esplicitamente; altrimenti usa tutte le
        // campagne idonee per la sezione.
        let candidate = campagne;
        if (citta) {
            const stessaCitta = campagne.filter(c => (c.target_city || '').toLowerCase() === citta.toLowerCase());
            if (stessaCitta.length > 0) candidate = stessaCitta;
        }

        // Rotazione semplice: sceglie una campagna a caso tra quelle idonee.
        const scelta = candidate[Math.floor(Math.random() * candidate.length)];

        // Testo mostrato sul banner: quello scritto apposta dallo sponsor
        // in campagne.js; se assente (campagne create prima di questo
        // campo) ripieghiamo sul titolo/nome interno della campagna.
        // Testo mostrato: titolo campagna in grassetto (come "PETCARE+"
        // nel vecchio banner hardcoded) + il testo scritto apposta dallo
        // sponsor in campagne.js. Se manca banner_text (campagne create
        // prima di questo campo) resta solo il titolo.
        const testoBannerHtml = scelta.banner_text
            ? `<strong>${escapeHtml(scelta.title)}</strong> ${escapeHtml(scelta.banner_text)}`
            : escapeHtml(scelta.title);

        // Banner sempre come striscia sottile a piena larghezza (come il
        // vecchio PETCARE+ hardcoded): se c'è un'immagine viene mostrata
        // solo come piccola miniatura a sinistra, mai a piena grandezza.
        const miniaturaHtml = scelta.banner_image_url
            ? `<img src="${escapeHtml(scelta.banner_image_url)}" alt="" class="sponsor-banner__thumb">`
            : '';

        container.hidden = false;
        container.innerHTML = `
            <div class="sponsor-banner" role="button" tabindex="0">
                ${miniaturaHtml}
                <p class="sponsor-banner__text"><span class="sponsor-banner__tag">Sponsorizzato</span> ${testoBannerHtml}</p>
            </div>
        `;

        // Attacca il banner esattamente sopra la bottom-nav, senza spazio
        // in mezzo: misura l'altezza VERA della navbar a runtime invece di
        // stimarla in CSS (che può disallinearsi da pagina a pagina o su
        // schermi diversi).
        posizionaSopraNavbar(container);
        window.addEventListener('resize', () => posizionaSopraNavbar(container));

        const bannerEl = container.querySelector('.sponsor-banner');
        bannerEl.addEventListener('click', () => {
            registraEvento(scelta.id, 'click', sezione, citta);
            // Apre l'URL di destinazione impostato dallo sponsor in una
            // nuova scheda (non naviga via dall'app). Campagne senza
            // click_url (create prima di questo campo) registrano solo
            // il click, senza aprire nulla.
            if (scelta.click_url) {
                window.open(scelta.click_url, '_blank', 'noopener,noreferrer');
            }
        });

        // Registra la visualizzazione non appena il banner viene mostrato.
        registraEvento(scelta.id, 'impression', sezione, citta);

    } catch (error) {
        console.error('Errore caricamento banner sponsor:', error);
        container.hidden = true;
        await logError({
            source: 'banner_sponsor',
            action: 'mostra_banner',
            errorMessage: error.message || 'Errore nel caricamento del banner sponsor',
            errorCode: error.code || 'UNKNOWN_ERROR',
            context: { sezione }
        });
    }
}

// Verifica se l'utente loggato ha (anche) il ruolo proprietario, cioè
// almeno un animale registrato a suo nome in "pets" - stessa logica
// già usata in dashboard-proprietario.js per caricare gli animali.
// In caso di dubbio (utente non loggato, errore di rete) ritorna
// false: meglio non mostrare il banner che mostrarlo a chi non deve.
async function utenteHaRuoloProprietario() {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return false;

        const { data: pets, error } = await supabase
            .from('pets')
            .select('id')
            .eq('owner_id', user.id)
            .limit(1);

        if (error) throw error;
        return !!(pets && pets.length > 0);
    } catch (error) {
        console.warn('Impossibile verificare il ruolo proprietario per il banner:', error);
        return false;
    }
}

// Recupera in autonomia utente loggato + città dal profilo, così le
// pagine chiamanti non devono duplicare questa query. Se l'utente non
// è loggato (es. cerca.js, consultabile anche da anonimi) ritorna
// semplicemente null: il banner viene comunque mostrato, solo senza
// priorità geografica.
async function recuperaCittaUtenteCorrente() {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;

        const { data: profilo } = await supabase
            .from('profiles')
            .select('citta')
            .eq('id', user.id)
            .maybeSingle();

        return profilo?.citta || null;
    } catch (error) {
        console.warn('Impossibile recuperare la città utente per il banner sponsor:', error);
        return null;
    }
}

// Misura l'altezza effettivamente renderizzata di .bottom-nav e allinea
// il banner esattamente sopra, a zero pixel di distanza - niente numeri
// stimati in CSS che rischiano di lasciare uno spazio o sovrapporsi.
function posizionaSopraNavbar(container) {
    const nav = document.querySelector('.bottom-nav');
    if (!nav) return;
    container.style.bottom = `${nav.getBoundingClientRect().height}px`;
}

async function registraEvento(campaignId, tipoEvento, sezione, cittaUtente) {
    try {
        const { error } = await supabase.from('campaign_events').insert({
            campaign_id: campaignId,
            event_type: tipoEvento,
            section: sezione,
            viewer_city: cittaUtente || null
        });
        if (error) throw error;
    } catch (error) {
        // Un evento non registrato non deve bloccare l'esperienza utente:
        // logghiamo soltanto, senza mostrare nulla a schermo.
        console.error(`Errore registrazione evento '${tipoEvento}' campagna:`, error);
        await logError({
            source: 'banner_sponsor',
            action: 'registra_evento',
            errorMessage: error.message || `Errore durante la registrazione dell'evento ${tipoEvento}`,
            errorCode: error.code || 'DB_INSERT_EVENT_ERROR',
            context: { campaignId, tipoEvento, sezione }
        });
    }
}

function escapeHtml(str) {
    if (typeof str !== 'string') return str;
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}