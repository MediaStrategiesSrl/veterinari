import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const profileHeaderContainer = document.getElementById("profileHeaderContainer");
const userNameDisplay = document.getElementById("userNameDisplay");
const userDetailsDisplay = document.getElementById("userDetailsDisplay");
const btnLogout = document.getElementById("btnLogout");

// Funzione utile: Estrae le prime due lettere (Iniziali) da un Nome e Cognome
function getInitials(name) {
    if (!name) return "UT"; // Utente generico se non c'è nome
    const nameParts = name.trim().split(" ");
    if (nameParts.length >= 2) {
        return (nameParts[0][0] + nameParts[1][0]).toUpperCase();
    }
    return nameParts[0].substring(0, 2).toUpperCase();
}

async function loadUserProfile() {
    try {
        // 1. Controlla chi è loggato
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            window.location.href = "login.html";
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
        const nomeUtente = profileData.nome || "Utente Senza Nome";
        userNameDisplay.textContent = nomeUtente;
        
        // Mockup della città (se non l'hai nel db la mettiamo fissa o dinamica)
        const citta = profileData.citta || "Milano";
        userDetailsDisplay.textContent = `Account verificato · ${citta}`;

        // 4. Gestione dinamica Avatar (Immagine vs Iniziali)
        let avatarHTML = '';
        if (profileData.avatar_url) {
            // Se c'è un'immagine, mostra quella
            const { data } = supabase.storage.from('storage_veterinari').getPublicUrl(profileData.avatar_url);
            avatarHTML = `<img src="${data.publicUrl}" alt="Avatar" class="user-image-avatar">`;
        } else {
            // Se non c'è, mostra il quadrato arancione con le iniziali
            const initials = getInitials(nomeUtente);
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
            window.location.href = "login.html";
        }
    });
}