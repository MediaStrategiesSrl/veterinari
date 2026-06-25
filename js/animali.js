import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const activeProfilesCount = document.getElementById("activeProfilesCount");
const petMainAvatar = document.getElementById("petMainAvatar");
const petMainName = document.getElementById("petMainName");
const petMainDesc = document.getElementById("petMainDesc");

let currentPetId = null;

async function loadAnimaliData() {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            window.location.href = "login.html";
            return;
        }

        const { data: pets, error } = await supabase
            .from('pets')
            .select('*')
            .eq('owner_id', user.id);

        if (error) throw error;

        if (pets && pets.length > 0) {
            activeProfilesCount.textContent = pets.length === 1 ? "1 profilo attivo" : `${pets.length} profili attivi`;
            
            const mainPet = pets[0];
            currentPetId = mainPet.id;

            petMainName.textContent = mainPet.nome;
            const razzaText = mainPet.razza ? ` · ${mainPet.razza}` : '';
            petMainDesc.textContent = `${mainPet.specie}${razzaText}`;

            // Aggiorna SOLO la foto dell'avatar
            if (mainPet.avatar_url) {
                const { data } = supabase.storage.from('storage_veterinari').getPublicUrl(mainPet.avatar_url);
                petMainAvatar.src = data.publicUrl;
            } else {
                petMainAvatar.src = 'assets/default-pet.png';
            }
        } else {
            activeProfilesCount.textContent = "0 profili attivi";
            petMainName.textContent = "Nessun animale";
            petMainDesc.textContent = "Aggiungi un cucciolo dalla Dashboard";
            petMainAvatar.src = 'assets/default-pet.png';
        }

    } catch (err) {
        console.error("Errore nel caricamento:", err);
        activeProfilesCount.textContent = "Errore";
    }
}

loadAnimaliData();

// ==========================================
// CLICK SULLE CARD
// ==========================================
document.getElementById("btnProfiloCompleto").addEventListener("click", () => {
    if (currentPetId) window.location.href = `profilo-animale.html?petId=${currentPetId}`;
});

document.getElementById("btnCartellaSanitaria").addEventListener("click", () => {
    alert("Cartella clinica in fase di sviluppo!");
});

document.getElementById("btnQRCode").addEventListener("click", () => {
    if (currentPetId) window.location.href = `qr-pets.html?petId=${currentPetId}`;
});