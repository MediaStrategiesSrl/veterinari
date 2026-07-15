// ==========================================
// 1. IMPORT CENTRALIZZATI
// ==========================================
// ATTENZIONE: Aggiusta i percorsi "../" in base alla posizione reale di questo file!
import { supabase } from '../utils/supabaseClient.js';
import { logError } from '../utils/logger.js';

// Elementi del DOM
const form = document.getElementById("editPetForm");
const inputName = document.getElementById("petName");
const inputSpecies = document.getElementById("petSpecies");
const inputBreed = document.getElementById("petBreed");
const inputDob = document.getElementById("petDob");
const inputMicrochip = document.getElementById("petMicrochip");
const statusMessage = document.getElementById("statusMessage");
const submitBtn = document.getElementById("submitBtn");

// Recupera l'ID dell'animale dall'URL (es. modifica-animale.html?petId=123-abc)
const urlParams = new URLSearchParams(window.location.search);
const petId = urlParams.get('petId');

async function loadPetData() {
    // ERRORE LOGICO: Manca l'ID. Mostriamo il messaggio nella UI ma NON inviamo log al DB.
    if (!petId) {
        showMessage("ID animale mancante nell'URL.", "error");
        return;
    }

    try {
        const { data: pet, error } = await supabase
            .from('pets')
            .select('*')
            .eq('id', petId)
            .single();

        // Rilanciamo l'errore DB per gestirlo nel catch
        if (error) throw Object.assign(new Error(error.message), { code: error.code || 'DB_FETCH_PET_ERROR' });

        // Popola i campi del form con i dati esistenti
        if (pet.nome) inputName.value = pet.nome;
        if (pet.specie) inputSpecies.value = pet.specie;
        if (pet.razza) inputBreed.value = pet.razza;
        if (pet.data_nascita) inputDob.value = pet.data_nascita;
        if (pet.microchip) inputMicrochip.value = pet.microchip;

    } catch (error) {
        console.error("Errore nel caricamento dati:", error);
        
        // ERRORE DI SISTEMA/DB: Registriamo e lanciamo l'allarme
        await logError({
            source: 'modifica_animale',
            action: 'fetch_pet_data',
            errorMessage: error.message || "Impossibile caricare i dati dell'animale",
            errorCode: error.code || 'UNKNOWN_DB_ERROR',
            context: { petId_richiesto: petId }
        });

        showMessage("Impossibile comunicare col server. Riprova più tardi.", "error");
    }
}

// 2. Salva le modifiche
form.addEventListener("submit", async (e) => {
    e.preventDefault();
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvataggio...';
    statusMessage.hidden = true;

    // IL BUTTAFUORI: CONTROLLO MICROCHIP IN JS
    // ==========================================
    // ERRORE LOGICO: Input utente errato. Blocchiamo ma NON salviamo nei log DB.
    const microchipValue = inputMicrochip.value.trim();
    if (microchipValue !== "") {
        const regexMicrochip = /^\d{15}$/;
        if (!regexMicrochip.test(microchipValue)) {
            showMessage("Errore: Il numero del microchip deve contenere esattamente 15 cifre.", "error");
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'Salva Modifiche';
            return; // <-- BLOCCA TUTTO, NON INVIA AL DATABASE
        }
    }

    try {
        // Prepara i dati da aggiornare
        const updates = {
            nome: inputName.value.trim(),
            specie: inputSpecies.value,
            razza: inputBreed.value.trim(),
            data_nascita: inputDob.value || null, // Gestisce la data vuota
            microchip: inputMicrochip.value.trim() || null
        };

        const { error } = await supabase
            .from('pets')
            .update(updates)
            .eq('id', petId);

        // Rilanciamo l'errore DB per gestirlo nel catch
        if (error) throw Object.assign(new Error(error.message), { code: error.code || 'DB_UPDATE_PET_ERROR' });

        showMessage("Modifiche salvate con successo!", "success");
        
        // Torna al profilo dopo 1.5 secondi
        setTimeout(() => {
            window.location.href = `profilo-animale.html?petId=${petId}`;
        }, 1500);

    } catch (error) {
        console.error("Errore salvataggio:", error);
        
        // ERRORE DI SISTEMA/DB: Registriamo e lanciamo l'allarme
        await logError({
            source: 'modifica_animale',
            action: 'update_pet_data',
            errorMessage: error.message || "Errore durante l'update nel database",
            errorCode: error.code || 'UNKNOWN_DB_ERROR',
            context: { petId: petId }
        });

        showMessage("Errore durante il salvataggio. I nostri tecnici sono stati avvisati.", "error");
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Salva Modifiche';
    }
});

function showMessage(text, type) {
    statusMessage.textContent = text;
    statusMessage.style.color = type === 'error' ? '#DC2626' : '#16A34A';
    statusMessage.style.textAlign = 'center';
    statusMessage.style.display = 'block';
    statusMessage.style.marginTop = '15px';
    statusMessage.hidden = false;
}

// Avvia il caricamento iniziale
loadPetData();