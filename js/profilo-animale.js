import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Elementi DOM
const pageHeaderTitle = document.getElementById("pageHeaderTitle");
const petProfileName = document.getElementById("petProfileName");
const petProfileId = document.getElementById("petProfileId");
const petProfileAvatar = document.getElementById("petProfileAvatar");
const petSpeciesBreed = document.getElementById("petSpeciesBreed");

const authorizedVetsContainer = document.getElementById("authorizedVetsContainer");
const recentActivitiesContainer = document.getElementById("recentActivitiesContainer");

async function loadPetProfile() {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            window.location.href = "login.html";
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

        // 2. Popola i Dati Base (Avatar, Nome, Specie, Razza, ID)
        pageHeaderTitle.textContent = `Profilo di ${pet.nome}`;
        petProfileName.textContent = pet.nome;
        
        // Creiamo un finto ID alfanumerico partendo dall'UUID reale di Supabase
        const shortId = pet.id.split('-')[0].toUpperCase();
        petProfileId.textContent = `VT-${shortId}`;

        // Specie e razza
        const razzaText = pet.razza ? ` · ${pet.razza}` : '';
        petSpeciesBreed.textContent = `${pet.specie}${razzaText}`;

        // Avatar
        if (pet.avatar_url) {
            const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(pet.avatar_url);
            // Se per caso usi 'storage_veterinari' e 'pets_avatar', cambia la riga sopra di conseguenza!
            petProfileAvatar.src = publicUrlData.publicUrl;
        }

        // ==========================================
        // 3. POPOLA ACCESSI VETERINARI (Dinamico)
        // ==========================================
        // Per ora facciamo una query finta su una tabella che potresti non avere ancora ("vet_access")
        // che ci restituirà array vuoto, scatenando lo stato "Nullo" elegantemente.
        const { data: vets, error: vetError } = await supabase
            .from('appointments') // Usiamo appointments come mock per ora
            .select('provider_id')
            .eq('owner_id', user.id)
            .limit(0); // Forza a 0 per simulare il vuoto

        if (!vets || vets.length === 0) {
            authorizedVetsContainer.innerHTML = `
                <div class="info-card" style="justify-content: center;">
                    <div class="empty-state-text">Nessun veterinario ha ancora l'accesso.</div>
                </div>
            `;
        } else {
            // Qui andrà la logica quando avremo i veterinari collegati
            authorizedVetsContainer.innerHTML = ''; 
        }

        // ==========================================
        // 4. POPOLA ATTIVITÀ RECENTI (Dinamico)
        // ==========================================
        const { data: activities, error: actError } = await supabase
            .from('walks') // Usiamo walks come mock
            .select('*')
            .eq('creator_id', user.id)
            .limit(0); // Forza a 0 per simulare il vuoto

        if (!activities || activities.length === 0) {
            recentActivitiesContainer.innerHTML = `
                <div class="empty-state-text" style="padding-left: 0;">Nessuna attività registrata di recente.</div>
            `;
        } else {
            // Logica timeline per il futuro
            recentActivitiesContainer.innerHTML = '';
        }

    } catch (err) {
        console.error("Errore nel caricamento profilo:", err);
        alert("Impossibile caricare il profilo: " + err.message);
    }
}

loadPetProfile();