import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let currentUser = null;

// Elementi DOM
const form = document.getElementById("appointmentForm");
const petSelect = document.getElementById("petSelect");
const dataInizioInput = document.getElementById("dataInizio");
const dataFineInput = document.getElementById("dataFine");
const costoInput = document.getElementById("costo");
const submitBtn = document.getElementById("submitBtn");
const formMessage = document.getElementById("formMessage");

async function initPage() {
    // 1. Configura i limiti temporali minimi (No appuntamenti nel passato)
    impostaDataMinima();

    // 2. Controllo Autenticazione
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        window.location.href = "login.html";
        return;
    }
    currentUser = user;

    // 3. Scarica i pazienti del veterinario per riempire il menu a tendina
    await caricaPazientiDropdown();
}

// Forza il calendario HTML a rifiutare orari passati
function impostaDataMinima() {
    const oraAttuale = new Date();
    // Converte l'orario locale in formato richiesto da datetime-local (YYYY-MM-DDTHH:MM)
    const offsetMilitari = oraAttuale.getTimezoneOffset() * 60000;
    const isoLocale = new Date(oraAttuale.getTime() - offsetMilitari).toISOString().slice(0, 16);
    
    dataInizioInput.min = isoLocale;
    dataFineInput.min = isoLocale;
}

async function caricaPazientiDropdown() {
    try {
        const { data, error } = await supabase
            .from('veterinarian_patients')
            .select(`
                pet_id,
                pets ( nome, owner_id )
            `)
            .eq('veterinarian_id', currentUser.id);

        if (error) throw error;

        petSelect.innerHTML = ""; // Svuota loading

        if (!data || data.length === 0) {
            petSelect.innerHTML = `<option value="" disabled selected>Nessun paziente in lista. Scansiona prima un QR.</option>`;
            return;
        }

        // Aggiungi l'opzione di default neutra
        petSelect.innerHTML = `<option value="" disabled selected>Scegli un animale...</option>`;

        // Popola la select salvando l'owner_id dentro un attributo custom HTML5 (data-owner)
        data.forEach(item => {
            if (item.pets) {
                const opt = document.createElement("option");
                opt.value = item.pet_id;
                opt.dataset.owner = item.pets.owner_id;
                opt.textContent = item.pets.nome;
                petSelect.appendChild(opt);
            }
        });

        // Abilita la select e il bottone di salvataggio
        petSelect.disabled = false;
        submitBtn.disabled = false;

    } catch (error) {
        console.error("Errore caricamento pazienti:", error);
        formMessage.textContent = "Impossibile caricare la lista pazienti.";
        formMessage.style.color = "#DC2626";
    }
}

// ==========================================
// SALVATAGGIO APPUNTAMENTO NEL DB
// ==========================================
form.addEventListener("submit", async (e) => {
    e.preventDefault();

    // SICUREZZA 1: Disabilita subito il bottone (Blocco totale dei cloni da doppio-click)
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvataggio...';
    formMessage.innerHTML = "";

    // Recupera l'opzione selezionata per estrarre pet_id e owner_id
    const selectedOption = petSelect.options[petSelect.selectedIndex];
    const petId = selectedOption.value;
    const ownerId = selectedOption.dataset.owner;

    const dataInizio = new Date(dataInizioInput.value);
    const dataFine = new Date(dataFineInput.value);
    const costo = parseFloat(costoInput.value);

    try {
        // SICUREZZA 2: Controllo logico delle date prima di disturbare il database
        if (dataFine <= dataInizio) {
            throw new Error("L'orario di fine visita deve essere successivo all'orario di inizio.");
        }

        // Esegui l'inserimento rispettando al 100% i campi e i vincoli inviati
        const { error: insertError } = await supabase
            .from('appointments')
            .insert({
                owner_id: ownerId,
                provider_id: currentUser.id, // ID del veterinario loggato
                pet_id: petId,
                data_inizio: dataInizio.toISOString(),
                data_fine: dataFine.toISOString(),
                stato: 'programmato', // Stato di default come richiesto dal tuo schema
                costo: costo
            });

        if (insertError) throw insertError;

        // Successo! Mostra messaggio verde e torna all'agenda
        formMessage.textContent = "Appuntamento registrato con successo!";
        formMessage.style.color = "#059669";

        setTimeout(() => {
            window.location.href = "agenda.html";
        }, 1500);

    } catch (error) {
        console.error("Errore salvataggio:", error);
        formMessage.textContent = error.message || "Errore durante il salvataggio dell'appuntamento.";
        formMessage.style.color = "#DC2626";
        
        // In caso di errore riabilita il bottone per permettere la correzione
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Conferma Appuntamento';
    }
});

// Avvia la pagina
initPage();