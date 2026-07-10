import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let currentUser = null; // Variabile globale per sapere chi è loggato

// Elementi del DOM
const profileHeaderContainer = document.getElementById("profileHeaderContainer");
const userNameDisplay = document.getElementById("userNameDisplay");
const userDetailsDisplay = document.getElementById("userDetailsDisplay");
const btnLogout = document.getElementById("btnLogout");
const deleteRoleBtn = document.getElementById("deleteRoleBtn"); // Il bottone rosso!

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

// ==========================================
// 1. CARICAMENTO DEL PROFILO
// ==========================================
async function loadUserProfile() {
    try {
        // Controlla chi è loggato
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            window.location.href = "../../index.html";
            return;
        }
        currentUser = user; // Salviamo l'utente!

        // Prendi i dati dalla tabella profiles
        const { data: profileData, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

        if (error) throw error;

        // Popola l'interfaccia
        let nomeUtente = profileData.nome?.trim() || "";
        let cognomeUtente = profileData.cognome?.trim() || "";
        const nomeCompletoUtente = [nomeUtente, cognomeUtente].filter(Boolean).join(" ").trim() || "Utente Senza Nome";
        let citta = profileData.citta?.trim() || "Roma";

        // Gestione dinamica Avatar
        let avatarHTML = '';
        if (profileData.avatar_url) {
            const { data } = supabase.storage.from('storage_veterinari').getPublicUrl(profileData.avatar_url);
            avatarHTML = `<img src="${data.publicUrl}" alt="Avatar" class="user-image-avatar">`;
        } else {
            const initials = getInitials(nomeUtente, cognomeUtente);
            avatarHTML = `<div class="user-initials-avatar">${initials}</div>`;
        }

        // STAMPA FINALE
        if (profileHeaderContainer) {
            profileHeaderContainer.innerHTML = avatarHTML + `
                <h1 id="userNameDisplay">${nomeCompletoUtente}</h1>
                <p id="userDetailsDisplay">Account verificato · ${citta}</p>
            `;
        }

    } catch (err) {
        console.error("Errore nel caricamento del profilo:", err);
        if (userNameDisplay) userNameDisplay.textContent = "Errore";
        if (userDetailsDisplay) userDetailsDisplay.textContent = "Impossibile caricare i dati";
    }
}

// ==========================================
// 2. TASTO LOGOUT / ESCI
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

// ==========================================
// 3. TASTO ELIMINA RUOLO PROPRIETARIO
// ==========================================
if (deleteRoleBtn) {
    deleteRoleBtn.addEventListener('click', async () => {
        const confermato = confirm("Attenzione: Sei sicuro di voler eliminare il tuo ruolo di Proprietario? Perderai TUTTI i dati dei tuoi animali e i relativi appuntamenti. Il tuo account principale rimarrà intatto.");
        
        if (confermato) {
            deleteRoleBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Pulizia dati in corso...';
            deleteRoleBtn.style.pointerEvents = 'none';

            try {
                // A. Trova l'ID del ruolo "Proprietario"
                const { data: roleData, error: roleError } = await supabase
                    .from('roles')
                    .select('id')
                    .ilike('nome', '%proprietario%')
                    .single();
                    
                if (roleError) throw roleError;

                // B. Pulisci Appuntamenti
                const { error: apptError } = await supabase
                    .from('appointments')
                    .delete()
                    .eq('owner_id', currentUser.id);
                if (apptError) throw apptError;

                // C. Pulisci Consulti urgenti
                const { error: urgentError } = await supabase
                    .from('urgent_consultations')
                    .delete()
                    .eq('owner_id', currentUser.id);
                if (urgentError) throw urgentError;

                // D. Elimina gli animali (Questo attiverà il CASCADE interno del DB per distruggere in automatico anche i 'medical_records')
                const { error: petsError } = await supabase
                    .from('pets')
                    .delete()
                    .eq('owner_id', currentUser.id);
                if (petsError) throw petsError;

                // E. Infine, sgancia chirurgicamente il ruolo dalla tabella user_roles
                const { error: unlinkError } = await supabase
                    .from('user_roles')
                    .delete()
                    .eq('user_id', currentUser.id)
                    .eq('role_id', roleData.id);
                if (unlinkError) throw unlinkError;

                alert("Ruolo Proprietario e relativi animali rimossi con successo!");
                window.location.href = "../../ruoli.html";

            } catch (error) {
                console.error("Errore durante l'eliminazione del ruolo proprietario:", error);
                alert("Si è verificato un errore di sistema. Nessun dato è stato rimosso.");
                
                deleteRoleBtn.innerHTML = 'Elimina Ruolo Proprietario';
                deleteRoleBtn.style.pointerEvents = 'auto';
            }
        }
    });
}

// Avvio
loadUserProfile();