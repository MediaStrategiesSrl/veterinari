import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;

// Elementi DOM
const availabilityToggle = document.getElementById("availabilityToggle");
const availabilityText = document.getElementById("availabilityText");
const waitTimeText = document.getElementById("waitTimeText");
const oggiDataText = document.getElementById("oggiData");
const agendaContainer = document.getElementById("agendaContainer");

async function initDashboard() {
    impostaDataOggi();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        window.location.href = "index.html";
        return;
    }
    currentUser = user;

    // Eseguiamo i caricamenti in parallelo
    await Promise.all([
        caricaStatoDisponibilita(),
        caricaAgendaDinamica()
    ]);
}

function impostaDataOggi() {
    const options = { day: 'numeric', month: 'long' };
    const oggi = new Date().toLocaleDateString('it-IT', options);
    oggiDataText.textContent = `Oggi, ${oggi}`;
}

// ==========================================
// 1. GESTIONE URGENZE (Fix Errore Connessione)
// ==========================================
async function caricaStatoDisponibilita() {
    try {
        const { data: vetData, error } = await supabase
            .from('veterinarians')
            .select('is_available_now')
            .eq('user_id', currentUser.id)
            .single();

        // Se l'errore è PGRST116 significa "Nessuna riga trovata" (Il veterinario non esiste ancora)
        if (error && error.code === 'PGRST116') {
            availabilityText.textContent = "Profilo inattivo";
            waitTimeText.textContent = "Completa la registrazione Vet per ricevere urgenze.";
            availabilityToggle.disabled = true;
            return;
        } else if (error) {
            throw error;
        }

        // Se il veterinario esiste nel DB
        if (vetData) {
            const isAvailable = vetData.is_available_now;
            availabilityToggle.checked = isAvailable;
            aggiornaTestoUrgenze(isAvailable);
            availabilityToggle.disabled = false;
        }

    } catch (error) {
        console.error("Errore nel recupero dati veterinario:", error);
        availabilityText.textContent = "Errore di connessione";
    }
}

availabilityToggle.addEventListener('change', async (e) => {
    const isNowAvailable = e.target.checked;
    availabilityToggle.disabled = true;
    availabilityText.textContent = "Salvataggio...";

    try {
        const { error } = await supabase
            .from('veterinarians')
            .update({ is_available_now: isNowAvailable })
            .eq('user_id', currentUser.id);

        if (error) throw error;
        aggiornaTestoUrgenze(isNowAvailable);

    } catch (error) {
        availabilityToggle.checked = !isNowAvailable;
        aggiornaTestoUrgenze(!isNowAvailable);
        alert("Impossibile aggiornare lo stato.");
    } finally {
        availabilityToggle.disabled = false;
    }
});

function aggiornaTestoUrgenze(isAvailable) {
    if (isAvailable) {
        availabilityText.textContent = "Sei disponibile";
        waitTimeText.textContent = "In attesa di chiamate..."; 
    } else {
        availabilityText.textContent = "Non disponibile";
        waitTimeText.textContent = "Attiva per ricevere urgenze";
    }
}

// ==========================================
// 2. AGENDA DINAMICA
// ==========================================
async function caricaAgendaDinamica() {
    try {
        // Otteniamo l'inizio e la fine della giornata di oggi per filtrare
        const oggiInizio = new Date();
        oggiInizio.setHours(0, 0, 0, 0);
        
        const oggiFine = new Date();
        oggiFine.setHours(23, 59, 59, 999);

        // Peschiamo dalla tabella appuntamenti incrociando i dati del cane
        const { data: appuntamenti, error } = await supabase
            .from('appointments')
            .select(`
                id,
                data_inizio,
                stato,
                pets ( nome )
            `)
            .eq('provider_id', currentUser.id)
            .gte('data_inizio', oggiInizio.toISOString())
            .lte('data_inizio', oggiFine.toISOString())
            .order('data_inizio', { ascending: true });

        if (error) throw error;

        // Puliamo il contenitore
        agendaContainer.innerHTML = "";

        // Se non ci sono appuntamenti oggi (Il caso attuale del tuo DB!)
        if (!appuntamenti || appuntamenti.length === 0) {
            agendaContainer.innerHTML = `
                <div style="background: #fff; border-radius: 16px; padding: 30px 20px; text-align: center; border: 1px dashed #CBD5E1;">
                    <div style="font-size: 2rem; color: #94A3B8; margin-bottom: 10px;"><i class="fa-regular fa-calendar-xmark"></i></div>
                    <h4 style="margin: 0 0 5px 0; color: #1E293B;">Nessun appuntamento</h4>
                    <p style="margin: 0; font-size: 0.85rem; color: #64748B;">Non hai visite programmate per oggi.</p>
                </div>
            `;
            return;
        }

        // Se ci sono appuntamenti, creiamo le card dinamicamente
        appuntamenti.forEach(app => {
            const dataInizio = new Date(app.data_inizio);
            const orario = dataInizio.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
            
            const nomePet = app.pets ? app.pets.nome : "Animale sconosciuto";
            
            // Definiamo i colori in base allo stato
            let classeStato = "future"; // default
            if (app.stato === "completato") classeStato = "completed";
            else if (app.stato === "in_corso") classeStato = "next";

            const card = document.createElement('div');
            card.className = `agenda-card ${classeStato}`;
            card.innerHTML = `
                <div class="agenda-time">${orario} · ${app.stato.toUpperCase()}</div>
                <div class="agenda-title">${nomePet} · Visita</div>
                <div class="agenda-address">Studio Veterinario</div>
            `;
            agendaContainer.appendChild(card);
        });

    } catch (error) {
        console.error("Errore nel recupero dell'agenda:", error);
        agendaContainer.innerHTML = `<p style="color:red; text-align:center;">Errore nel caricamento dell'agenda.</p>`;
    }
}

// Avvio
initDashboard();