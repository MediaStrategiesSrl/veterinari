import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let currentUser = null;

// ==========================================
// IL FILTRO FONDAMENTALE PER SEPARARE LE CARRIERE
// ==========================================
const RUOLO_ATTUALE = 'professionista'; 

// Cattura gli elementi dal tuo HTML
const emptyState = document.getElementById("emptyState");
const servicesContainer = document.getElementById("servicesContainer");
const servicesList = document.getElementById("servicesList");

const modal = document.getElementById("addServiceModal");
const closeModalBtn = document.getElementById("closeModalBtn");
const openModalBtns = document.querySelectorAll(".open-modal-btn");

const form = document.getElementById("addServiceForm");
const saveBtn = document.getElementById("saveServiceBtn");
const statusMsg = document.getElementById("statusMessage");

// Inizializza la pagina
async function init() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        window.location.href = "../../index.html";
        return;
    }
    currentUser = user;
    await loadServices();
}

// 1. CARICA I SERVIZI DAL DB
async function loadServices() {
    const { data: services, error } = await supabase
        .from('provider_services')
        .select('*')
        .eq('provider_id', currentUser.id)
        .eq('ruolo_provider', RUOLO_ATTUALE) // <-- Sicurezza: Mostra SOLO quelli del professionista
        .order('nome_servizio', { ascending: true });

    if (error) {
        console.error("Errore caricamento servizi:", error);
        return;
    }

    if (!services || services.length === 0) {
        // Nessun servizio: mostra il blocco grande
        emptyState.style.display = "block";
        servicesContainer.style.display = "none";
    } else {
        // Ci sono servizi: mostra la lista e nasconde l'empty state
        emptyState.style.display = "none";
        servicesContainer.style.display = "block";
        renderServices(services);
    }
}

// 2. DISEGNA LE CARD NELL'HTML
function renderServices(services) {
    servicesList.innerHTML = "";
    
    services.forEach(srv => {
        const div = document.createElement("div");
        // Uso stili inline protetti per assicurarmi che il layout non si rompa
        div.style.background = "#fff";
        div.style.borderRadius = "16px";
        div.style.padding = "16px";
        div.style.marginBottom = "12px";
        div.style.border = "1px solid #E2E8F0";
        div.style.display = "flex";
        div.style.justifyContent = "space-between";
        div.style.alignItems = "center";
        
        div.innerHTML = `
            <div style="flex-grow: 1;">
                <h4 style="margin: 0 0 5px 0; color: #1E293B; font-size: 1rem;">${srv.nome_servizio}</h4>
                <p style="margin: 0; color: #64748B; font-size: 0.85rem;"><i class="fa-regular fa-clock"></i> ${srv.durata_minuti} min</p>
            </div>
            <div style="display: flex; align-items: center; gap: 15px;">
                <div style="font-weight: 700; color: #F58220; font-size: 1.1rem;">€${parseFloat(srv.prezzo).toFixed(2)}</div>
                <button class="delete-srv-btn" data-id="${srv.id}" style="background: #FEE2E2; border: none; color: #EF4444; width: 35px; height: 35px; border-radius: 10px; cursor: pointer;">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>
        `;
        servicesList.appendChild(div);
    });

    // Aggiunge evento ai tasti cestino
    document.querySelectorAll(".delete-srv-btn").forEach(btn => {
        btn.addEventListener("click", async (e) => {
            const idToDel = e.currentTarget.getAttribute("data-id");
            if(confirm("Vuoi davvero eliminare questa prestazione dal listino?")) {
                await deleteService(idToDel);
            }
        });
    });
}

// 3. AGGIUNGI UN NUOVO SERVIZIO AL DB
form.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    // Disabilita tasto per evitare multi-click
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvataggio...';
    statusMsg.hidden = true;
    
    const nome = document.getElementById("srvName").value.trim();
    const durata = document.getElementById("srvDuration").value;
    const prezzo = document.getElementById("srvPrice").value;

    const { error } = await supabase
        .from('provider_services')
        .insert({
            provider_id: currentUser.id,
            nome_servizio: nome,
            durata_minuti: parseInt(durata),
            prezzo: parseFloat(prezzo),
            ruolo_provider: RUOLO_ATTUALE // <-- Identifica chi sta inserendo questo servizio!
        });

    if (error) {
        statusMsg.textContent = "Errore: " + error.message;
        statusMsg.hidden = false;
        saveBtn.disabled = false;
        saveBtn.textContent = "Salva servizio";
    } else {
        // Successo: Svuota form, chiudi modale e ricarica
        form.reset();
        closeModal();
        saveBtn.disabled = false;
        saveBtn.textContent = "Salva servizio";
        await loadServices(); 
    }
});

// 4. ELIMINA SERVIZIO
async function deleteService(id) {
    const { error } = await supabase
        .from('provider_services')
        .delete()
        .eq('id', id)
        .eq('provider_id', currentUser.id); // Sicurezza extra

    if (!error) {
        await loadServices(); // Ricarica la lista
    } else {
        alert("Errore durante l'eliminazione del servizio.");
    }
}

// ==========================================
// GESTIONE DELLA FINESTRA MODALE
// ==========================================
openModalBtns.forEach(btn => {
    btn.addEventListener("click", () => {
        modal.style.display = "flex";
    });
});

closeModalBtn.addEventListener("click", closeModal);

function closeModal() {
    modal.style.display = "none";
    statusMsg.hidden = true;
    form.reset(); // Pulisce il form se l'utente ci ripensa e chiude
}

// Chiude cliccando sullo sfondo oscurato
modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
});

// Avvia tutto!
init();