// ==========================================
// 1. IMPORT CENTRALIZZATI
// ==========================================
// IMPORTANTE: Assicurati che i percorsi (../ o ./) puntino ai file corretti in base alle tue cartelle!
import { supabase } from '../utils/supabaseClient.js'; 
import { logError } from '../utils/logger.js';

// Elementi DOM
const vetName = document.getElementById("vetName");
const vetAvatar = document.getElementById("vetAvatar");
const vetDistance = document.getElementById("vetDistance");
const vetPrice = document.getElementById("vetPrice"); 
const vetRole = document.getElementById("vetRole"); 
const servicesList = document.getElementById("servicesList"); 

// Estrazione sicura dei dati profilo (PostgREST a volte restituisce array in JOIN complessi)
function getProfileData(profileObj, field) {
    if (!profileObj) return null;
    if (Array.isArray(profileObj)) return profileObj[0]?.[field] || null;
    return profileObj[field] || null;
}

async function initPage() {
    // 1. Legge l'ID dalla URL
    const urlParams = new URLSearchParams(window.location.search);
    const targetId = urlParams.get('id'); // Chiamiamolo targetId perché potrebbe essere Vet o Pro

    // ERRORE LOGICO: Manca l'ID. Non logghiamo nel DB, blocchiamo solo la UI.
    if (!targetId) {
        if (vetName) vetName.textContent = "Errore: ID professionista mancante";
        return;
    }

    const btnPrenota = document.getElementById("btnPrenota");
    if (btnPrenota) {
        btnPrenota.href = `prenota.html?user_id=${targetId}`;
    }

    try {
        let profileData = null;
        let isVet = true;

        // ==========================================
        // 2. RICERCA INTELLIGENTE: PRIMA I VETERINARI
        // ==========================================
        // Usiamo maybeSingle() così se non lo trova NON crasha
        const { data: vetData, error: vetError } = await supabase
            .from('veterinarians')
            .select(`
                user_id,
                numero_ordine,
                profiles (nome, cognome, avatar_url)
            `)
            .eq('user_id', targetId)
            .maybeSingle();

        if (vetError) throw Object.assign(new Error(vetError.message), { code: 'DB_VET_PROFILE_ERROR' });

        if (vetData) {
            profileData = vetData;
        } else {
            // ==========================================
            // 3. FALLBACK: CERCA TRA I PROFESSIONISTI
            // ==========================================
            isVet = false;
            const { data: proData, error: proError } = await supabase
                .from('professionals')
                .select(`
                    user_id,
                    tipo_professione,
                    tariffa_oraria,
                    profiles (nome, cognome, avatar_url)
                `)
                .eq('user_id', targetId)
                .maybeSingle();

            if (proError) throw Object.assign(new Error(proError.message), { code: 'DB_PRO_PROFILE_ERROR' });
            
            if (!proData) {
                // Se non c'è in nessuna delle due tabelle, lanciamo un errore gestito
                throw Object.assign(new Error("Profilo non trovato nel database"), { code: 'PROFILE_NOT_FOUND' });
            }
            
            profileData = proData;
        }

        // ==========================================
        // 4. POPOLA NOME E AVATAR
        // ==========================================
        const nome = getProfileData(profileData.profiles, 'nome') || "";
        const cognome = getProfileData(profileData.profiles, 'cognome') || "";
        const avatarUrl = getProfileData(profileData.profiles, 'avatar_url');

        const nomeCompleto = (nome || cognome) ? `${nome} ${cognome}`.trim() : "Professionista Sconosciuto";
        if (vetName) vetName.textContent = nomeCompleto;
        
        if (vetAvatar) {
            if (avatarUrl) {
                vetAvatar.src = avatarUrl;
            } else {
                vetAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(nomeCompleto)}&background=E2E8F0&color=64748B`;
            }
        }

        // ==========================================
        // 5. LOGICA RUOLO DINAMICA
        // ==========================================
        if (vetRole) {
            if (isVet) {
                vetRole.textContent = profileData.numero_ordine 
                    ? `Veterinario • Ordine n. ${profileData.numero_ordine}` 
                    : `Medico Veterinario`;
            } else {
                vetRole.textContent = profileData.tipo_professione || "Professionista Pet Care";
            }
        }

        // 6. Mostra la distanza pescata dal LocalStorage
        if (vetDistance) {
            const distSalvata = localStorage.getItem(`dist_${targetId}`);
            vetDistance.textContent = distSalvata ? `${distSalvata} km` : "Distanza n.d.";
        }

        // ==========================================
        // 7. SCARICA E MOSTRA I SERVIZI
        // ==========================================
        const { data: services, error: servicesError } = await supabase
            .from('provider_services')
            .select('id, nome_servizio, durata_minuti, prezzo') 
            .eq('provider_id', targetId)
            .order('prezzo', { ascending: true }); // Ordinati per prezzo crescente

        if (servicesError) throw Object.assign(new Error(servicesError.message), { code: 'DB_SERVICES_FETCH_ERROR' });

        if (services && services.length > 0) {
            if (servicesList) servicesList.innerHTML = ""; 
            
            const minPrice = services[0].prezzo; 

            services.forEach(servizio => {
                const serviceCard = document.createElement("a");
                serviceCard.href = `prenota.html?user_id=${targetId}&service_id=${servizio.id}`;
                
                // Manteniamo i tuoi stili CSS per le card
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
                
                // Adattiamo l'icona in base al fatto che sia Medico o meno
                const iconHTML = isVet 
                    ? `<div style="width: 45px; height: 45px; background: #FEF3C7; color: #F58220; border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; flex-shrink: 0; margin-right: 15px;"><i class="fa-solid fa-notes-medical"></i></div>`
                    : `<div style="width: 45px; height: 45px; background: #E0F2FE; color: #0284C7; border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; flex-shrink: 0; margin-right: 15px;"><i class="fa-solid fa-paw"></i></div>`;

                serviceCard.innerHTML = `
                    ${iconHTML}
                    <div style="flex-grow: 1;">
                        <h4 style="margin: 0 0 5px 0; color: #1E293B; font-size: 1rem;">${servizio.nome_servizio}</h4>
                        <p style="margin: 0; color: #64748B; font-size: 0.85rem;">${servizio.durata_minuti} minuti · €${servizio.prezzo}</p>
                    </div>
                    <i class="fa-solid fa-chevron-right" style="color: #CBD5E1; font-size: 0.9rem;"></i>
                `;
                
                if (servicesList) servicesList.appendChild(serviceCard);
            });

            // Aggiorniamo il box "Da --"
            if (vetPrice && minPrice !== undefined) {
                vetPrice.textContent = `€ ${minPrice}`;
            }
        } else {
            if (servicesList) {
                servicesList.innerHTML = `
                    <div style="text-align: center; padding: 2rem; color: #64748b; background: #fff; border-radius: 16px; border: 1px dashed #cbd5e1;">
                        Nessun servizio disponibile al momento.
                    </div>
                `;
            }
            if (vetPrice) vetPrice.textContent = "--";
        }

    } catch (error) {
        console.error("Eccezione di sistema rilevata:", error);
        
        // ==========================================
        // TRIGGER LOG ERROR
        // ==========================================
        if (error.code !== 'PROFILE_NOT_FOUND') {
            await logError({
                source: 'dettaglio_professionista',
                action: 'fetch_profile_and_services',
                errorMessage: error.message || "Impossibile comunicare col server",
                errorCode: error.code || 'UNKNOWN_SYS_ERROR',
                context: { requested_target_id: targetId }
            });
        }

        // Avviso per l'utente finale sulla UI
        if (vetName) vetName.textContent = error.code === 'PROFILE_NOT_FOUND' ? "Profilo non trovato" : "Servizio non disponibile";
        if (vetRole) vetRole.textContent = "Errore di caricamento";
        if (servicesList) {
            servicesList.innerHTML = `<div style="color: #DC2626; padding: 15px; text-align: center; background: #FEE2E2; border-radius: 12px;">Si è verificato un errore nel caricamento del profilo. Riprova più tardi.</div>`;
        }
    }
}

initPage();