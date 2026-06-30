import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Elementi DOM
const vetName = document.getElementById("vetName");
const vetAvatar = document.getElementById("vetAvatar");
const vetDistance = document.getElementById("vetDistance");
// Se in futuro aggiungi la tariffa in DB
const vetPrice = document.getElementById("vetPrice"); 

async function initPage() {
    // 1. Legge l'ID dalla URL
    const urlParams = new URLSearchParams(window.location.search);
    const vetId = urlParams.get('id');

    if (!vetId) {
        vetName.textContent = "Errore: ID mancante";
        return;
    }

    try {
        // 2. Scarica i dati reali da Supabase (Tabella veterinari)
        const { data: vetData, error } = await supabase
            .from('veterinarians')
            .select(`
                user_id,
                profiles (nome, avatar_url)
            `)
            .eq('user_id', vetId)
            .single();

        if (error) throw error;

        // 3. Popola Nome e Avatar
      if (vetData.profiles) {
            const nomeProf = vetData.profiles.nome || "Utente Sconosciuto";
            vetName.textContent = nomeProf;
            
            // Se ha una foto reale la usa, altrimenti crea un'icona carina con la sua iniziale!
            if (vetData.profiles.avatar_url) {
                vetAvatar.src = vetData.profiles.avatar_url;
            } else {
                vetAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(nomeProf)}&background=E2E8F0&color=1E293B&size=150`;
            }
        }

        // 4. Mostra la distanza pescata da cerca.js
        const distSalvata = localStorage.getItem(`dist_${vetId}`);
        if (distSalvata) {
            vetDistance.textContent = `${distSalvata} km`;
        } else {
            vetDistance.textContent = "n.d.";
        }

    } catch (error) {
        console.error("Errore recupero dettagli:", error);
        vetName.textContent = "Profilo non trovato";
    }
}

initPage();