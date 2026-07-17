// ==========================================
// 1. IMPORT CENTRALIZZATI
// ==========================================
import { supabase } from '../utils/supabaseClient.js';
import { logError } from '../utils/logger.js';

let currentUser = null;
let tipoProfessione = null;
let isADomicilio = false;

let ruoloAssociato = "professionista";

// ==========================================
// CONFIGURAZIONE: professioni "a domicilio"
// ==========================================
// Chi lavora "a domicilio" (va lui dal cliente) non gestisce sedi fisse:
// vede invece l'elenco degli indirizzi delle visite già prenotate.
// Adatta questo elenco ai valori esatti di tipo_professione presenti nel tuo DB,
// oppure valuta di aggiungere una colonna booleana dedicata (es. lavora_a_domicilio)
// sulla tabella "professionals" per non dipendere da un confronto testuale.
const PROFESSIONI_A_DOMICILIO = [
    'pet sitter',
    'dog sitter',
    'pet sitting',
    'dog walker',
    'passeggiatore',
    'passeggiate cani'
];

function determinaSeADomicilio(tipo) {
    if (!tipo) return false;
    const normalizzato = tipo.trim().toLowerCase();
    return PROFESSIONI_A_DOMICILIO.some(p => normalizzato.includes(p));
}

// ==========================================
// DOM Elements
// ==========================================
const placesCount = document.getElementById("placesCount");
const locationsList = document.getElementById("locationsList");
const btnOpenModal = document.getElementById("btnOpenModal");
const addLocationModal = document.getElementById("addLocationModal");
const btnCloseModal = document.getElementById("btnCloseModal");
const locationForm = document.getElementById("locationForm");
const locName = document.getElementById("locName");
const locAddress = document.getElementById("locAddress");
const weeklyScheduler = document.getElementById("weeklyScheduler");
const locMain = document.getElementById("locMain");
const modalStatusMsg = document.getElementById("modalStatusMsg");
const btnSaveLocation = document.getElementById("btnSaveLocation");
const pageTitleEl = document.querySelector("header h2");
const fixedFooterBar = btnOpenModal ? btnOpenModal.parentElement : null;

// ==========================================
// Formattatori / utility
// ==========================================
const GIORNI = [
    { key: 'lunedi', label: 'Lunedì' },
    { key: 'martedi', label: 'Martedì' },
    { key: 'mercoledi', label: 'Mercoledì' },
    { key: 'giovedi', label: 'Giovedì' },
    { key: 'venerdi', label: 'Venerdì' },
    { key: 'sabato', label: 'Sabato' },
    { key: 'domenica', label: 'Domenica' }
];
const GIORNI_KEY_PER_INDICE = ["domenica", "lunedi", "martedi", "mercoledi", "giovedi", "venerdi", "sabato"];

const formatterDataOraVisita = new Intl.DateTimeFormat('it-IT', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
});

function escapeHtml(str) {
    if (typeof str !== 'string') return str;
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function cap(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

// ==========================================
// INIT
// ==========================================
async function initLuoghi() {
    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) throw Object.assign(new Error(authError.message), { code: authError.code || 'AUTH_SYS_ERROR' });

        if (!user) {
            window.location.href = "../../index.html";
            return;
        }
        currentUser = user;

        const { data: prof, error: profError } = await supabase
    .from('professionals')
    .select('tipo_professione')
    .eq('user_id', currentUser.id)
    .maybeSingle();

if (profError)
    throw Object.assign(new Error(profError.message), {
        code: profError.code || 'DB_FETCH_PROFESSIONAL_ERROR'
    });

tipoProfessione = prof?.tipo_professione || null;
isADomicilio = determinaSeADomicilio(tipoProfessione);

// questa pagina è quella dei professionisti
ruoloAssociato = "professionista";

        if (isADomicilio) {
            // Nessuna sede da gestire: nascondiamo il bottone/modale di aggiunta
            if (fixedFooterBar) fixedFooterBar.style.display = 'none';
            if (pageTitleEl) pageTitleEl.textContent = 'I tuoi domicili';
            await caricaDomicili();
        } else {
            injectSchedulerStyles();
            wireModalEvents();
            await caricaLuoghi();
        }

    } catch (error) {
        console.error("Errore inizializzazione luoghi:", error);
        placesCount.textContent = "Errore di caricamento";
        locationsList.innerHTML = `<div style="color:#DC2626; text-align:center; padding: 30px;">Impossibile caricare la pagina. Riprova più tardi.</div>`;
        await logError({
            source: 'luoghi_pro', action: 'init_page',
            errorMessage: error.message, errorCode: error.code || 'UNKNOWN_SYS_ERROR',
            context: { userId: currentUser ? currentUser.id : null }
        });
    }
}

