import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;

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
        // Ci sono servizi: mostra la lista
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
        div.className = "service-item-card";
        div.innerHTML = `
            <div class="service-item-info">
                <h4>${srv.nome_servizio}</h4>
                <p><i class="fa-regular fa-clock"></i> ${srv.durata_minuti} min</p>
            </div>
            <div style="display: flex; align-items: center;">
                <div class="service-item-price">€${srv.prezzo}</div>
                <button class="delete-srv-btn" data-id="${srv.id}" title="Elimina servizio">
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
                await deleteService(idToDel);
            }
        });
    });
}

// 3. AGGIUNGI UN NUOVO SERVIZIO AL DB
form.addEventListener("submit", async (e) => {
    e.preventDefault();
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvataggio...';
    
    const nome = document.getElementById("srvName").value.trim();
    const durata = document.getElementById("srvDuration").value;
    const prezzo = document.getElementById("srvPrice").value;

    const { error } = await supabase
        .from('provider_services')
        .insert({
            provider_id: currentUser.id,
            nome_servizio: nome,
            durata_minuti: parseInt(durata),
            prezzo: parseFloat(prezzo)
        });

    if (error) {
        statusMsg.textContent = "Errore: " + error.message;
        statusMsg.hidden = false;
        saveBtn.disabled = false;
        saveBtn.textContent = "Salva servizio";
    } else {
        form.reset();
        closeModal();
        saveBtn.disabled = false;
        saveBtn.textContent = "Salva servizio";
        await loadServices(); // Ricarica la lista!
    }
});

// 4. ELIMINA SERVIZIO
async function deleteService(id) {
    const { error } = await supabase
        .from('provider_services')
        .delete()
        .eq('id', id);

    if (!error) {
        await loadServices(); // Ricarica la lista per farlo sparire
    } else {
        alert("Errore durante l'eliminazione.");
    }
}

// --- GESTIONE MODAL (APRI/CHIUDI) ---
openModalBtns.forEach(btn => {
    btn.addEventListener("click", () => modal.style.display = "flex");
});
closeModalBtn.addEventListener("click", closeModal);

function closeModal() {
    modal.style.display = "none";
    statusMsg.hidden = true;
}

// Chiudi cliccando fuori dalla finestrella
modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
});

init();