// ==========================================
// SETUP E IMPORT
// ==========================================
import { supabase } from '../utils/supabaseClient.js';
import { logError } from '../utils/logger.js';

let currentUser = null;

// Elementi DOM
const locationSelect = document.getElementById("locationSelect");
const btnSaveSchedule = document.getElementById("btnSaveSchedule");
const turniContainer = document.getElementById("turniContainer");

async function initDisponibilitaPro() {
    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            window.location.href = "../../index.html";
            return;
        }
        currentUser = user;

        await loadProLocations();
    } catch (error) {
        console.error("Errore inizializzazione:", error);
    }
}

// ==========================================
// CARICAMENTO SEDI (FILTRATO SOLO PER PROFESSIONISTA)
// ==========================================
async function loadProLocations() {
    try {
        const { data: locations, error } = await supabase
            .from('provider_locations')
            .select('id, nome_struttura, indirizzo')
            .eq('provider_id', currentUser.id)
            // LA RIGA MAGICA PER ISOLARE I DATI:
            .eq('ruolo_associato', 'professionista') 
            .order('is_principale', { ascending: false });

        if (error) throw error;

        // Se l'utente non ha sedi come professionista
        if (!locations || locations.length === 0) {
            locationSelect.innerHTML = `<option value="" disabled selected>Nessuna sede configurata. Aggiungine una dal Profilo.</option>`;
            locationSelect.disabled = true;
            return;
        }

        // Popola la tendina
        locationSelect.innerHTML = `<option value="" disabled selected>Scegli una sede...</option>`;
        
        locations.forEach(loc => {
            const option = document.createElement("option");
            option.value = loc.id;
            option.textContent = `${loc.nome_struttura} (${loc.indirizzo})`;
            locationSelect.appendChild(option);
        });

        // Sblocco UI al click
        locationSelect.addEventListener('change', () => {
            const selectedLocationId = locationSelect.value;
            if (selectedLocationId) {
                btnSaveSchedule.disabled = false;
                turniContainer.style.display = 'block';
                // TODO: loadWeekSchedule(selectedLocationId)
            }
        });

    } catch (error) {
        console.error("Errore nel caricamento dei luoghi del professionista:", error);
        
        await logError({
            source: 'disponibilita_pro',
            action: 'load_locations',
            errorMessage: error.message,
            errorCode: error.code || 'DB_FETCH_LOCATIONS_ERROR',
            context: { userId: currentUser?.id }
        });
        
        locationSelect.innerHTML = `<option value="" disabled selected>Errore di caricamento</option>`;
    }
}

initDisponibilitaPro();