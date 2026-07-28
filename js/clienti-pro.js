// ==========================================
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
    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        if (authError) throw authError;

        if (!user) {
            window.location.href = "../../index.html";
            return;
        }
        
        currentUser = user;
        await caricaClienti();
        
    } catch (err) {
        console.error("Errore autenticazione:", err);
        await logError({
            source: 'frontend_clienti_pro',
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
        // STEP 1: Trova tutti gli appuntamenti (prenotazioni) ricevuti da questo professionista
        const { data: appuntamenti, error: appuntamentiError } = await supabase
            .from('appointments')
            .select('pet_id')
            .eq('provider_id', currentUser.id);

        if (appuntamentiError) throw Object.assign(new Error(appuntamentiError.message), { code: appuntamentiError.code || 'DB_APPOINTMENTS_ERROR' });

        if (!appuntamenti || appuntamenti.length === 0) {
            clientsListContainer.innerHTML = `
                <div style="text-align: center; padding: 40px 20px; background: #fff; border-radius: 20px; border: 1px dashed #CBD5E1;">
                    <i class="fa-solid fa-dog" style="font-size: 2.5rem; color: #CBD5E1; margin-bottom: 10px;"></i>
                    <p style="color: #64748B; margin: 0;">Non hai ancora clienti attivi.</p>
                    <p style="color: #94A3B8; font-size: 0.85rem; margin-top: 5px;">I clienti appariranno qui appena riceverai una prenotazione.</p>
                </div>
            `;
            return;
        }

        // Estrae solo gli ID degli animali e rimuove i doppioni (Set) 
        // nel caso un animale abbia prenotato più volte
        const petIdsUnivoci = [...new Set(appuntamenti.map(a => a.pet_id))].filter(id => id != null);

        if (petIdsUnivoci.length === 0) return;

        // STEP 2: Scarica i dati dei profili animali usando gli ID appena trovati
        const { data: petsData, error: petsError } = await supabase
            .from('pets')
            .select('id, nome, razza, avatar_url, microchip')
            .in('id', petIdsUnivoci)
            .order('nome', { ascending: true });

        if (petsError) throw Object.assign(new Error(petsError.message), { code: petsError.code || 'DB_PETS_FETCH_ERROR' });

        tuttiICienti = petsData || [];
        renderizzaClienti(tuttiICienti);

    } catch (error) {
        console.error("Errore caricamento clienti:", error);
        
        await logError({
            source: 'frontend_clienti_pro',
            action: 'fetch_clients_list',
            errorMessage: error.message || "Fallimento durante il recupero dei clienti",
            errorCode: error.code || 'FETCH_CLIENTS_ERROR',
            stackTrace: error.stack,
            context: { user_id: currentUser ? currentUser.id : 'sconosciuto' }
        });

        clientsListContainer.innerHTML = `
            <div style="text-align: center; padding: 20px; color: #DC2626; background: #FEE2E2; border-radius: 12px;">
                Si è verificato un errore nel caricamento dei dati. Riprova più tardi.
            </div>
        `;
    }
}

function renderizzaClienti(lista) {
    clientsListContainer.innerHTML = "";

    if (lista.length === 0) {
        clientsListContainer.innerHTML = `<p style="text-align: center; color: #64748B; margin-top: 20px;">Nessun risultato trovato per la ricerca.</p>`;
        return;
    }

    lista.forEach(pet => {
        // Gestione Avatar sicura
        let finalAvatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(pet.nome)}&background=F58220&color=fff&rounded=true`;
        
        if (pet.avatar_url) {
            if (pet.avatar_url.startsWith('http') || pet.avatar_url.startsWith('data:')) {
                finalAvatarUrl = pet.avatar_url;
            } else {
                const cleanPath = pet.avatar_url.replace(/^\/+/, '');
                const { data } = supabase.storage.from('storage_veterinari').getPublicUrl(cleanPath);
                if (data && data.publicUrl) finalAvatarUrl = data.publicUrl;
            }
        }

        const razza = pet.razza ? pet.razza : 'Animale registrato';
        
        const card = document.createElement("a");
        card.href = `dettaglio-cliente.html?id=${pet.id}`; 
        
        // CSS inline applicato per rispecchiare lo stile delle tue card
        card.style.cssText = `
            display: flex; 
            align-items: center; 
            background: #fff; 
            padding: 15px; 
            border-radius: 16px; 
            margin-bottom: 12px; 
            text-decoration: none; 
            border: 1px solid #E2E8F0;
            box-shadow: 0 2px 4px rgba(0,0,0,0.02);
        `;
        
        card.innerHTML = `
            <img src="${finalAvatarUrl}" alt="${pet.nome}" onerror="this.onerror=null;this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(pet.nome)}&background=F58220&color=fff&rounded=true';" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover; margin-right: 15px;">
            <div style="flex-grow: 1;">
                <h4 style="margin: 0 0 4px 0; color: #1E293B; font-size: 1.05rem;">${pet.nome}</h4>
                <p style="margin: 0; color: #64748B; font-size: 0.85rem;">${razza}</p>
            </div>
            <i class="fa-solid fa-chevron-right" style="color: #CBD5E1; font-size: 0.9rem;"></i>
        `;

        clientsListContainer.appendChild(card);
    });
}

// ==========================================
// RICERCA IN TEMPO REALE (SearchBar)
// ==========================================
if (searchInput) {
    searchInput.addEventListener("input", (e) => {
        const termineRicerca = e.target.value.toLowerCase().trim();
        
        const clientiFiltrati = tuttiICienti.filter(pet => {
            const nomeMatch = pet.nome.toLowerCase().includes(termineRicerca);
            const microchipMatch = pet.microchip && pet.microchip.toLowerCase().includes(termineRicerca);
            return nomeMatch || microchipMatch;
        });

        renderizzaClienti(clientiFiltrati);
    });
}

initPage();