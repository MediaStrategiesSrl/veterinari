import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const profileHeaderContainer = document.getElementById("profileHeaderContainer");
const userNameDisplay = document.getElementById("userNameDisplay");
const userDetailsDisplay = document.getElementById("userDetailsDisplay");
const btnLogout = document.getElementById("btnLogout");

// Funzione utile: Estrae le iniziali da Nome e Cognome
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
    return "UT"; // Utente generico se non ci sono iniziali
}

async function loadUserProfile() {
    try {
        // 1. Controlla chi è loggato
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            window.location.href = "index.html";
            return;
        }

        // 2. Prendi i dati dalla tabella profiles (o users, dipende da come l'hai chiamata)
        const { data: profileData, error } = await supabase
            .from('profiles') // <-- Cambialo in 'users' se la tua tabella si chiama così
            .select('*')
            .eq('id', user.id)
            .single();

        if (error) throw error;

        // 3. Popola l'interfaccia
        let nomeUtente = "Utente Senza Nome";
        if (profileData.nome && profileData.nome.trim() !== "") {
            nomeUtente = profileData.nome.trim();
        }

        let cognomeUtente = "";
        if (profileData.cognome && profileData.cognome.trim() !== "") {
            cognomeUtente = profileData.cognome.trim();
        }

        userNameDisplay.textContent = nomeUtente;
        
        // Mockup della città (se non l'hai nel db la mettiamo fissa o dinamica)
        let citta = "Milano";
        if (profileData.citta && profileData.citta.trim() !== "") {
            citta = profileData.citta.trim();
        }
        userDetailsDisplay.textContent = `Account verificato · ${citta}`;

        // 4. Gestione dinamica Avatar (Immagine vs Iniziali)
        let avatarHTML = '';
        if (profileData.avatar_url) {
            // Se c'è un'immagine, mostra quella
            const { data } = supabase.storage.from('storage_veterinari').getPublicUrl(profileData.avatar_url);
            avatarHTML = `<img src="${data.publicUrl}" alt="Avatar" class="user-image-avatar">`;
        } else {
            // Se non c'è, mostra il quadrato arancione con le iniziali
            const initials = getInitials(nomeUtente, cognomeUtente);
            avatarHTML = `<div class="user-initials-avatar">${initials}</div>`;
        }

        // Sostituisce solo l'avatar senza toccare h1 e p sottostanti
        profileHeaderContainer.innerHTML = avatarHTML + `
            <h1 id="userNameDisplay">${nomeUtente}</h1>
            <p id="userDetailsDisplay">Account verificato · ${citta}</p>
        `;

    } catch (err) {
        console.error("Errore nel caricamento del profilo:", err);
        userNameDisplay.textContent = "Errore";
        userDetailsDisplay.textContent = "Impossibile caricare i dati";
    }
}

loadUserProfile();

// ==========================================
// TASTO LOGOUT / CAMBIA PROFILO
// ==========================================
if (btnLogout) {
    btnLogout.addEventListener("click", async () => {
        // Disconnette l'utente da Supabase
        const { error } = await supabase.auth.signOut();
        if (error) {
            alert("Errore durante il logout: " + error.message);
        } else {
            // Riporta alla pagina di Login
            window.location.href = "index.html";
        }
    });
}