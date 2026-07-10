import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Cattura gli stessi elementi del tuo HTML
const profileHeaderContainer = document.getElementById("profileHeaderContainer");
const userNameDisplay = document.getElementById("userNameDisplay");
const userDetailsDisplay = document.getElementById("userDetailsDisplay");
const btnLogout = document.getElementById("btnLogout");

// Funzione utile: Estrae le iniziali da Nome e Cognome (Identica alla tua)
function getInitials(firstName, lastName) {
    const firstInitial = firstName?.trim()?.[0] || "";
    const lastInitial = lastName?.trim()?.[0] || "";
    if (firstInitial && lastInitial) {
        return (firstInitial + lastInitial).toUpperCase();
    }
    if (firstInitial) {
        return firstInitial.toUpperCase();
    }
    if (lastInitial) {
        return lastInitial.toUpperCase();
    }
    return "UT"; 
}

async function loadUserProfile() {
    try {
        // 1. Controlla chi è loggato
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            window.location.href = "../index.html";
            return;
        }

        // 2. Prendi i dati dalla tabella profiles (Valido anche per il professionista)
        const { data: profileData, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

        if (error) throw error;

        // 3. Popola l'interfaccia
        let nomeUtente = "";
        if (profileData.nome && profileData.nome.trim() !== "") {
            nomeUtente = profileData.nome.trim();
        }

        let cognomeUtente = "";
        if (profileData.cognome && profileData.cognome.trim() !== "") {
            cognomeUtente = profileData.cognome.trim();
        }

        const nomeCompletoUtente = [nomeUtente, cognomeUtente].filter(Boolean).join(" ").trim() || "Utente Senza Nome";
        
        let citta = "Milano";
        if (profileData.citta && profileData.citta.trim() !== "") {
            citta = profileData.citta.trim();
        }

        // 4. Gestione dinamica Avatar (Usa lo stesso bucket 'storage_veterinari')
        let avatarHTML = '';
        if (profileData.avatar_url) {
            const { data } = supabase.storage.from('storage_veterinari').getPublicUrl(profileData.avatar_url);
            avatarHTML = `<img src="${data.publicUrl}" alt="Avatar" class="user-image-avatar">`;
        } else {
            const initials = getInitials(nomeUtente, cognomeUtente);
            avatarHTML = `<div class="user-initials-avatar">${initials}</div>`;
        }

        // 5. STAMPA FINALE nell'HTML del Professionista
        if (profileHeaderContainer) {
            profileHeaderContainer.innerHTML = avatarHTML + `
                <h1 id="userNameDisplay">${nomeCompletoUtente}</h1>
                <p id="userDetailsDisplay">Account verificato &middot; ${citta}</p>
            `;
        }

    } catch (err) {
        console.error("Errore nel caricamento del profilo professionista:", err);
        if (userNameDisplay) userNameDisplay.textContent = "Errore";
        if (userDetailsDisplay) userDetailsDisplay.textContent = "Impossibile caricare i dati";
    }
}

loadUserProfile();

// ==========================================
// TASTO LOGOUT / CAMBIA PROFILO
// ==========================================
if (btnLogout) {
    btnLogout.addEventListener("click", async () => {
        const { error } = await supabase.auth.signOut();
        if (error) {
            alert("Errore durante il logout: " + error.message);
        } else {
            window.location.href = "../../index.html";
        }
    });
}