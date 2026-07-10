import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let currentUser = null;
let serviziDisponibili = []; // Salveremo qui i servizi scaricati dal DB

// Elementi DOM
const form = document.getElementById("appointmentForm");
const petSelect = document.getElementById("petSelect");
const servizioSelect = document.getElementById("servizioSelect"); // IL NUOVO MENU A TENDINA
const dataInizioInput = document.getElementById("dataInizio");
const dataFineInput = document.getElementById("dataFine"); // Ora verrà calcolato in automatico
const costoInput = document.getElementById("costo");
const submitBtn = document.getElementById("submitBtn");
const formMessage = document.getElementById("formMessage");

// ---> IMPORTANTE: Definisci qui in che sezione sei (cambialo in 'professionista' nell'altro file)
const RUOLO_ATTUALE = 'veterinario'; 

async function initPage() {
    impostaDataMinima();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        window.location.href = "../../index.html";
        return;
    }
    currentUser = user;

    // Scarica sia i pazienti che i servizi
    await Promise.all([
        caricaPazientiDropdown(),
        caricaServiziDropdown()
    ]);
}

function impostaDataMinima() {
    const oraAttuale = new Date();
    const offsetMilitari = oraAttuale.getTimezoneOffset() * 60000;
    const isoLocale = new Date(oraAttuale.getTime() - offsetMilitari).toISOString().slice(0, 16);
    dataInizioInput.min = isoLocale;
}

// 1. CARICA PAZIENTI (Versione Definitiva e Sicura)
// ==========================================
async function caricaPazientiDropdown() {
    try {
        // STEP 1: Prendi i pet_id dalla tua tabella veterinarian_patients (solo quelli attivi)
        const { data: vetPatients, error: vpError } = await supabase
            .from('veterinarian_patients')
            .select('pet_id')
            .eq('veterinarian_id', currentUser.id)
            .eq('status', 'active'); // Sfruttiamo la colonna che hai creato!

        if (vpError) throw vpError;

        petSelect.innerHTML = ""; 

        // Se il veterinario non ha ancora pazienti, blocca e avvisa
        if (!vetPatients || vetPatients.length === 0) {
            petSelect.innerHTML = `<option value="" disabled selected>Nessun paziente in lista.</option>`;
            return;
        }

        // Estrae un array con solo gli ID degli animali (es. ['id1', 'id2'])
        const petIds = vetPatients.map(vp => vp.pet_id);

        // STEP 2: Cerca i dettagli di quegli animali direttamente nella tabella pets
        const { data: petsData, error: petsError } = await supabase
            .from('pets')
            .select('id, nome, owner_id')
            .in('id', petIds); // Cerca solo gli animali che corrispondono a quegli ID

        if (petsError) throw petsError;

        // STEP 3: Costruisci il menu a tendina
        petSelect.innerHTML = `<option value="" disabled selected>Scegli un animale...</option>`;

        petsData.forEach(pet => {
            const opt = document.createElement("option");
            opt.value = pet.id;
            opt.dataset.owner = pet.owner_id;
            opt.textContent = pet.nome;
            petSelect.appendChild(opt);
        });

        // Finalmente, SBLOCCA IL MENU!
        petSelect.disabled = false;

    } catch (error) {
        console.error("Errore caricamento pazienti:", error);
        petSelect.innerHTML = `<option value="" disabled>Errore di caricamento</option>`;
    }
}

// ==========================================
// 1. SCARICA I SERVIZI DALLA TABELLA provider_services
// ==========================================
async function caricaServiziDropdown() {
    try {
        const { data, error } = await supabase
            .from('provider_services')
            .select('*')
            .eq('provider_id', currentUser.id);

        if (error) throw error;
        
        serviziDisponibili = data || [];
        servizioSelect.innerHTML = `<option value="" disabled selected>Scegli un servizio...</option>`;

        serviziDisponibili.forEach(servizio => {
            const opt = document.createElement("option");
            opt.value = servizio.id; // Salviamo l'ID del servizio
            opt.textContent = `${servizio.nome_servizio} (${servizio.durata_minuti} min - €${servizio.prezzo})`;
            servizioSelect.appendChild(opt);
        });

    } catch (error) {
        console.error("Errore caricamento servizi:", error);
    }
}

