import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let allPatients = []; // Salveremo i dati qui per la ricerca locale

const patientsList = document.getElementById("patientsList");
const searchInput = document.getElementById("searchInput");
const activeCountText = document.getElementById("activeCount");

async function initPazienti() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        window.location.href = "../../index.html";
        return;
    }
    currentUser = user;

    await caricaPazienti();
}

async function caricaPazienti() {
    try {
        // Peschiamo dalla tabella ponte per prendere i dati degli animali associati
        const { data, error } = await supabase
            .from('veterinarian_patients')
            .select(`
                created_at,
                pets (
                    id,
                    nome,
                    razza,
                    microchip,
                    avatar_url
                )
            `)
            .eq('veterinarian_id', currentUser.id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Estraiamo in modo pulito l'array di pazienti
        allPatients = data.map(item => {
            let finalAvatarUrl = "https://images.unsplash.com/photo-1543466835-00a7907e9de1?auto=format&fit=crop&w=150&q=80"; // Default
            
            // Se c'è un avatar salvato in Supabase, recupera il link pubblico
            if (item.pets.avatar_url) {
                const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(item.pets.avatar_url);
                if (publicUrlData) {
                    finalAvatarUrl = publicUrlData.publicUrl;
                }
            }

            return {
                id: item.pets.id,
                nome: item.pets.nome || "Sconosciuto",
                razza: item.pets.razza || "Meticcio",
                microchip: item.pets.microchip || "", // Aggiunto microchip
                avatarUrl: finalAvatarUrl 
            };
        });

        // Aggiorna contatore statistico
        activeCountText.textContent = allPatients.length;

        // Mostra a schermo
        renderPatients(allPatients);

    } catch (error) {
        console.error("Errore recupero pazienti:", error);
        patientsList.innerHTML = `<div style="text-align: center; color: red; padding: 20px;">Errore nel caricamento.</div>`;
    }
}

// Funzione per disegnare le card HTML
function renderPatients(patientsToRender) {
    patientsList.innerHTML = "";

    if (patientsToRender.length === 0) {
        patientsList.innerHTML = `
            <div style="background: #fff; border-radius: 16px; padding: 30px; text-align: center; border: 1px dashed #CBD5E1;">
                <p style="color: #64748B; margin: 0;">Nessun paziente trovato.</p>
                <a href="scansiona.html" style="color: #F58220; display: inline-block; margin-top: 10px; font-weight: bold; text-decoration: none;">Inquadra QR per aggiungere</a>
            </div>
        `;
        return;
    }

    patientsToRender.forEach(pet => {
        const card = document.createElement("a");
        // ECCO LA MODIFICA CHIAVE: Passiamo l'ID nell'URL
        card.href = `scheda-paziente.html?petId=${pet.id}`; 
        card.className = "patient-card";
        
        card.innerHTML = `
            <div class="patient-info-wrapper">
                <img src="${pet.avatarUrl}" alt="${pet.nome}" class="patient-avatar">
                <div class="patient-details">
                    <h4>${pet.nome}</h4>
                    <p>${pet.razza} · Accesso attivo</p>
                </div>
            </div>
            <i class="fa-solid fa-chevron-right patient-arrow"></i>
        `;
        
        patientsList.appendChild(card);
    });
}

// Filtro di ricerca "Live"
searchInput.addEventListener("input", (e) => {
    const searchTerm = e.target.value.toLowerCase().trim();
    
    // Filtriamo in base al nome OPPURE al microchip
    const filtered = allPatients.filter(pet => {
        const matchNome = pet.nome.toLowerCase().includes(searchTerm);
        const matchMicrochip = pet.microchip.toLowerCase().includes(searchTerm);
        return matchNome || matchMicrochip;
    });
    
    renderPatients(filtered);
});

// Avvia tutto
initPazienti();