import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Elementi DOM
const vetName = document.getElementById("vetName");
const vetAvatar = document.getElementById("vetAvatar");
const vetDistance = document.getElementById("vetDistance");
const vetPrice = document.getElementById("vetPrice"); 
const vetRole = document.getElementById("vetRole"); // Qui è dove apparirà "Ordine n. XXXX"
const servicesList = document.getElementById("servicesList"); 

async function initPage() {
    // 1. Legge l'ID dalla URL
    const urlParams = new URLSearchParams(window.location.search);
    const vetId = urlParams.get('id');

    if (!vetId) {
        vetName.textContent = "Errore: ID mancante";
        return;
    }

    const btnPrenota = document.getElementById("btnPrenota");
    if (btnPrenota && vetId) {
        btnPrenota.href = `prenota.html?user_id=${vetId}`;
    }

    try {
        // 2. Scarica i dati reali (AGGIUNTO 'numero_ordine' ALLA QUERY!)
        const { data: vetData, error: vetError } = await supabase
            .from('veterinarians')
            .select(`
                user_id,
                numero_ordine,
                profiles (nome, cognome, avatar_url)
            `)
            .eq('user_id', vetId)
            .single();

        if (vetError) throw vetError;

         // 3. Popola Nome e Avatar
        if (vetData.profiles) {
            const nome = vetData.profiles.nome || "";
            const cognome = vetData.profiles.cognome || "";

            const nomeCompleto = (nome || cognome) ? `${nome} ${cognome}`.trim() : "Dott. Sconosciuto";
            vetName.textContent = nomeCompleto;
            
            if (vetData.profiles.avatar_url) {
                vetAvatar.src = vetData.profiles.avatar_url;
            } else {
                vetAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(nomeCompleto)}&background=E2E8F0&color=64748B`;
            }
        }

        // ==========================================
        // NUOVO: LOGICA ORDINE (Nel vetRole)
        // ==========================================
        if (vetRole) {
            if (vetData.numero_ordine) {
                vetRole.textContent = `Veterinario • Ordine n. ${vetData.numero_ordine}`;
            } else {
                vetRole.textContent = `Veterinario`;
            }
        }

        // 4. Mostra la distanza pescata da cerca.js
        const distSalvata = localStorage.getItem(`dist_${vetId}`);
        if (distSalvata) {
            vetDistance.textContent = `${distSalvata} km`;
        } else {
            vetDistance.textContent = "n.d.";
        }

        // 5. SCARICA E MOSTRA I SERVIZI
        const { data: services, error: servicesError } = await supabase
            .from('provider_services')
            .select('id, nome_servizio, durata_minuti, prezzo') 
            .eq('provider_id', vetId)
            .order('prezzo', { ascending: true }); // Ordinati per prezzo crescente!

        if (servicesError) throw servicesError;

        if (services && services.length > 0) {
            servicesList.innerHTML = ""; 
            
            // Il prezzo minimo è ora sicuro di essere il primo elemento della lista
            const minPrice = services[0].prezzo; 

            services.forEach(servizio => {
                const serviceCard = document.createElement("a");
                serviceCard.href = `prenota.html?user_id=${vetId}&service_id=${servizio.id}`;
                
                serviceCard.style.cssText = `
                    display: flex; 
                    align-items: center; 
                    background: #fff; 
                    border-radius: 20px; 
                    padding: 15px; 
                    margin-bottom: 15px; 
                    border: 1px solid #E2E8F0; 
                    text-decoration: none; 
                    box-shadow: 0 2px 8px rgba(0,0,0,0.02);
                `;
                
                serviceCard.innerHTML = `
                    <div style="width: 45px; height: 45px; background: #FEF3C7; color: #F58220; border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; flex-shrink: 0; margin-right: 15px;">
                        <i class="fa-solid fa-notes-medical"></i>
                    </div>
                    <div style="flex-grow: 1;">
                        <h4 style="margin: 0 0 5px 0; color: #1E293B; font-size: 1rem;">${servizio.nome_servizio}</h4>
                        <p style="margin: 0; color: #64748B; font-size: 0.85rem;">${servizio.durata_minuti} minuti · €${servizio.prezzo}</p>
                    </div>
                    <i class="fa-solid fa-chevron-right" style="color: #CBD5E1; font-size: 0.9rem;"></i>
                `;
                
                servicesList.appendChild(serviceCard);
            });

            // Aggiorniamo il box "Da --"
            if (vetPrice && minPrice !== undefined) {
                vetPrice.textContent = `€ ${minPrice}`;
            }
        }
    } catch (error) {
        console.error("Errore recupero dettagli:", error);
        vetName.textContent = "Profilo non trovato";
    }
}

initPage();