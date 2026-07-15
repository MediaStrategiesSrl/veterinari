// 1. IMPORT CENTRALIZZATI
// ==========================================
// Assicurati che i percorsi puntino alla cartella corretta (es. ../utils/)
import { supabase } from '../utils/supabaseClient.js';
import { logError } from '../utils/logger.js';

let currentUser = null;
let tuttiICienti = []; // Salviamo la lista globale per far funzionare la barra di ricerca

const clientsListContainer = document.getElementById("clientsListContainer");
const searchInput = document.getElementById("searchInput");

async function initPage() {
    // --- AGGIUNTA: Blocco try/catch per gestire errori di autenticazione inattesi ---
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            window.location.href = "../../index.html";
            return;
        }
        currentUser = user;
        await caricaClienti();
    } catch (err) {
        console.error("Errore autenticazione:", err);
        await logError({
            source: 'frontend_clienti',
            action: 'init_auth_check',
            errorMessage: err.message || "Errore imprevisto durante il controllo dell'utente",
            errorCode: err.code || 'AUTH_FETCH_ERROR',
            stackTrace: err.stack,
            context: { userAgent: navigator.userAgent }
        });
    }
}

async function caricaClienti() {
    try {
        // STEP 1: Trova i pet_id associati a te
        const { data: accessi, error: accessiError } = await supabase
            .from('veterinarian_patients')
            .select('pet_id')
            .eq('veterinarian_id', currentUser.id)
            .eq('status', 'active');

        // Passiamo un codice di errore specifico all'oggetto Error
        if (accessiError) throw Object.assign(new Error(accessiError.message), { code: accessiError.code || 'DB_VET_PATIENTS_ERROR' });

        if (!accessi || accessi.length === 0) {
            clientsListContainer.innerHTML = `
                <div style="text-align: center; padding: 40px 20px; background: #fff; border-radius: 20px;">
                    <i class="fa-solid fa-dog" style="font-size: 2.5rem; color: #CBD5E1; margin-bottom: 10px;"></i>
                    <p style="color: #64748B;">Non hai ancora clienti attivi.</p>
                </div>
            `;
            return;
        }

        const petIds = accessi.map(a => a.pet_id);

        // STEP 2: Scarica i dati degli animali
        const { data: petsData, error: petsError } = await supabase
            .from('pets')
            .select('id, nome, razza, avatar_url, microchip')
            .in('id', petIds)
            .order('nome', { ascending: true });

        if (petsError) throw Object.assign(new Error(petsError.message), { code: petsError.code || 'DB_PETS_FETCH_ERROR' });

        tuttiICienti = petsData || [];
        renderizzaClienti(tuttiICienti);

    } catch (error) {
        console.error("Errore caricamento clienti:", error);
        
        // --- AGGIUNTA: Salvataggio nel database dell'errore ---
        await logError({
            source: 'frontend_clienti',
            action: 'fetch_patients_list',
            errorMessage: error.message || "Fallimento durante il recupero dei pazienti",
            errorCode: error.code || 'FETCH_CLIENTS_ERROR',
            stackTrace: error.stack,
            context: {
                user_id: currentUser ? currentUser.id : 'sconosciuto'
            }
        });

        clientsListContainer.innerHTML = `<p style="color:red; text-align:center;">Errore nel caricamento dei dati.</p>`;
    }
}

function renderizzaClienti(lista) {
    clientsListContainer.innerHTML = "";

    if (lista.length === 0) {
        clientsListContainer.innerHTML = `<p style="text-align: center; color: #64748B; margin-top: 20px;">Nessun risultato trovato.</p>`;
        return;
    }

    lista.forEach(pet => {
        // 1. Gestione Avatar usando la cartella 'pets_avatar'
        let avatarHTML = `<div class="client-avatar"><i class="fa-solid fa-paw"></i></div>`; // Fallback (Zampa di default)
        
        if (pet.avatar_url) {
            // Ottieni l'URL pubblico dal bucket
            const { data } = supabase.storage.from('storage_veterinari').getPublicUrl(pet.avatar_url);
            avatarHTML = `<img src="${data.publicUrl}" alt="${pet.nome}" class="client-avatar">`;
        }

        // 2. Gestisci campi vuoti (es. razza mancante)
        const razza = pet.razza ? pet.razza : 'Animale registrato';
        
        // 3. Creazione della card
        const card = document.createElement("a");
        card.href = `dettaglio-cliente.html?id=${pet.id}`; // Link alla pagina singola (da creare in futuro)
        card.className = "client-card";
        
        card.innerHTML = `
            ${avatarHTML}
            <div class="client-info">
                <h4 class="client-name">${pet.nome}</h4>
                <p class="client-details">${razza}</p>
            </div>
            <i class="fa-solid fa-chevron-right client-arrow"></i>
        `;

        clientsListContainer.appendChild(card);
    });
}

// ==========================================
// RICERCA IN TEMPO REALE (SearchBar)
// ==========================================
searchInput.addEventListener("input", (e) => {
    const termineRicerca = e.target.value.toLowerCase().trim();
    
    // Filtra la lista per Nome o per Microchip
    const clientiFiltrati = tuttiICienti.filter(pet => {
        const nomeMatch = pet.nome.toLowerCase().includes(termineRicerca);
        const microchipMatch = pet.microchip && pet.microchip.toLowerCase().includes(termineRicerca);
        return nomeMatch || microchipMatch;
    });

    renderizzaClienti(clientiFiltrati);
});

initPage();