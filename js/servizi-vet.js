// ==========================================
// 1. IMPORT CENTRALIZZATI
// ==========================================
// Assicurati che i percorsi (es. ../utils/) puntino alla tua struttura reale
import { supabase } from '../utils/supabaseClient.js';
import { logError } from '../utils/logger.js';

let currentUser = null;

// ==========================================
// IL FILTRO FONDAMENTALE PER SEPARARE LE CARRIERE
// ==========================================
const RUOLO_ATTUALE = 'veterinario'; 

// Elementi DOM
const emptyState = document.getElementById("emptyState");
const servicesContainer = document.getElementById("servicesContainer");
const servicesList = document.getElementById("servicesList");

const modal = document.getElementById("addServiceModal");
const closeModalBtn = document.getElementById("closeModalBtn");
const openModalBtns = document.querySelectorAll(".open-modal-btn");

const form = document.getElementById("addServiceForm");
const saveBtn = document.getElementById("saveServiceBtn");
const statusMsg = document.getElementById("statusMessage");

// ==========================================
// 2. INIZIALIZZAZIONE E AUTH
// ==========================================
async function init() {
    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) throw Object.assign(new Error(authError.message), { code: authError.code || 'AUTH_SYS_ERROR' });
        
        if (!user) {
            window.location.href = "../../index.html";
            return;
        }
        currentUser = user;
        await loadServices();
    } catch (error) {
        console.error("Errore inizializzazione:", error);
        await logError({
            source: 'gestione_servizi_vet',
            action: 'init_page',
            errorMessage: error.message || "Errore durante l'autenticazione iniziale",
            errorCode: error.code || 'UNKNOWN_SYS_ERROR',
            context: {}
        });
    }
}

// ==========================================
// 3. CARICA I SERVIZI DAL DB
// ==========================================
async function loadServices() {
    try {
        const { data: services, error } = await supabase
            .from('provider_services')
            .select('*')
            .eq('provider_id', currentUser.id)
            .eq('ruolo_provider', RUOLO_ATTUALE) // Sicurezza: Mostra SOLO quelli del veterinario
            .order('nome_servizio', { ascending: true });

        if (error) throw Object.assign(new Error(error.message), { code: error.code || 'DB_FETCH_SERVICES_ERROR' });

        if (!services || services.length === 0) {
            // Nessun servizio: mostra il blocco grande
            emptyState.style.display = "block";
            servicesContainer.style.display = "none";
        } else {
            // Ci sono servizi: mostra la lista
            emptyState.style.display = "none";
            servicesContainer.style.display = "block";
            renderServices(services);
        }
    } catch (error) {
        console.error("Errore caricamento servizi:", error);
        await logError({
            source: 'gestione_servizi_vet',
            action: 'load_services',
            errorMessage: error.message || "Impossibile recuperare il listino servizi",
            errorCode: error.code || 'UNKNOWN_DB_ERROR',
            context: { userId: currentUser?.id }
        });
        
        // Fallback UI
        emptyState.style.display = "block";
        emptyState.innerHTML = `
            <div style="text-align: center; padding: 20px;">
                <p style="color: #DC2626; font-weight: bold;">Errore di sistema.</p>
                <p style="color: #64748B;">Impossibile caricare i servizi al momento. I tecnici sono stati avvisati.</p>
            </div>
        `;
        servicesContainer.style.display = "none";
    }
}

