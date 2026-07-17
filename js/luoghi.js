// ==========================================
// 1. IMPORT E VARIABILI GLOBALI
// ==========================================
import { supabase } from '../utils/supabaseClient.js';
import { logError } from '../utils/logger.js';

let currentUser = null;
const ruoloAssociato = "veterinario";
const giorniSettimana = ["lunedi", "martedi", "mercoledi", "giovedi", "venerdi", "sabato", "domenica"];
const labelGiorni = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];

// Elementi DOM
const locationsList = document.getElementById("locationsList");
const placesCount = document.getElementById("placesCount");
const modal = document.getElementById("addLocationModal");
const btnOpenModal = document.getElementById("btnOpenModal");
const btnCloseModal = document.getElementById("btnCloseModal");
const locationForm = document.getElementById("locationForm");
const btnSaveLocation = document.getElementById("btnSaveLocation");
const modalStatusMsg = document.getElementById("modalStatusMsg");
const weeklyScheduler = document.getElementById("weeklyScheduler");

// ==========================================
// 2. INIZIALIZZAZIONE E GENERAZIONE UI
// ==========================================
async function init() {
    try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error || !user) throw new Error("Utente non autenticato");
        
        currentUser = user;
        
        generaSchedulerUI();
        await fetchLocations();

    } catch (error) {
        window.location.href = "../index.html";
    }
}

function generaSchedulerUI() {
    weeklyScheduler.innerHTML = "";
    giorniSettimana.forEach((giorno, index) => {
        // Pre-impostiamo aperti solo i giorni lavorativi (Lun-Ven)
        const isLavorativo = index < 5; 
        
        const row = document.createElement("div");
        row.className = "day-row";
        row.dataset.day = giorno;
        row.innerHTML = `
            <span style="font-size: 0.85rem; font-weight: 600; color: #1E293B; width: 70px;">${labelGiorni[index]}</span>
            <div style="display: flex; align-items: center; gap: 6px;">
                <input type="time" class="time-input time-start" value="09:00" ${isLavorativo ? "" : "disabled"}>
                <span style="color: #64748B; font-size: 0.8rem;">al</span>
                <input type="time" class="time-input time-end" value="18:00" ${isLavorativo ? "" : "disabled"}>
            </div>
            <input type="checkbox" class="day-active" style="width: 18px; height: 18px; accent-color: #F58220;" ${isLavorativo ? "checked" : ""}>
        `;

        // Abilita/Disabilita gli input orari al click della spunta
        const checkbox = row.querySelector(".day-active");
        const inputs = row.querySelectorAll(".time-input");
        checkbox.addEventListener("change", (e) => {
            inputs.forEach(input => input.disabled = !e.target.checked);
        });

        weeklyScheduler.appendChild(row);
    });
}

// ==========================================
// 3. FETCH E RENDERIZZAZIONE LUOGHI
// ==========================================
async function fetchLocations() {
    try {
        const { data: locations, error } = await supabase
    .from('provider_locations')
    .select('*')
    .eq('provider_id', currentUser.id)
    .eq('ruolo_associato', ruoloAssociato)
    .order('is_principale', { ascending: false });

        if (error) throw error;

        const count = locations ? locations.length : 0;
        placesCount.textContent = count === 1 ? "1 luogo disponibile" : `${count} luoghi disponibili`;

        renderLocations(locations);

    } catch (error) {
        locationsList.innerHTML = `<p style="color: #EF4444; text-align: center;">Errore nel caricamento delle sedi.</p>`;
    }
}

