// ==========================================
// 1. IMPORT E SETUP
// ==========================================
import { supabase } from '../utils/supabaseClient.js';
import { logError } from '../utils/logger.js';
import {
    GIORNI_SETTIMANA as giorniSettimana,
    findScheduleConflict,
    clearConflictHighlight,
    highlightConflictDay
} from '../utils/scheduleOverlap.js';

let currentUser = null;
let userLocations = [];

// Elementi DOM
const locationSelect = document.getElementById("locationSelect");
const weeklySchedulerContainer = document.getElementById("weeklySchedulerContainer");
const daysContainer = document.getElementById("daysContainer");
const btnSaveSchedule = document.getElementById("btnSaveSchedule");
const statusMessage = document.getElementById("statusMessage");

// ==========================================
// 2. INIZIALIZZAZIONE E AUTH
// ==========================================
async function init() {
    try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error || !user) {
            window.location.href = "../login.html";
            return;
        }
        currentUser = user;
        await loadLocations();
    } catch (error) {
        console.error("Errore inizializzazione:", error);
    }
}

// ==========================================
// 3. CARICAMENTO SEDI
// ==========================================
async function loadLocations() {
    try {
        const { data, error } = await supabase
            .from('provider_locations')
            .select('id, nome_struttura, indirizzo, orari_disponibilita')
            .eq('provider_id', currentUser.id)
            .order('is_principale', { ascending: false });

        if (error) throw error;
        userLocations = data || [];

        locationSelect.innerHTML = '<option value="" disabled selected>Scegli una sede...</option>';

        if (userLocations.length === 0) {
            locationSelect.innerHTML = '<option value="" disabled>Nessuna sede configurata. Aggiungine una dal Profilo.</option>';
            return;
        }

        userLocations.forEach(loc => {
            const option = document.createElement('option');
            option.value = loc.id;
            option.textContent = `${loc.nome_struttura} (${loc.indirizzo || 'Indirizzo non specificato'})`;
            locationSelect.appendChild(option);
        });

        // Event listener cambio sede
        locationSelect.addEventListener('change', (e) => {
            const selectedId = e.target.value;
            const locationData = userLocations.find(l => l.id === selectedId);
            if (locationData) {
                renderWeeklyScheduler(locationData.orari_disponibilita);
                btnSaveSchedule.disabled = false;
                weeklySchedulerContainer.style.display = 'block';
                hideStatus();
            }
        });

    } catch (error) {
        await logError({ source: 'disponibilita', action: 'loadLocations', errorMessage: error.message });
        locationSelect.innerHTML = '<option value="" disabled>Errore di caricamento</option>';
    }
}

// ==========================================
// 4. RENDER UI SETTIMANALE (LEGGE IL JSONB)
// ==========================================
function renderWeeklyScheduler(orariJson) {
    daysContainer.innerHTML = '';
    const orari = typeof orariJson === 'object' && orariJson !== null ? orariJson : {};

    giorniSettimana.forEach(giorno => {
        // Verifica se ci sono orari salvati per questo giorno (es. orari["lunedi"][0].inizio)
        const fasceGiorno = orari[giorno] || [];
        const isAttivo = fasceGiorno.length > 0;
        const inizioVal = isAttivo ? fasceGiorno[0].inizio : '09:00';
        const fineVal = isAttivo ? fasceGiorno[0].fine : '18:00';

        const card = document.createElement('div');
        card.className = `day-card ${isAttivo ? '' : 'disabled'}`;
        card.dataset.day = giorno;

        card.innerHTML = `
            <div class="day-header">
                <div class="day-name">${giorno}</div>
                <label class="switch">
                    <input type="checkbox" class="day-toggle" ${isAttivo ? 'checked' : ''}>
                    <span class="slider"></span>
                </label>
            </div>
            <div class="time-slots">
                <input type="time" class="time-input time-start" value="${inizioVal}" ${isAttivo ? '' : 'disabled'}>
                <span class="time-separator">al</span>
                <input type="time" class="time-input time-end" value="${fineVal}" ${isAttivo ? '' : 'disabled'}>
            </div>
        `;

        // Logica visiva del toggle switch
        const toggleBtn = card.querySelector('.day-toggle');
        const inputs = card.querySelectorAll('.time-input');

        toggleBtn.addEventListener('change', (e) => {
            const checked = e.target.checked;
            card.classList.toggle('disabled', !checked);
            inputs.forEach(inp => inp.disabled = !checked);
        });

        daysContainer.appendChild(card);
    });
}

