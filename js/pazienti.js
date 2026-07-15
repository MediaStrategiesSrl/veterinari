// ==========================================
// 1. IMPORT CENTRALIZZATI
// ==========================================
// Assicurati che i percorsi puntino correttamente alle tue cartelle utils
import { supabase } from '../utils/supabaseClient.js';
import { logError } from '../utils/logger.js';

let currentUser = null;
let allPatients = []; // Salveremo i dati qui per la ricerca locale

const patientsList = document.getElementById("patientsList");
const searchInput = document.getElementById("searchInput");
const activeCountText = document.getElementById("activeCount");
const revokedCountText = document.getElementById("revokedCount"); 

// ==========================================
// INIZIALIZZAZIONE PAGINA
// ==========================================
async function initPazienti() {
    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        // ERRORE DI SISTEMA: Errore nel recupero della sessione
        if (authError) throw Object.assign(new Error(authError.message), { code: authError.code || 'AUTH_SYS_ERROR' });

        // ERRORE LOGICO: Utente non loggato. Redirezione senza log.
        if (!user) {
            window.location.href = "../../index.html";
            return;
        }
        
        currentUser = user;
        await caricaPazienti();

    } catch (error) {
        console.error("Errore critico di autenticazione:", error);
        await logError({
            source: 'lista_pazienti',
            action: 'init_auth',
            errorMessage: error.message || "Errore imprevisto durante il controllo auth",
            errorCode: error.code || 'UNKNOWN_SYS_ERROR',
            context: {}
        });
    }
}

// ==========================================
// RECUPERO PAZIENTI DA SUPABASE
// ==========================================
async function caricaPazienti() {
    try {
        // 1. QUERY PAZIENTI ATTIVI (per la lista e il contatore "ATTIVI")
        const { data: attiviData, error: attiviError } = await supabase
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
            .eq('status', 'active') // FILTRO FONDAMENTALE!
            .order('created_at', { ascending: false });

        // Lanciamo l'errore al catch se fallisce
        if (attiviError) throw Object.assign(new Error(attiviError.message), { code: attiviError.code || 'DB_FETCH_ACTIVE_PATIENTS_ERROR' });

        // 2. QUERY CONTATORE REVOCATI (solo il numero, non ci servono i dati completi)
        const { count: countRevocati, error: revocatiError } = await supabase
            .from('veterinarian_patients')
            .select('*', { count: 'exact', head: true })
            .eq('veterinarian_id', currentUser.id)
            .eq('status', 'revoked'); // FILTRO FONDAMENTALE!

        // Lanciamo l'errore al catch se fallisce
        if (revocatiError) throw Object.assign(new Error(revocatiError.message), { code: revocatiError.code || 'DB_FETCH_REVOKED_COUNT_ERROR' });

        // Estraiamo in modo pulito l'array di pazienti (solo quelli attivi)
        allPatients = attiviData.map(item => {
            let finalAvatarUrl = "https://images.unsplash.com/photo-1543466835-00a7907e9de1?auto=format&fit=crop&w=150&q=80"; // Default
            
            // Se c'è un avatar salvato in Supabase, recupera il link pubblico
            if (item.pets && item.pets.avatar_url) {
                const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(item.pets.avatar_url);
                if (publicUrlData) {
                    finalAvatarUrl = publicUrlData.publicUrl;
                }
            }

            return {
                id: item.pets ? item.pets.id : null,
                nome: (item.pets && item.pets.nome) ? item.pets.nome : "Sconosciuto",
                razza: (item.pets && item.pets.razza) ? item.pets.razza : "Meticcio",
                microchip: (item.pets && item.pets.microchip) ? item.pets.microchip : "",
                avatarUrl: finalAvatarUrl 
            };
        });

        // 3. AGGIORNIAMO I DUE CONTATORI NELLA UI
        if (activeCountText) activeCountText.textContent = allPatients.length;
        if (revokedCountText) revokedCountText.textContent = countRevocati || 0;

        // Mostra a schermo solo la lista degli attivi
        renderPatients(allPatients);

    } catch (error) {
        console.error("Errore recupero pazienti:", error);
        patientsList.innerHTML = `<div style="text-align: center; color: #DC2626; padding: 20px; font-weight: bold;">Errore di sistema nel caricamento dell'archivio. Riprova più tardi.</div>`;
        
        // ERRORE DI SISTEMA: Registriamo e lanciamo l'allarme
        await logError({
            source: 'lista_pazienti',
            action: 'fetch_patients_data',
            errorMessage: error.message || "Impossibile recuperare i dati dei pazienti dal DB",
            errorCode: error.code || 'UNKNOWN_DB_ERROR',
            context: { vetId: currentUser?.id }
        });
    }
}

// ==========================================
// RENDERIZZAZIONE UI E RICERCA
// ==========================================
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
        if (!pet.id) return; // Salta record corrotti senza ID
        
        const card = document.createElement("a");
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
if (searchInput) {
    searchInput.addEventListener("input", (e) => {
        const searchTerm = e.target.value.toLowerCase().trim();
        
        // Filtriamo in base al nome OPPURE al microchip (solo tra gli attivi in memoria)
        const filtered = allPatients.filter(pet => {
            const matchNome = pet.nome.toLowerCase().includes(searchTerm);
            const matchMicrochip = pet.microchip.toLowerCase().includes(searchTerm);
            return matchNome || matchMicrochip;
        });
        
        renderPatients(filtered);
    });
}

// Avvia tutto
initPazienti();