function renderLocations(locations) {
    locationsList.innerHTML = "";

    if (!locations || locations.length === 0) {
        locationsList.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; background: #fff; border-radius: 20px; border: 1px dashed #CBD5E1;">
                <div style="font-size: 2.5rem; color: #E2E8F0; margin-bottom: 12px;"><i class="fa-solid fa-map-location-dot"></i></div>
                <h4 style="margin: 0 0 5px 0; color: #1E293B;">Nessun luogo inserito</h4>
                <p style="color: #64748B; margin: 0; font-size: 0.9rem;">Aggiungi la tua prima clinica o zona di lavoro per iniziare a ricevere appuntamenti.</p>
            </div>
        `;
        return;
    }

    // Calcolo del giorno corrente per mostrare l'orario di "Oggi"
    const oggiIndex = new Date().getDay(); 
    // In JS getDay() parte da Domenica(0). Il nostro array parte da Lunedi(0). Riallineiamo:
    const nostroIndexOggi = oggiIndex === 0 ? 6 : oggiIndex - 1; 
    const stringaOggi = giorniSettimana[nostroIndexOggi];

    locations.forEach(loc => {
        const badgePrincipale = loc.is_principale 
            ? `<span style="background: #FEF3C7; color: #D97706; font-size: 0.65rem; font-weight: 700; padding: 4px 8px; border-radius: 6px; margin-left: 8px;">Principale</span>`
            : '';

        // Estrazione orari di "Oggi" dal JSONB
        const orari = loc.orari_disponibilita || {};
        const fasceOggi = orari[stringaOggi] || [];
        let testoOrario = `<span style="color: #EF4444; font-weight: 600;">Chiuso oggi</span>`;
        
        if (fasceOggi.length > 0) {
            testoOrario = `<span style="color: #10B981; font-weight: 600;">Oggi aperto:</span> ${fasceOggi[0].inizio} - ${fasceOggi[0].fine}`;
        }

        const card = document.createElement("div");
        card.className = "location-card";
        card.innerHTML = `
            <div style="flex-grow: 1; padding-right: 15px;">
                <h4 style="margin: 0 0 6px 0; color: #1E293B; font-size: 1.05rem; display: flex; align-items: center;">
                    ${loc.nome_struttura} ${badgePrincipale}
                </h4>
                <p style="margin: 0 0 6px 0; color: #64748B; font-size: 0.85rem;">
                    <i class="fa-solid fa-location-dot" style="width: 16px; color: #94A3B8;"></i> ${loc.indirizzo}
                </p>
                <p style="margin: 0; color: #64748B; font-size: 0.85rem;">
                    <i class="fa-regular fa-clock" style="width: 16px; color: #94A3B8;"></i> ${testoOrario}
                </p>
            </div>
            <button class="delete-loc-btn" data-id="${loc.id}" style="background: #FEE2E2; border: none; color: #EF4444; width: 35px; height: 35px; border-radius: 10px; cursor: pointer; flex-shrink: 0; transition: 0.2s;">
                <i class="fa-solid fa-trash-can"></i>
            </button>
        `;

        locationsList.appendChild(card);
    });

    // Gestione eliminazione
    document.querySelectorAll(".delete-loc-btn").forEach(btn => {
        btn.addEventListener("click", async (e) => {
            const id = e.currentTarget.getAttribute("data-id");
            if (confirm("Eliminare definitivamente questa sede?")) {
                e.currentTarget.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
                await deleteLocation(id);
            }
        });
    });
}

// ==========================================
// 4. SALVATAGGIO NUOVO LUOGO E TURNI
// ==========================================
locationForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    btnSaveLocation.disabled = true;
    btnSaveLocation.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvataggio...';
    modalStatusMsg.hidden = true;

    const nome = document.getElementById("locName").value.trim();
    const indirizzo = document.getElementById("locAddress").value.trim();
    const isMain = document.getElementById("locMain").checked;

    // Costruzione dell'oggetto JSONB per i turni
    const orariStrutturati = {};
    document.querySelectorAll(".day-row").forEach(row => {
        const giorno = row.getAttribute("data-day");
        const isActive = row.querySelector(".day-active").checked;
        const startVal = row.querySelector(".time-start").value;
        const endVal = row.querySelector(".time-end").value;

        if (isActive && startVal && endVal) {
            orariStrutturati[giorno] = [{ inizio: startVal, fine: endVal }];
        } else {
            orariStrutturati[giorno] = [];
        }
    });

    try {
        if (isMain) {
            await supabase
    .from('provider_locations')
    .update({ is_principale: false })
    .eq('provider_id', currentUser.id)
    .eq('ruolo_associato', ruoloAssociato);
        }

        const { error } = await supabase.from('provider_locations').insert({
        provider_id: currentUser.id,
        nome_struttura: nome,
        indirizzo: indirizzo,
        citta: indirizzo.split(',').pop().trim() || "Città non specificata",
        latitudine: 45.4642,
        longitudine: 9.1900,
        is_principale: isMain,
        orari_disponibilita: orariStrutturati,
        ruolo_associato: ruoloAssociato
    });

        if (error) throw error;

        closeModalWindow();
        await fetchLocations();

    } catch (error) {
        modalStatusMsg.textContent = "Errore durante il salvataggio.";
        modalStatusMsg.hidden = false;
        await logError({ source: 'gestione_luoghi', action: 'save_location', errorMessage: error.message });
    } finally {
        btnSaveLocation.disabled = false;
        btnSaveLocation.textContent = "Salva sede";
    }
});

// ==========================================
// 5. CANCELLAZIONE
// ==========================================
async function deleteLocation(id) {
    try {
       const { error } = await supabase
    .from('provider_locations')
    .delete()
    .eq('id', id)
    .eq('provider_id', currentUser.id)
    .eq('ruolo_associato', ruoloAssociato);
        if (error) throw error;
        await fetchLocations();
    } catch (error) {
        alert("Errore durante l'eliminazione.");
        await fetchLocations(); // Resetta l'interfaccia
    }
}

// Gestione visibilità modale
btnOpenModal.addEventListener("click", () => modal.style.display = "flex");
btnCloseModal.addEventListener("click", closeModalWindow);
modal.addEventListener("click", (e) => { if (e.target === modal) closeModalWindow(); });

function closeModalWindow() {
    modal.style.display = "none";
    modalStatusMsg.hidden = true;
    locationForm.reset();
    generaSchedulerUI(); // Resetta i turni ai valori di default
}

init();