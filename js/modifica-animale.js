import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Elementi del DOM
const form = document.getElementById("editPetForm");
const inputName = document.getElementById("petName");
const inputSpecies = document.getElementById("petSpecies");
const inputBreed = document.getElementById("petBreed");
const inputDob = document.getElementById("petDob");
const inputMicrochip = document.getElementById("petMicrochip");
const statusMessage = document.getElementById("statusMessage");
const submitBtn = document.getElementById("submitBtn");

// 1. Recupera l'ID dell'animale dall'URL (es. modifica-animale.html?petId=123-abc)
const urlParams = new URLSearchParams(window.location.search);
const petId = urlParams.get('petId');

async function loadPetData() {
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

        if (error) throw error;

        // Popola i campi del form con i dati esistenti
        if (pet.nome) inputName.value = pet.nome;
        if (pet.specie) inputSpecies.value = pet.specie;
        if (pet.razza) inputBreed.value = pet.razza;
        if (pet.data_nascita) inputDob.value = pet.data_nascita;
        if (pet.microchip) inputMicrochip.value = pet.microchip;

    } catch (error) {
        console.error("Errore nel caricamento dati:", error);
        showMessage("Impossibile caricare i dati dell'animale.", "error");
    }
}

// 2. Salva le modifiche
form.addEventListener("submit", async (e) => {
    e.preventDefault();
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvataggio...';
    statusMessage.hidden = true;

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

        if (error) throw error;

        showMessage("Modifiche salvate con successo!", "success");
        
        // Torna al profilo dopo 1.5 secondi
        setTimeout(() => {
            window.location.href = `profilo-animale.html?petId=${petId}`;
        }, 1500);

    } catch (error) {
        console.error("Errore salvataggio:", error);
        showMessage("Errore durante il salvataggio: " + error.message, "error");
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