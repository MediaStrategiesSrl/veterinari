import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let currentUser = null;
let serviziDisponibili = []; // Salveremo qui i servizi scaricati dal DB

// Elementi DOM
const form = document.getElementById("appointmentForm");
const petSelect = document.getElementById("petSelect");
const servizioSelect = document.getElementById("servizioSelect"); 
const dataInizioInput = document.getElementById("dataInizio");
const dataFineInput = document.getElementById("dataFine"); 
const costoInput = document.getElementById("costo");
const submitBtn = document.getElementById("submitBtn");
const formMessage = document.getElementById("formMessage");

// ---> IMPORTANTE: Definisci qui in che sezione sei 
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

// ==========================================
// 1. CARICA PAZIENTI
// ==========================================
async function caricaPazientiDropdown() {
    try {
        const { data: vetPatients, error: vpError } = await supabase
            .from('veterinarian_patients')
            .select('pet_id')
            .eq('veterinarian_id', currentUser.id)
            .eq('status', 'active');

        if (vpError) throw vpError;

        petSelect.innerHTML = ""; 

        if (!vetPatients || vetPatients.length === 0) {
            petSelect.innerHTML = `<option value="" disabled selected>Nessun paziente in lista.</option>`;
            return;
        }

        const petIds = vetPatients.map(vp => vp.pet_id);

        const { data: petsData, error: petsError } = await supabase
            .from('pets')
            .select('id, nome, owner_id')
            .in('id', petIds);

        if (petsError) throw petsError;

        petSelect.innerHTML = `<option value="" disabled selected>Scegli un animale...</option>`;

        petsData.forEach(pet => {
            const opt = document.createElement("option");
            opt.value = pet.id;
            opt.dataset.owner = pet.owner_id;
            opt.textContent = pet.nome;
            petSelect.appendChild(opt);
        });

        petSelect.disabled = false;

    } catch (error) {
        console.error("Errore caricamento pazienti:", error);
        petSelect.innerHTML = `<option value="" disabled>Errore di caricamento</option>`;
    }
}

// ==========================================
// 2. SCARICA I SERVIZI
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
            opt.value = servizio.id;
            opt.textContent = `${servizio.nome_servizio} (${servizio.durata_minuti} min - €${servizio.prezzo})`;
            servizioSelect.appendChild(opt);
        });

    } catch (error) {
        console.error("Errore caricamento servizi:", error);
    }
}

// ==========================================
// 3. CALCOLO AUTOMATICO COSTO E ORARIO (SBLOCCO BOTTONE QUI)
// ==========================================
function aggiornaDettagliServizio() {
    // Se manca l'animale, il servizio o la data iniziale, teniamo bloccato
    if (petSelect.selectedIndex <= 0 || servizioSelect.selectedIndex <= 0 || !dataInizioInput.value) {
        submitBtn.disabled = true;
        return;
    }

    const selectedPetOpt = petSelect.options[petSelect.selectedIndex];
    const ownerId = selectedPetOpt ? selectedPetOpt.dataset.owner : null;
    
    const selectedServizioId = servizioSelect.value;
    const servizioObj = serviziDisponibili.find(s => s.id === selectedServizioId);

    if (servizioObj) {
        costoInput.readOnly = true;
        costoInput.style.backgroundColor = "#F1F5F9";
        costoInput.style.color = "#475569";
        
        if (ownerId === currentUser.id) {
            costoInput.value = "0.00";
        } else {
            costoInput.value = servizioObj.prezzo;
        }

        if (dataInizioInput.value) {
            const dataInizio = new Date(dataInizioInput.value);
            const dataFine = new Date(dataInizio.getTime() + (servizioObj.durata_minuti * 60000));
            
            const offsetMilitari = dataFine.getTimezoneOffset() * 60000;
            dataFineInput.value = new Date(dataFine.getTime() - offsetMilitari).toISOString().slice(0, 16);
            dataFineInput.readOnly = true; 
            dataFineInput.style.backgroundColor = "#F1F5F9";

            // SBLOCCO BOTTONE! Quando tutto è compilato correttamente, accendiamo il bottone
            submitBtn.disabled = false;
        }
    }
}

petSelect.addEventListener("change", aggiornaDettagliServizio);
servizioSelect.addEventListener("change", aggiornaDettagliServizio);
dataInizioInput.addEventListener("change", aggiornaDettagliServizio);

// ==========================================
// 4. SALVATAGGIO APPUNTAMENTO E INVIO EMAIL
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

        // 4A. INSERIMENTO NEL DATABASE
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
                ruolo_provider: RUOLO_ATTUALE
            });

        if (insertError) throw insertError;

        // ==========================================
        // 4B. INVIO EMAIL TRAMITE EDGE FUNCTION
        // ==========================================
        try {
            const { data: vetProfile } = await supabase
                .from('profiles')
                .select('nome, cognome')
                .eq('id', currentUser.id)
                .single();
            
            const nomeProf = vetProfile ? `${vetProfile.nome} ${vetProfile.cognome}`.trim() : "Il tuo Professionista";
            const dataVisitaFormattata = dataInizio.toLocaleString('it-IT', { dateStyle: 'long', timeStyle: 'short' });

            const datiEmail = {
                emailProprietario: "mediastrategiessrl@gmail.com", 
                emailProfessionista: currentUser.email,
                nomeAnimale: selectedPetOpt.textContent,
                nomeProfessionista: nomeProf,
                dataVisita: dataVisitaFormattata,
                noteAggiuntive: "Questo appuntamento è stato inserito direttamente dalla struttura."
            };

            const { data: funcData, error: funcError } = await supabase.functions.invoke('send-booking-email', {
                body: datiEmail
            });

            if (funcError) {
                console.warn("Appuntamento salvato, ma errore nell'invio della mail:", funcError);
            } else {
                console.log("Email transazionali inviate con successo!", funcData);
            }
        } catch (emailErr) {
            console.error("Errore imprevisto durante l'invio delle email:", emailErr);
        }
        // ==========================================

        formMessage.textContent = "Appuntamento confermato! Email inviata.";
        formMessage.style.color = "#059669";
        
        setTimeout(() => window.location.href = "agenda.html", 2000);

    } catch (error) {
        formMessage.textContent = error.message || "Errore salvataggio.";
        formMessage.style.color = "#DC2626";
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Conferma Appuntamento';
    }
});

initPage();