// ==========================================
// 5. SALVATAGGIO DATI (AGGIORNA IL JSONB)
//    Include il controllo anti-sovrapposizione con le
//    altre sedi dello stesso provider (qualsiasi ruolo).
//    Logica condivisa in utils/scheduleOverlap.js
// ==========================================
btnSaveSchedule.addEventListener('click', async () => {
    const selectedId = locationSelect.value;
    if (!selectedId) return;

    clearConflictHighlight(daysContainer);

    // 1. Costruzione nuovo oggetto JSON leggendo i valori del DOM
    const nuoviOrari = {};
    const dayCards = daysContainer.querySelectorAll('.day-card');

    dayCards.forEach(card => {
        const giorno = card.dataset.day;
        const isActive = card.querySelector('.day-toggle').checked;

        if (isActive) {
            const start = card.querySelector('.time-start').value;
            const end = card.querySelector('.time-end').value;

            if (start && end) {
                // Struttura ad Array per supportare multi-fasce in futuro
                nuoviOrari[giorno] = [{ inizio: start, fine: end }];
            } else {
                nuoviOrari[giorno] = [];
            }
        } else {
            nuoviOrari[giorno] = [];
        }
    });

    // 2. Controllo sovrapposizione con le altre sedi dello stesso provider
    const conflict = findScheduleConflict(selectedId, nuoviOrari, userLocations);
    if (conflict) {
        const giornoLabel = conflict.giorno.charAt(0).toUpperCase() + conflict.giorno.slice(1);
        showStatus(
            `Conflitto di orario il ${giornoLabel}: si sovrappone con il turno già impostato per "${conflict.sedeNome}". Una stessa persona non può essere disponibile in due sedi nello stesso momento.`,
            "error"
        );
        highlightConflictDay(daysContainer, conflict.giorno);
        return; // blocco il salvataggio
    }

    btnSaveSchedule.disabled = true;
    btnSaveSchedule.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvataggio...';

    try {
        // 3. UPDATE su Supabase
        const { error } = await supabase
            .from('provider_locations')
            .update({ orari_disponibilita: nuoviOrari })
            .eq('id', selectedId)
            .eq('provider_id', currentUser.id);

        if (error) throw error;

        // 4. Aggiorna Cache Locale
        const locIndex = userLocations.findIndex(l => l.id === selectedId);
        if (locIndex !== -1) {
            userLocations[locIndex].orari_disponibilita = nuoviOrari;
        }

        showStatus("Orari salvati e sincronizzati con successo!", "success");

    } catch (error) {
        await logError({ source: 'disponibilita', action: 'saveSchedule', errorMessage: error.message });
        // Se il DB rifiuta per sovrapposizione (es. race condition tra due tab,
        // controllo client bypassato), mostriamo il messaggio reale del trigger
        // invece di un errore generico.
        const msg = (error && error.message && error.message.includes('sovrappone'))
            ? error.message
            : "Errore di rete durante il salvataggio.";
        showStatus(msg, "error");
    } finally {
        btnSaveSchedule.disabled = false;
        btnSaveSchedule.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Salva disponibilità';
    }
});

// Utility Messaggi
function showStatus(msg, type) {
    statusMessage.textContent = msg;
    statusMessage.className = `status-msg status-${type}`;
    statusMessage.hidden = false;
    setTimeout(() => { hideStatus(); }, 4000);
}

function hideStatus() {
    statusMessage.hidden = true;
}

init();