// ==========================================
// MODALITÀ "SEDE FISSA" - Lista luoghi da provider_locations
// ==========================================

async function caricaLuoghi() {

    locationsList.innerHTML = `
        <div style="text-align:center;padding:40px;color:#94A3B8;">
            <i class="fa-solid fa-spinner fa-spin" style="font-size:2rem;"></i>
        </div>
    `;

    try {

        const { data: luoghi, error } = await supabase
            .from("provider_locations")
            .select("*")
            .eq("provider_id", currentUser.id)
            .eq("ruolo_associato", ruoloAssociato)
            .order("is_principale", { ascending: false })
            .order("created_at", { ascending: true });

        if (error) throw error;

        renderizzaLuoghi(luoghi || []);

    } catch (error) {

        console.error(error);

        placesCount.textContent = "Errore di caricamento";

        locationsList.innerHTML = `
            <div style="color:#DC2626;text-align:center;padding:30px;">
                Errore nel caricamento dei luoghi.
            </div>
        `;

        await logError({
            source: "luoghi_pro",
            action: "fetch_locations",
            errorMessage: error.message,
            errorCode: error.code || "DB_FETCH_LOCATIONS_ERROR",
            context: {
                providerId: currentUser.id,
                ruolo: ruoloAssociato
            }
        });

    }

}

function renderizzaLuoghi(luoghi) {
    placesCount.textContent = luoghi.length === 1 ? "1 luogo disponibile" : `${luoghi.length} luoghi disponibili`;
    locationsList.innerHTML = "";

    if (luoghi.length === 0) {
        locationsList.innerHTML = `
            <div style="background:#fff; border-radius:16px; padding:30px; text-align:center; border:1px dashed #CBD5E1;">
                <p style="color:#64748B; margin:0;">Non hai ancora aggiunto nessun luogo. Tocca "Aggiungi un luogo" per iniziare.</p>
            </div>
        `;
        return;
    }

    luoghi.forEach(loc => locationsList.appendChild(creaCardLuogo(loc)));
}