// ==========================================
// 2. CALCOLO AUTOMATICO COSTO E ORARIO
// ==========================================
function aggiornaDettagliServizio() {
    // Evita errori se l'utente non ha ancora selezionato nulla
    if (petSelect.selectedIndex <= 0 || servizioSelect.selectedIndex <= 0) return;

    const selectedPetOpt = petSelect.options[petSelect.selectedIndex];
    const ownerId = selectedPetOpt ? selectedPetOpt.dataset.owner : null;
    
    const selectedServizioId = servizioSelect.value;
    const servizioObj = serviziDisponibili.find(s => s.id === selectedServizioId);

    // Se abbiamo selezionato sia l'animale che il servizio
    if (servizioObj) {
        
        // A prescindere da chi sia il cane, il costo NON è MAI modificabile a mano!
        costoInput.readOnly = true;
        costoInput.style.backgroundColor = "#F1F5F9"; // Sfondo grigino "bloccato"
        costoInput.style.color = "#475569";
        
        // A) Calcolo del costo: Se è il mio cane costa 0, altrimenti prende il prezzo dal DB
        if (ownerId === currentUser.id) {
            costoInput.value = "0.00";
        } else {
            costoInput.value = servizioObj.prezzo;
        }

        // B) Calcolo dell'orario di fine in automatico
        if (dataInizioInput.value) {
            const dataInizio = new Date(dataInizioInput.value);
            // Aggiungiamo i minuti del servizio all'orario di inizio
            const dataFine = new Date(dataInizio.getTime() + (servizioObj.durata_minuti * 60000));
            
            // Formattiamo la data per inserirla nell'input
            const offsetMilitari = dataFine.getTimezoneOffset() * 60000;
            dataFineInput.value = new Date(dataFine.getTime() - offsetMilitari).toISOString().slice(0, 16);
            dataFineInput.readOnly = true; 
            dataFineInput.style.backgroundColor = "#F1F5F9"; // Mostra anche l'orario di fine come "bloccato"
        }
    }
}

// Ascoltatori per far scattare il ricalcolo in tempo reale
petSelect.addEventListener("change", aggiornaDettagliServizio);
servizioSelect.addEventListener("change", aggiornaDettagliServizio);
dataInizioInput.addEventListener("change", aggiornaDettagliServizio);

// ==========================================
// 3. SALVATAGGIO CON RUOLO E CONTROLLO SOVRAPPOSIZIONE
// ==========================================
form.addEventListener("submit", async (e) => {
    e.preventDefault();
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvataggio...';
    formMessage.innerHTML = "";

    const selectedPetOpt = petSelect.options[petSelect.selectedIndex];
    const dataInizio = new Date(dataInizioInput.value);
    const dataFine = new Date(dataFineInput.value);
    
    try {
        // Controllo Sovrapposizione
        const { data: overlaps, error: checkError } = await supabase
            .from('appointments')
            .select('id')
            .eq('provider_id', currentUser.id)
            .lt('data_inizio', dataFine.toISOString()) 
            .gt('data_fine', dataInizio.toISOString()); 

        if (checkError) throw checkError;
        if (overlaps && overlaps.length > 0) throw new Error("Hai già un appuntamento in questo orario!");

        // Inserimento con il RUOLO così non si mischiano più!
        const { error: insertError } = await supabase
            .from('appointments')
            .insert({
                owner_id: selectedPetOpt.dataset.owner,
                provider_id: currentUser.id, 
                pet_id: selectedPetOpt.value,
                data_inizio: dataInizio.toISOString(),
                data_fine: dataFine.toISOString(),
                stato: 'programmato', 
                costo: parseFloat(costoInput.value),
                ruolo_provider: RUOLO_ATTUALE // <--- INSERISCE 'veterinario' o 'professionista'
                // opzionale: salva anche servizioSelect.value se hai una colonna service_id nella tabella appointments
            });

        if (insertError) throw insertError;

        formMessage.textContent = "Salvato con successo!";
        formMessage.style.color = "#059669";
        setTimeout(() => window.location.href = "agenda.html", 1500);

    } catch (error) {
        formMessage.textContent = error.message || "Errore salvataggio.";
        formMessage.style.color = "#DC2626";
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Conferma Appuntamento';
    }
});

initPage();