import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Elementi DOM
const pageHeaderTitle = document.getElementById("pageHeaderTitle");
const petProfileName = document.getElementById("petProfileName");
const petProfileId = document.getElementById("petProfileId");
const petProfileAvatar = document.getElementById("petProfileAvatar");
const petSpeciesBreed = document.getElementById("petSpeciesBreed");
const petMicrochip = document.getElementById("petMicrochip"); // Nuovo

const authorizedVetsContainer = document.getElementById("authorizedVetsContainer");
const recentActivitiesContainer = document.getElementById("recentActivitiesContainer");
const linkModifica = document.getElementById("linkModifica");

async function loadPetProfile() {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            window.location.href = "../../index.html";
            return;
        }

        // 1. Prendi il petId dall'URL
        const urlParams = new URLSearchParams(window.location.search);
        let petId = urlParams.get('petId');

        // Query per prendere i dati dell'animale
        let query = supabase.from('pets').select('*');
        
        if (petId) {
            query = query.eq('id', petId);
        } else {
            // Se non c'è ID, prendi l'ultimo inserito dall'utente (Fallback)
            query = query.eq('owner_id', user.id).order('id', { ascending: false }).limit(1);
        }

        const { data: pet, error } = await query.maybeSingle();

        if (error) throw error;
        if (!pet) throw new Error("Animale non trovato");

        //tasto modifica aninale
        if (linkModifica) {
            // Se sei dentro pages/proprietario/, non servono i puntini!
            linkModifica.href = `modifica-animale.html?petId=${pet.id}`;
        }

        // 2. Popola i Dati Base (Avatar, Nome, Specie, Razza, ID, Microchip)
        pageHeaderTitle.textContent = `Profilo di ${pet.nome}`;
        petProfileName.textContent = pet.nome;
        
        // Creiamo un finto ID alfanumerico partendo dall'UUID reale di Supabase
        const shortId = pet.id.split('-')[0].toUpperCase();
        petProfileId.textContent = `VT-${shortId}`;

        // Specie e razza
        const razzaText = pet.razza ? ` · ${pet.razza}` : '';
        petSpeciesBreed.textContent = `${pet.specie}${razzaText}`;

        // Compila il Microchip se esiste!
        petMicrochip.textContent = pet.microchip ? pet.microchip : "Non inserito";

        // Avatar
        if (pet.avatar_url) {
            // Assicurati che il bucket si chiami davvero 'avatars', se usi 'storage_veterinari' modificalo!
            const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(pet.avatar_url);
            petProfileAvatar.src = publicUrlData.publicUrl;
        } else {
             petProfileAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(pet.nome)}&background=F58220&color=fff`;
        }

        // ==========================================
        // 3. POPOLA ACCESSI VETERINARI (Doppio JOIN)
        // ==========================================
        const { data: vets, error: vetError } = await supabase
            .from('veterinarian_patients')
            .select(`
                id,
                veterinarian_id,
                veterinarians (
                    profiles (
                        nome, 
                        avatar_url
                    )
                )
            `)
            .eq('pet_id', pet.id)
            .eq('status', 'active');
        if (vetError) throw vetError;

        if (!vets || vets.length === 0) {
            authorizedVetsContainer.innerHTML = `
                <div class="info-card" style="justify-content: center;">
                    <div class="empty-state-text">Nessun veterinario ha ancora l'accesso.</div>
                </div>
            `;
        } else {
            authorizedVetsContainer.innerHTML = ''; 
            
            vets.forEach(relazione => {
                // Navighiamo nel "doppio salto" per pescare nome e foto
                const profiloVet = relazione.veterinarians?.profiles;
                const vetName = profiloVet?.nome || 'Veterinario';
                const avatarUrl = profiloVet?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(vetName)}&background=E0F2FE&color=0284C7`;
                const relationId = relazione.id;

                const vetHTML = `
                    <div id="vetCard_${relationId}" style="display: flex; align-items: center; padding: 15px; border: 1px solid #E2E8F0; border-radius: 16px; margin-bottom: 10px; background: #fff;">
                        <img src="${avatarUrl}" alt="Avatar" style="width: 45px; height: 45px; border-radius: 50%; object-fit: cover; margin-right: 15px; border: 1px solid #E2E8F0;" onerror="this.src='https://ui-avatars.com/api/?name=V&background=E0F2FE&color=0284C7'">
                        <div style="flex-grow: 1;">
                            <h4 style="margin: 0; color: #1E293B; font-size: 1rem;">${vetName}</h4>
                            <p style="margin: 3px 0 0 0; font-size: 0.8rem; color: #059669; font-weight: 600;">
                                <i class="fa-solid fa-check-circle"></i> Accesso autorizzato
                            </p>
                        </div>
                        <button onclick="revocaAccesso('${relationId}', '${vetName}')" style="background-color: transparent; color: #EF4444; border: 1px solid #EF4444; padding: 6px 12px; border-radius: 8px; font-size: 0.8rem; font-weight: bold; cursor: pointer; transition: all 0.2s;">
                            Revoca
                        </button>
                    </div>
                `;
                authorizedVetsContainer.insertAdjacentHTML('beforeend', vetHTML);
            });
        }
        // ==========================================
        // 4. POPOLA ATTIVITÀ RECENTI (Ancora finto per ora)
        // ==========================================
        const { data: activities, error: actError } = await supabase
            .from('walks') 
            .select('*')
            .eq('creator_id', user.id)
            .limit(0); 

        if (!activities || activities.length === 0) {
            recentActivitiesContainer.innerHTML = `
                <div class="empty-state-text" style="padding-left: 0;">Nessuna attività registrata di recente.</div>
            `;
        } else {
            recentActivitiesContainer.innerHTML = '';
        }

    } catch (err) {
        console.error("Errore nel caricamento profilo:", err);
        alert("Impossibile caricare il profilo: " + err.message);
    }
}

