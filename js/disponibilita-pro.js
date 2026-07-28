// ==========================================
// SETUP E IMPORT
// ==========================================
import { supabase } from '../utils/supabaseClient.js';
import { logError } from '../utils/logger.js';

let currentUser = null;
let activeLocationId = null;

// Elementi DOM
let locationCardContainer;
let locationSelect;
let btnSaveSchedule;
let turniContainer; // Usiamo questo ID per il contenitore dei giorni
let statusMessage;

// ==========================================
// COSTANTI E CONFIGURAZIONI
// ==========================================
const RUOLO_ATTUALE = 'professionista'; 
const NOME_SEDE_DOMICILIO = 'A domicilio';
const PROFESSIONI_A_DOMICILIO = [
    'pet sitter', 'dog sitter', 'pet sitting', 'dog walker', 'passeggiatore', 'passeggiate cani'
];

const giorniSettimana = ['lunedi', 'martedi', 'mercoledi', 'giovedi', 'venerdi', 'sabato', 'domenica'];
const etichetteGiorni = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];

// ==========================================
// UTILITY
// ==========================================
function lavoraADomicilio(tipoProfessione) {
    if (!tipoProfessione) return false;
    const normalizzato = tipoProfessione.trim().toLowerCase();
    return PROFESSIONI_A_DOMICILIO.some(p => normalizzato.includes(p));
}

function showStatus(msg, type) {
    if (!statusMessage) return alert(msg);
    statusMessage.textContent = msg;
    statusMessage.className = `status-msg status-${type}`;
    statusMessage.hidden = false;
    setTimeout(() => { statusMessage.hidden = true; }, 4000);
}

// ==========================================
// GENERATORE UI TURNI (STILE VETERINARIO)
// ==========================================
function renderWeeklyScheduler(orariJson) {
    if (!turniContainer) return;
    turniContainer.innerHTML = '';
    
    // Assicuriamoci che sia un oggetto
    const orari = typeof orariJson === 'object' && orariJson !== null ? orariJson : {}; 

    giorniSettimana.forEach((giorno, index) => {
        // Verifica se ci sono orari salvati per questo giorno
        const fasceGiorno = orari[giorno] || [];
        const isAttivo = fasceGiorno.length > 0;
        
        // Estrai inizio/fine dall'oggetto {inizio: "...", fine: "..."}
        const inizioVal = isAttivo && fasceGiorno[0].inizio ? fasceGiorno[0].inizio : '09:00';
        const fineVal = isAttivo && fasceGiorno[0].fine ? fasceGiorno[0].fine : '18:00';

        const card = document.createElement('div');
        card.className = `day-card ${isAttivo ? '' : 'disabled'}`;
        card.dataset.day = giorno;
        card.style.marginBottom = '15px'; // Spaziatura base

        card.innerHTML = `
            <div class="day-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <div class="day-name" style="font-weight: 600; color: #1E293B;">${etichetteGiorni[index]}</div>
                <label class="switch">
                    <input type="checkbox" class="day-toggle" ${isAttivo ? 'checked' : ''}>
                    <span class="slider"></span>
                </label>
            </div>
            <div class="time-slots" style="display: flex; align-items: center; gap: 10px;">
                <input type="time" class="time-input time-start" value="${inizioVal}" ${isAttivo ? '' : 'disabled'} style="flex: 1; padding: 10px; border-radius: 8px; border: 1px solid #CBD5E1;">
                <span class="time-separator" style="color: #94A3B8; font-weight: 600;">al</span>
                <input type="time" class="time-input time-end" value="${fineVal}" ${isAttivo ? '' : 'disabled'} style="flex: 1; padding: 10px; border-radius: 8px; border: 1px solid #CBD5E1;">
            </div>
        `;

        // Logica visiva del toggle switch
        const toggleBtn = card.querySelector('.day-toggle');
        const inputs = card.querySelectorAll('.time-input');
        
        toggleBtn.addEventListener('change', (e) => {
            const checked = e.target.checked;
            card.classList.toggle('disabled', !checked);
            inputs.forEach(inp => inp.disabled = !checked);
            
            // Ripulisci i valori se viene disabilitato
            if (!checked) {
                inputs[0].value = '';
                inputs[1].value = '';
            } else {
                // Imposta valori default se era vuoto
                if(!inputs[0].value) inputs[0].value = '09:00';
                if(!inputs[1].value) inputs[1].value = '18:00';
            }
        });

        turniContainer.appendChild(card);
    });
}

// ==========================================
// CARICAMENTO ORARI DAL DB
// ==========================================
async function loadWeekSchedule(locationId) {
    try {
        const { data, error } = await supabase
            .from('provider_locations')
            .select('orari_disponibilita')
            .eq('id', locationId)
            .single();

        if (error) throw error;
        
        // Passiamo i dati al renderizzatore UI
        renderWeeklyScheduler(data.orari_disponibilita);

    } catch (error) {
        console.error("Errore caricamento orari:", error);
        renderWeeklyScheduler({}); // Se fallisce, renderizza vuoto
    }
}

