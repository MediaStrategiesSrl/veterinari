import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Variabile globale per sapere chi sta usando l'app in questo momento
let currentUser = null; 

// Cattura gli elementi dell'HTML
const profileHeaderContainer = document.getElementById("profileHeaderContainer");
const userNameDisplay = document.getElementById("userNameDisplay");
const userDetailsDisplay = document.getElementById("userDetailsDisplay");
const btnLogout = document.getElementById("btnLogout");
const deleteRoleBtn = document.getElementById('deleteRoleBtn'); // Il nostro nuovo bottone rosso!

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
    return "UT"; 
}

// ==========================================
// 1. CARICA IL PROFILO
// ==========================================
async function loadUserProfile() {
    try {
        // Controlla chi è loggato
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            window.location.href = "../../index.html"; // Path corretto per tornare alla home
            return;
        }
        currentUser = user; // Salviamo l'utente nella variabile globale!

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

        // STAMPA FINALE nell'HTML
        if (profileHeaderContainer) {
            profileHeaderContainer.innerHTML = avatarHTML + `
                <h1 id="userNameDisplay">${nomeCompletoUtente}</h1>
                <p id="userDetailsDisplay">Account verificato &middot; ${citta}</p>
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
// 3. TASTO ELIMINA RUOLO (Solo ruolo, non profilo!)
// ==========================================
if (deleteRoleBtn) {
    deleteRoleBtn.addEventListener('click', async () => {
        // Chiedi conferma
        const confermato = confirm("Attenzione: Sei sicuro di voler rinunciare al ruolo di Professionista (Pet Sitter/Educatore)? Il tuo account generale rimarrà intatto.");
        
        if (confermato) {
            deleteRoleBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Rimozione in corso...';
            deleteRoleBtn.style.pointerEvents = 'none';

            try {
                // A. Trova l'ID del ruolo "Professionista"
                const { data: roleData, error: roleError } = await supabase
                    .from('roles')
                    .select('id')
                    .ilike('nome', '%professionista%')
                    .single();
                    
                if (roleError) throw roleError;

                // B. Sgancia il ruolo da user_roles (Eliminazione chirurgica)
                const { error: unlinkError } = await supabase
                    .from('user_roles')
                    .delete()
                    .eq('user_id', currentUser.id)
                    .eq('role_id', roleData.id);
                    
                if (unlinkError) throw unlinkError;

                // C. Cancella i dati specifici del listino/professione
                const { error: deleteProError } = await supabase
                    .from('professionals')
                    .delete()
                    .eq('user_id', currentUser.id);

                if (deleteProError) throw deleteProError;

                alert("Ruolo rimosso con successo!");
                
                // Rimanda alla schermata di selezione dei ruoli! (Aggiusta i puntini ../ se serve)
                window.location.href = "../../ruoli.html"; 

            } catch (error) {
                console.error("Errore durante l'eliminazione del ruolo:", error);
                alert("Errore di sistema. Riprova più tardi.");
                
                // Ripristina il bottone in caso di errore
                deleteRoleBtn.innerHTML = 'Elimina Ruolo Professionista';
                deleteRoleBtn.style.pointerEvents = 'auto';
            }
        }
    });
}

// Avvia tutto al caricamento!
loadUserProfile();