function creaCardLuogo(loc) {
    const card = document.createElement('div');
    card.style.cssText = 'background:#fff; border-radius:16px; padding:20px; margin-bottom:16px; box-shadow:0 2px 8px rgba(0,0,0,0.05);';

    const orarioOggi = formattaOrarioOggi(loc.orari_disponibilita);

    card.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:10px;">
            <h3 style="margin:0; color:#1E293B; font-size:1.05rem; font-weight:700;">${escapeHtml(loc.nome_struttura)}</h3>
            ${loc.is_principale ? `<span style="background:#FEF3C7; color:#D97706; font-size:0.75rem; font-weight:700; padding:4px 10px; border-radius:20px; white-space:nowrap;">Principale</span>` : ''}
        </div>
        <div style="display:flex; align-items:center; gap:8px; color:#475569; font-size:0.9rem; margin-bottom:6px;">
            <i class="fa-solid fa-location-dot" style="color:#94A3B8; width:14px;"></i>
            <span>${escapeHtml(loc.indirizzo)}</span>
        </div>
        <div style="display:flex; align-items:center; gap:8px; font-size:0.9rem; margin-bottom:14px;">
            <i class="fa-regular fa-clock" style="color:#94A3B8; width:14px;"></i>
            <span style="color:${orarioOggi.aperto ? '#10B981' : '#EF4444'}; font-weight:600;">${orarioOggi.aperto ? 'Oggi aperto:' : 'Oggi chiuso'}</span>
            ${orarioOggi.aperto ? `<span style="color:#475569;">${escapeHtml(orarioOggi.testo)}</span>` : ''}
        </div>
        <button type="button" class="btn-elimina-luogo" data-id="${loc.id}" style="background:#FEE2E2; border:none; width:38px; height:38px; border-radius:10px; color:#EF4444; cursor:pointer; font-size:1rem;">
            <i class="fa-solid fa-trash"></i>
        </button>
    `;

    card.querySelector('.btn-elimina-luogo').addEventListener('click', () => eliminaLuogo(loc.id));
    return card;
}

function formattaOrarioOggi(orari) {
    if (!orari) return { aperto: false, testo: '' };
    const chiaveOggi = GIORNI_KEY_PER_INDICE[new Date().getDay()];
    const turni = orari[chiaveOggi] || [];
    if (turni.length === 0) return { aperto: false, testo: '' };
    const testo = turni.map(t => `${t.inizio} - ${t.fine}`).join(', ');
    return { aperto: true, testo };
}

async function eliminaLuogo(locationId) {

    if (!confirm("Vuoi eliminare definitivamente questo luogo?"))
        return;

    try {

        const { error } = await supabase
            .from("provider_locations")
            .delete()
            .eq("id", locationId)
            .eq("provider_id", currentUser.id)
            .eq("ruolo_associato", ruoloAssociato);

        if (error) throw error;

        await caricaLuoghi();

    } catch (error) {

        console.error(error);

        alert("Impossibile eliminare il luogo.");

        await logError({
            source: "luoghi_pro",
            action: "delete_location",
            errorMessage: error.message,
            errorCode: error.code || "DB_DELETE_LOCATION_ERROR",
            context: {
                providerId: currentUser.id,
                ruolo: ruoloAssociato
            }
        });

    }

}

// ==========================================
// MODALE - Apertura/Chiusura + Scheduler settimanale
// ==========================================

function wireModalEvents() {
    btnOpenModal.addEventListener('click', apriModale);
    btnCloseModal.addEventListener('click', chiudiModale);
    addLocationModal.addEventListener('click', (e) => {
        if (e.target === addLocationModal) chiudiModale();
    });
    locationForm.addEventListener('submit', gestisciSalvataggio);
}

function apriModale() {
    locationForm.reset();
    nascondiErrore();
    costruisciScheduler();
    addLocationModal.classList.add('active');
    addLocationModal.style.display = 'flex';
}

function chiudiModale() {
    addLocationModal.classList.remove('active');
    addLocationModal.style.display = 'none';
}

function mostraErrore(msg) {
    modalStatusMsg.textContent = msg;
    modalStatusMsg.hidden = false;
}

function nascondiErrore() {
    modalStatusMsg.hidden = true;
    modalStatusMsg.textContent = '';
}

// Inserisce lo stile per lo scheduler settimanale una sola volta
// (la lista luoghi/badge/bottoni usa già lo stile esistente di luoghi.css)
function injectSchedulerStyles() {
    if (document.getElementById('schedulerStyles')) return;

    const style = document.createElement('style');
    style.id = 'schedulerStyles';
    style.textContent = `
        .day-schedule-row {
            border: 1px solid #E2E8F0;
            border-radius: 12px;
            padding: 12px 14px;
            margin-bottom: 10px;
        }
        .day-schedule-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .day-toggle-label {
            display: flex;
            align-items: center;
            gap: 10px;
            font-size: 0.9rem;
            font-weight: 600;
            color: #1E293B;
            cursor: pointer;
        }
        .day-toggle-label input[type="checkbox"] {
            width: 18px;
            height: 18px;
            accent-color: #F58220;
        }
        .add-shift-btn {
            border: none;
            background: transparent;
            color: #F58220;
            font-weight: 700;
            font-size: 0.82rem;
            cursor: pointer;
            padding: 4px 8px;
        }
        .shifts-container {
            margin-top: 10px;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .shift-row {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .shift-row input[type="time"] {
            flex: 1;
            padding: 8px 10px;
            border: 1px solid #E2E8F0;
            border-radius: 8px;
            font-size: 0.85rem;
            box-sizing: border-box;
        }
        .shift-row span { color: #94A3B8; font-size: 0.85rem; }
        .remove-shift-btn {
            border: none;
            background: #F1F5F9;
            color: #64748B;
            width: 28px;
            height: 28px;
            border-radius: 8px;
            cursor: pointer;
            flex-shrink: 0;
        }
        .remove-shift-btn:hover { background: #FEE2E2; color: #EF4444; }
    `;
    document.head.appendChild(style);
}

function costruisciScheduler(schedulePreesistente = {}) {
    weeklyScheduler.innerHTML = '';

    GIORNI.forEach(giorno => {
        const turniEsistenti = schedulePreesistente[giorno.key] || [];
        const attivo = turniEsistenti.length > 0;

        const dayRow = document.createElement('div');
        dayRow.className = 'day-schedule-row';
        dayRow.dataset.day = giorno.key;
        dayRow.innerHTML = `
            <div class="day-schedule-header">
                <label class="day-toggle-label">
                    <input type="checkbox" class="day-enable-checkbox" ${attivo ? 'checked' : ''}>
                    <span>${giorno.label}</span>
                </label>
                <button type="button" class="add-shift-btn" style="${attivo ? '' : 'display:none;'}">+ Turno</button>
            </div>
            <div class="shifts-container" style="${attivo ? '' : 'display:none;'}"></div>
        `;
        weeklyScheduler.appendChild(dayRow);

        const shiftsContainer = dayRow.querySelector('.shifts-container');
        const dayCheckbox = dayRow.querySelector('.day-enable-checkbox');
        const addShiftBtn = dayRow.querySelector('.add-shift-btn');

        if (turniEsistenti.length > 0) {
            turniEsistenti.forEach(t => aggiungiRigaTurno(shiftsContainer, t.inizio, t.fine));
        } else {
            aggiungiRigaTurno(shiftsContainer, '09:00', '18:00');
        }

        dayCheckbox.addEventListener('change', () => {
            const abilitato = dayCheckbox.checked;
            shiftsContainer.style.display = abilitato ? '' : 'none';
            addShiftBtn.style.display = abilitato ? '' : 'none';
        });

        addShiftBtn.addEventListener('click', () => aggiungiRigaTurno(shiftsContainer, '09:00', '18:00'));
    });
}

function aggiungiRigaTurno(container, inizio, fine) {
    const row = document.createElement('div');
    row.className = 'shift-row';
    row.innerHTML = `
        <input type="time" class="shift-start" value="${inizio}">
        <span>-</span>
        <input type="time" class="shift-end" value="${fine}">
        <button type="button" class="remove-shift-btn" aria-label="Rimuovi turno">
            <i class="fa-solid fa-xmark"></i>
        </button>
    `;
    container.appendChild(row);
    row.querySelector('.remove-shift-btn').addEventListener('click', () => {
        // Non permettiamo di svuotare del tutto un giorno attivo: se è l'ultima riga, la lasciamo
        if (container.querySelectorAll('.shift-row').length > 1) row.remove();
    });
}

function raccogliOrariDalForm() {
    const orari = {};
    weeklyScheduler.querySelectorAll('.day-schedule-row').forEach(dayRow => {
        const giorno = dayRow.dataset.day;
        const attivo = dayRow.querySelector('.day-enable-checkbox').checked;
        if (!attivo) return;

        const turni = [];
        dayRow.querySelectorAll('.shift-row').forEach(shiftRow => {
            const inizio = shiftRow.querySelector('.shift-start').value;
            const fine = shiftRow.querySelector('.shift-end').value;
            if (inizio && fine && inizio < fine) {
                turni.push({ inizio, fine });
            }
        });
        if (turni.length > 0) orari[giorno] = turni;
    });
    return orari;
}

// ==========================================
// Geocoding indirizzo (OpenStreetMap Nominatim - gratuito, nessuna API key)
// Nota: per un volume di traffico consistente in produzione, valuta un
// provider dedicato (Google Geocoding API, Mapbox) rispettando le rispettive policy.
// ==========================================
async function geocodificaIndirizzo(indirizzo) {
    const query = /italia/i.test(indirizzo) ? indirizzo : `${indirizzo}, Italia`;
    const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=1&countrycodes=it&q=${encodeURIComponent(query)}`;

    const res = await fetch(url, { headers: { 'Accept-Language': 'it' } });
    if (!res.ok) throw new Error(`Geocoding fallito con status ${res.status}`);

    const risultati = await res.json();
    if (!risultati || risultati.length === 0) return null;

    const r = risultati[0];
    const addr = r.address || {};
    const citta = addr.city || addr.town || addr.village || addr.municipality || addr.county || '';

    return {
        latitudine: parseFloat(r.lat),
        longitudine: parseFloat(r.lon),
        citta
    };
}

async function gestisciSalvataggio(e) {
    e.preventDefault();
    nascondiErrore();

    const nome = locName.value.trim();
    const indirizzo = locAddress.value.trim();
    const principale = locMain.checked;

    if (!nome || !indirizzo) {
        mostraErrore("Compila nome struttura e indirizzo.");
        return;
    }

    btnSaveLocation.disabled = true;
    btnSaveLocation.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvataggio...';

    try {
        const geo = await geocodificaIndirizzo(indirizzo);
        if (!geo) {
            mostraErrore("Non siamo riusciti a localizzare questo indirizzo. Controlla che sia scritto correttamente.");
            return;
        }

        const orariDisponibilita = raccogliOrariDalForm();

        // Se questa sede diventa principale, togliamo il flag dalle altre
        if (principale) {
            const { error: updateError } = await supabase
                .from('provider_locations')
                .update({ is_principale: false })
                .eq('provider_id', currentUser.id);

            if (updateError) throw updateError;
        }

        const { error: insertError } = await supabase
            .from('provider_locations')
            .insert({
                provider_id: currentUser.id,
                nome_struttura: nome,
                indirizzo: indirizzo,
                citta: geo.citta,
                latitudine: geo.latitudine,
                longitudine: geo.longitudine,
                is_principale: principale,
                orari_disponibilita: orariDisponibilita,
                ruolo_associato: 'professionista'
            });

        if (insertError) throw insertError;

        chiudiModale();
        await caricaLuoghi();

    } catch (error) {
        console.error("Errore salvataggio luogo:", error);
        mostraErrore("Errore di sistema durante il salvataggio. Riprova.");
        await logError({
            source: 'luoghi_pro', action: 'save_location',
            errorMessage: error.message, errorCode: error.code || 'DB_SAVE_LOCATION_ERROR',
            context: { providerId: currentUser.id, indirizzo }
        });
    } finally {
        btnSaveLocation.disabled = false;
        btnSaveLocation.innerHTML = 'Salva sede';
    }
}

// ==========================================
// MODALITÀ "A DOMICILIO" - Elenco indirizzi delle visite prenotate
// ==========================================

async function caricaDomicili() {
    placesCount.textContent = "Caricamento in corso...";
    locationsList.innerHTML = `<div style="text-align: center; padding: 40px; color: #94A3B8;"><i class="fa-solid fa-spinner fa-spin" style="font-size: 2rem;"></i></div>`;

    try {
        const { data: appuntamenti, error } = await supabase
            .from('appointments')
            .select(`
                id,
                data_inizio,
                data_fine,
                stato,
                pets ( nome ),
                profiles!appointments_owner_id_fkey ( nome, cognome, indirizzo, citta )
            `)
            .eq('provider_id', currentUser.id)
            .gte('data_inizio', new Date().toISOString())
            .order('data_inizio', { ascending: true });

        if (error) throw error;

        renderizzaDomicili(appuntamenti || []);
    } catch (error) {
        console.error("Errore caricamento domicili:", error);
        placesCount.textContent = "Errore di caricamento";
        locationsList.innerHTML = `<div style="color:#DC2626; text-align:center; padding: 30px;">Errore nel caricamento delle visite a domicilio.</div>`;
        await logError({
            source: 'luoghi_pro', action: 'fetch_domicili',
            errorMessage: error.message, errorCode: error.code || 'DB_FETCH_DOMICILI_ERROR',
            context: { providerId: currentUser.id }
        });
    }
}

function renderizzaDomicili(appuntamenti) {
    placesCount.textContent = appuntamenti.length === 1
        ? "1 visita a domicilio in programma"
        : `${appuntamenti.length} visite a domicilio in programma`;

    locationsList.innerHTML = "";

    if (appuntamenti.length === 0) {
        locationsList.innerHTML = `
            <div style="background:#fff; border-radius:16px; padding:30px; text-align:center; border:1px dashed #CBD5E1;">
                <p style="color:#64748B; margin:0;">Nessuna visita a domicilio in programma.</p>
            </div>
        `;
        return;
    }

    appuntamenti.forEach(app => locationsList.appendChild(creaCardDomicilio(app)));
}

function creaCardDomicilio(app) {
    const card = document.createElement('div');
    card.style.cssText = 'background:#fff; border-radius:16px; padding:20px; margin-bottom:16px; box-shadow:0 2px 8px rgba(0,0,0,0.05);';

    const owner = app.profiles || {};
    const pet = app.pets || {};
    const nomeProprietario = `${owner.nome || ''} ${owner.cognome || ''}`.trim() || 'Cliente';
    const indirizzoCompleto = [owner.indirizzo, owner.citta].filter(Boolean).join(', ') || 'Indirizzo non disponibile';
    const dataVisita = cap(formatterDataOraVisita.format(new Date(app.data_inizio)));

    card.innerHTML = `
        <div style="margin-bottom:10px;">
            <h3 style="margin:0; color:#1E293B; font-size:1.05rem; font-weight:700;">${escapeHtml(nomeProprietario)} · ${escapeHtml(pet.nome || 'Animale')}</h3>
        </div>
        <div style="display:flex; align-items:center; gap:8px; color:#475569; font-size:0.9rem; margin-bottom:6px;">
            <i class="fa-solid fa-location-dot" style="color:#94A3B8; width:14px;"></i>
            <span>${escapeHtml(indirizzoCompleto)}</span>
        </div>
        <div style="display:flex; align-items:center; gap:8px; font-size:0.9rem; color:#475569;">
            <i class="fa-regular fa-clock" style="color:#94A3B8; width:14px;"></i>
            <span>${escapeHtml(dataVisita)}</span>
        </div>
    `;

    return card;
}

initLuoghi();