// ==========================================
// 4. DISEGNA LE CARD NELL'HTML
// ==========================================
function renderServices(services) {
    servicesList.innerHTML = "";
    
    services.forEach(srv => {
        const div = document.createElement("div");
        div.className = "service-item-card"; // Usa la classe CSS definita dal tuo design
        div.innerHTML = `
            <div class="service-item-info">
                <h4 style="margin: 0 0 5px 0; color: #1E293B; font-size: 1rem;">${srv.nome_servizio}</h4>
                <p style="margin: 0; color: #64748B; font-size: 0.85rem;"><i class="fa-regular fa-clock"></i> ${srv.durata_minuti} min</p>
            </div>
            <div style="display: flex; align-items: center; gap: 15px;">
                <div class="service-item-price" style="font-weight: 700; color: #41AECF; font-size: 1.1rem;">€${parseFloat(srv.prezzo).toFixed(2)}</div>
                <button class="delete-srv-btn" data-id="${srv.id}" style="background: #FEE2E2; border: none; color: #EF4444; width: 35px; height: 35px; border-radius: 10px; cursor: pointer; transition: 0.2s;" title="Elimina servizio">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>
        `;
        servicesList.appendChild(div);
    });

    // Aggiungi eventi ai tasti cestino
    document.querySelectorAll(".delete-srv-btn").forEach(btn => {
        btn.addEventListener("click", async (e) => {
            const idToDel = e.currentTarget.getAttribute("data-id");
            if(confirm("Vuoi davvero eliminare questo servizio?")) {
                // Feedback visivo immediato sul bottone premuto
                const originalHTML = e.currentTarget.innerHTML;
                e.currentTarget.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
                e.currentTarget.disabled = true;
                
                await deleteService(idToDel, e.currentTarget, originalHTML);
            }
        });
    });
}

// ==========================================
// 5. AGGIUNGI UN NUOVO SERVIZIO AL DB
// ==========================================
form.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const nome = document.getElementById("srvName").value.trim();
    const durata = document.getElementById("srvDuration").value;
    const prezzo = document.getElementById("srvPrice").value;

    // Controllo logico base
    if (!nome || !durata || !prezzo) {
        statusMsg.textContent = "Compila tutti i campi richiesti.";
        statusMsg.hidden = false;
        return;
    }

    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvataggio...';
    statusMsg.hidden = true;
    
    try {
        const { error } = await supabase
            .from('provider_services')
            .insert({
                provider_id: currentUser.id,
                nome_servizio: nome,
                durata_minuti: parseInt(durata),
                prezzo: parseFloat(prezzo),
                ruolo_provider: RUOLO_ATTUALE // Identifica chi sta inserendo questo servizio!
            });

        if (error) throw Object.assign(new Error(error.message), { code: error.code || 'DB_INSERT_SERVICE_ERROR' });

        form.reset();
        closeModal();
        await loadServices(); // Ricarica la lista aggiornata
    } catch (error) {
        console.error("Errore inserimento servizio:", error);
        await logError({
            source: 'gestione_servizi_vet',
            action: 'insert_service',
            errorMessage: error.message || "Fallimento durante l'inserimento del nuovo servizio",
            errorCode: error.code || 'UNKNOWN_DB_ERROR',
            context: { userId: currentUser.id, nome_servizio: nome }
        });
        statusMsg.textContent = "Errore di sistema durante il salvataggio.";
        statusMsg.hidden = false;
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = "Salva servizio";
    }
});

// ==========================================
// 6. ELIMINA SERVIZIO
// ==========================================
async function deleteService(id, btnElement, originalHTML) {
    try {
        const { error } = await supabase
            .from('provider_services')
            .delete()
            .eq('id', id)
            .eq('provider_id', currentUser.id); // Sicurezza extra

        if (error) throw Object.assign(new Error(error.message), { code: error.code || 'DB_DELETE_SERVICE_ERROR' });

        await loadServices(); // Ricarica la lista per farlo sparire
    } catch (error) {
        console.error("Errore eliminazione servizio:", error);
        await logError({
            source: 'gestione_servizi_vet',
            action: 'delete_service',
            errorMessage: error.message || "Fallimento durante la rimozione del servizio dal listino",
            errorCode: error.code || 'UNKNOWN_DB_ERROR',
            context: { serviceId: id, userId: currentUser.id }
        });
        alert("Errore di sistema durante l'eliminazione. Riprova più tardi.");
        
        // Ripristina il bottone in caso di fallimento query
        if (btnElement) {
            btnElement.innerHTML = originalHTML;
            btnElement.disabled = false;
        }
    }
}

// ==========================================
// 7. GESTIONE DELLA FINESTRA MODALE
// ==========================================
openModalBtns.forEach(btn => {
    btn.addEventListener("click", () => modal.style.display = "flex");
});
closeModalBtn.addEventListener("click", closeModal);

function closeModal() {
    modal.style.display = "none";
    statusMsg.hidden = true;
    form.reset(); // Pulisce il form
}

// Chiudi cliccando fuori dalla finestrella
modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
});

// Avvia tutto
init();