// ==========================================
// FUNZIONE GLOBALE: REVOCA ACCESSO VETERINARIO
// ==========================================
window.revocaAccesso = async function(relationId, vetName) {
    // 1. Conferma di sicurezza per evitare click per sbaglio
    const conferma = confirm(`Sei sicuro di voler revocare l'accesso alla cartella clinica a ${vetName}?`);
    if (!conferma) return;

    try {
        // Mettiamo il bottone in caricamento visivo
        const btn = document.querySelector(`#vetCard_${relationId} button`);
        if (btn) btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

        // 2. Cancelliamo fisicamente il permesso da Supabase
        const { error } = await supabase
            .from('veterinarian_patients')
            .update()({
                status: 'revoked',
                revoked_at: new Date().toISOString() // Salva la data e l'ora spaccata di adesso
            })
            .eq('id', relationId);

        if (error) throw error;

        // 3. Rimuoviamo la card dalla grafica con una piccola animazione!
        const card = document.getElementById(`vetCard_${relationId}`);
        if (card) {
            card.style.opacity = '0';
            setTimeout(() => {
                card.remove();
                
                // Se era l'ultimo veterinario, rimettiamo la scritta "Nessun veterinario"
                if (authorizedVetsContainer.children.length === 0) {
                    authorizedVetsContainer.innerHTML = `
                        <div class="info-card" style="justify-content: center;">
                            <div class="empty-state-text">Nessun veterinario ha ancora l'accesso.</div>
                        </div>
                    `;
                }
            }, 300);
        }

    } catch (err) {
        console.error("Errore durante la revoca:", err);
        alert("Impossibile revocare l'accesso. Riprova tra poco.");
        
        // Se c'è errore, ripristiniamo il bottone
        const btn = document.querySelector(`#vetCard_${relationId} button`);
        if (btn) btn.innerHTML = 'Revoca';
    }
};

loadPetProfile();