// ==========================================
// SALVATAGGIO ORARI (FORMATO VETERINARIO)
// ==========================================
async function saveSchedule() {
    if (!activeLocationId) {
        alert("Errore interno: ID Sede non configurato.");
        return;
    }

    btnSaveSchedule.disabled = true;
    const originalText = btnSaveSchedule.innerHTML;
    btnSaveSchedule.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvataggio...';

    const nuoviOrari = {};
    const dayCards = turniContainer.querySelectorAll('.day-card');

    dayCards.forEach(card => {
        const giorno = card.dataset.day;
        const isActive = card.querySelector('.day-toggle').checked;
        
        if (isActive) {
            const start = card.querySelector('.time-start').value;
            const end = card.querySelector('.time-end').value;
            
            if (start && end) {
                // STESSO IDENTICO FORMATO DEL VETERINARIO
                nuoviOrari[giorno] = [{ inizio: start, fine: end }];
            } else {
                nuoviOrari[giorno] = [];
            }
        } else {
            nuoviOrari[giorno] = [];
        }
    });

    try {
        const { error } = await supabase
            .from('provider_locations')
            .update({ orari_disponibilita: nuoviOrari })
            .eq('id', activeLocationId)
            .eq('provider_id', currentUser.id);

        if (error) throw error;
        showStatus("Orari salvati con successo!", "success");

    } catch (error) {
        console.error("Errore nel salvataggio:", error);
        showStatus("Errore durante il salvataggio. Riprova.", "error");
    } finally {
        btnSaveSchedule.disabled = false;
        btnSaveSchedule.innerHTML = originalText;
    }
}

// ==========================================
// GESTIONE SEDE A DOMICILIO (PET SITTER)
// ==========================================
async function setupSedeDomicilio() {
    try {
        if (locationCardContainer) locationCardContainer.style.display = 'none';

        let { data: sede, error } = await supabase
            .from('provider_locations')
            .select('id, orari_disponibilita')
            .eq('provider_id', currentUser.id)
            .eq('ruolo_associato', RUOLO_ATTUALE)
            .eq('nome_struttura', NOME_SEDE_DOMICILIO)
            .maybeSingle();

        if (error) throw error;

        if (!sede) {
            const { data: nuovaSede, error: insertError } = await supabase
                .from('provider_locations')
                .insert({
                    provider_id: currentUser.id,
                    nome_struttura: NOME_SEDE_DOMICILIO,
                    indirizzo: 'A domicilio',
                    citta: '',
                    latitudine: 0,
                    longitudine: 0,
                    is_principale: true,
                    ruolo_associato: RUOLO_ATTUALE
                })
                .select('id, orari_disponibilita')
                .single();

            if (insertError) throw insertError;
            sede = nuovaSede;
        }

        activeLocationId = sede.id;
        turniContainer.style.display = 'block';
        btnSaveSchedule.disabled = false;
        
        renderWeeklyScheduler(sede.orari_disponibilita);

    } catch (error) {
        console.error("Errore setup sede a domicilio:", error);
    }
}

// ==========================================
// CARICAMENTO SEDI (ALTRI PROFESSIONISTI)
// ==========================================
async function loadProLocations() {
    try {
        if (locationCardContainer) locationCardContainer.style.display = 'block';

        const { data: locations, error } = await supabase
            .from('provider_locations')
            .select('id, nome_struttura, indirizzo, orari_disponibilita')
            .eq('provider_id', currentUser.id)
            .eq('ruolo_associato', RUOLO_ATTUALE)
            .order('is_principale', { ascending: false });

        if (error) throw error;

        if (!locations || locations.length === 0) {
            locationSelect.innerHTML = `<option value="" disabled selected>Nessuna sede configurata.</option>`;
            locationSelect.disabled = true;
            return;
        }

        locationSelect.innerHTML = `<option value="" disabled selected>Scegli una sede...</option>`;
        
        locations.forEach(loc => {
            const option = document.createElement("option");
            option.value = loc.id;
            // Memorizziamo il JSON degli orari nel dataset per usarlo subito senza richiamare il DB
            option.dataset.orari = JSON.stringify(loc.orari_disponibilita || {});
            option.textContent = `${loc.nome_struttura} (${loc.indirizzo})`;
            locationSelect.appendChild(option);
        });

        locationSelect.addEventListener('change', () => {
            activeLocationId = locationSelect.value;
            if (activeLocationId) {
                const selectedOption = locationSelect.options[locationSelect.selectedIndex];
                const orariSalvati = JSON.parse(selectedOption.dataset.orari);
                
                turniContainer.style.display = 'block';
                btnSaveSchedule.disabled = false;
                renderWeeklyScheduler(orariSalvati);
            }
        });

    } catch (error) {
        console.error("Errore nel caricamento sedi:", error);
    }
}

// ==========================================
// INIZIALIZZAZIONE
// ==========================================
async function initDisponibilitaPro() {
    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) return window.location.href = "../../index.html";
        currentUser = user;

        const { data: proRow, error: proError } = await supabase
            .from('professionals')
            .select('tipo_professione')
            .eq('user_id', currentUser.id)
            .maybeSingle();

        if (proError) throw proError;

        if (lavoraADomicilio(proRow?.tipo_professione)) {
            await setupSedeDomicilio();
        } else {
            await loadProLocations();
        }
    } catch (error) {
        console.error("Errore init:", error);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    locationCardContainer = document.getElementById("locationCardContainer");
    locationSelect = document.getElementById("locationSelect");
    btnSaveSchedule = document.getElementById("btnSaveSchedule");
    turniContainer = document.getElementById("turniContainer");
    statusMessage = document.getElementById("statusMessage"); // Se c'è nel DOM

    if (btnSaveSchedule) btnSaveSchedule.addEventListener('click', saveSchedule);

    initDisponibilitaPro();
});