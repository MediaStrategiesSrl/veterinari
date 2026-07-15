// 1. IMPORT CENTRALIZZATI
// ==========================================
// Assicurati che i percorsi puntino alla cartella corretta (es. ../utils/)
import { supabase } from '../utils/supabaseClient.js';
import { logError } from '../utils/logger.js';

let currentUser = null;

// Elementi DOM
const availabilityToggle = document.getElementById("availabilityToggle");
const availabilityText = document.getElementById("availabilityText");
const waitTimeText = document.getElementById("waitTimeText");
const oggiDataText = document.getElementById("oggiData");
const agendaContainer = document.getElementById("agendaContainer");

async function initDashboard() {
    impostaDataOggi();

    try {
        // Estraiamo anche un eventuale errore dal controllo autenticazione
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        if (authError) {
            // --- AGGIUNTA LOG: Tracciamento errore auth ---
            await logError({
                source: 'frontend_dashboard_vet',
                action: 'auth_check',
                errorMessage: authError.message || "Errore lettura token sessione",
                errorCode: authError.code || 'AUTH_FETCH_ERROR',
                context: { userAgent: navigator.userAgent }
            });
        }

        if (!user) {
            window.location.href = "../../index.html";
            return;
        }
        currentUser = user;

        // Eseguiamo i caricamenti in parallelo
        await Promise.all([
            caricaStatoDisponibilita(),
            caricaAgendaDinamica()
        ]);
        
    } catch (err) {
        // --- AGGIUNTA LOG: Fallimento generico dell'inizializzazione ---
        await logError({
            source: 'frontend_dashboard_vet',
            action: 'init_dashboard_unexpected',
            errorMessage: err.message,
            errorCode: err.code || 'UNKNOWN_INIT_ERROR',
            stackTrace: err.stack
        });
    }
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
            throw Object.assign(new Error(error.message), { code: error.code || 'DB_VET_STATUS_ERROR' });
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
        
        // --- AGGIUNTA LOG: Errore lettura disponibilità ---
        await logError({
            source: 'frontend_dashboard_vet',
            action: 'fetch_availability',
            errorMessage: error.message,
            errorCode: error.code || 'FETCH_VET_DATA_ERROR',
            stackTrace: error.stack,
            context: { user_id: currentUser ? currentUser.id : null }
        });
        // --------------------------------------------------

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

        if (error) throw Object.assign(new Error(error.message), { code: error.code || 'DB_VET_UPDATE_ERROR' });
        
        aggiornaTestoUrgenze(isNowAvailable);

    } catch (error) {
        // --- AGGIUNTA LOG: Fallimento aggiornamento stato ---
        await logError({
            source: 'frontend_dashboard_vet',
            action: 'update_availability_toggle',
            errorMessage: error.message,
            errorCode: error.code || 'UPDATE_AVAILABILITY_ERROR',
            context: { 
                user_id: currentUser.id, 
                attempted_status: isNowAvailable 
            }
        });
        // ----------------------------------------------------

        // Rollback visivo dell'UI
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

        if (error) throw Object.assign(new Error(error.message), { code: error.code || 'DB_AGENDA_FETCH_ERROR' });

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
        
        // --- AGGIUNTA LOG: Errore caricamento appuntamenti ---
        await logError({
            source: 'frontend_dashboard_vet',
            action: 'fetch_dynamic_agenda',
            errorMessage: error.message,
            errorCode: error.code || 'FETCH_AGENDA_ERROR',
            stackTrace: error.stack,
            context: { 
                user_id: currentUser ? currentUser.id : null,
                target_date: new Date().toISOString()
            }
        });
        // -----------------------------------------------------

        agendaContainer.innerHTML = `<p style="color:red; text-align:center;">Errore nel caricamento dell'agenda.</p>`;
    }
}

// Avvio
initDashboard();