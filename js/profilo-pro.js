// ==========================================
// 1. IMPORT CENTRALIZZATI
// ==========================================
// Controlla sempre che i percorsi puntino alla cartella 'utils' corretta
import { supabase } from '../utils/supabaseClient.js';
import { logError } from '../utils/logger.js';

// Variabile globale per sapere chi sta usando l'app in questo momento
let currentUser = null; 

// Cattura gli elementi dell'HTML
const profileHeaderContainer = document.getElementById("profileHeaderContainer");
const userNameDisplay = document.getElementById("userNameDisplay");
const userDetailsDisplay = document.getElementById("userDetailsDisplay");
const btnLogout = document.getElementById("btnLogout");
const deleteRoleBtn = document.getElementById('deleteRoleBtn'); 

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
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        if (authError) throw Object.assign(new Error(authError.message), { code: authError.code || 'AUTH_SYS_ERROR' });
        
        if (!user) {
            window.location.href = "../../index.html"; 
            return;
        }
        currentUser = user; 

        // Prendi i dati dalla tabella profiles
        const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

        if (profileError) throw Object.assign(new Error(profileError.message), { code: profileError.code || 'DB_FETCH_PROFILE_ERROR' });

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
        
        // LOG DI SISTEMA
        await logError({
            source: 'impostazioni_profilo',
            action: 'load_user_profile',
            errorMessage: err.message || "Errore imprevisto caricamento profilo",
            errorCode: err.code || 'UNKNOWN_SYS_ERROR',
            context: { userId: currentUser?.id }
        });

        if (userNameDisplay) userNameDisplay.textContent = "Errore";
        if (userDetailsDisplay) userDetailsDisplay.textContent = "Impossibile caricare i dati";
    }
}

// ==========================================
// 2. TASTO LOGOUT / ESCI
// ==========================================
if (btnLogout) {
    btnLogout.addEventListener("click", async () => {
        try {
            const { error } = await supabase.auth.signOut();
            if (error) throw Object.assign(new Error(error.message), { code: error.code || 'AUTH_SIGNOUT_ERROR' });
            
            window.location.href = "../../index.html";
        } catch (err) {
            console.error("Errore durante il logout:", err);
            
            await logError({
                source: 'impostazioni_profilo',
                action: 'logout_user',
                errorMessage: err.message || "Logout fallito",
                errorCode: err.code || 'UNKNOWN_AUTH_ERROR',
                context: { userId: currentUser?.id }
            });
            
            alert("Errore durante il logout. Riprova.");
        }
    });
}

// ==========================================
// 3. TASTO ELIMINA RUOLO
// ==========================================
if (deleteRoleBtn) {
    deleteRoleBtn.addEventListener('click', async () => {
        const confermato = confirm("Attenzione: Sei sicuro di voler rinunciare al ruolo di Professionista (Pet Sitter/Educatore)? Il tuo account generale rimarrà intatto.");
        if (!confermato) return;

        deleteRoleBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Rimozione in corso...';
        deleteRoleBtn.style.pointerEvents = 'none';

        try {
            // A. Trova l'ID del ruolo "Professionista"
            const { data: roleData, error: roleError } = await supabase
                .from('roles')
                .select('id')
                .ilike('nome', '%professionista%')
                .single();
                
            if (roleError) throw Object.assign(new Error(roleError.message), { code: roleError.code || 'DB_FETCH_ROLE_ERROR' });

            // B. Sgancia il ruolo da user_roles
            const { error: unlinkError } = await supabase
                .from('user_roles')
                .delete()
                .eq('user_id', currentUser.id)
                .eq('role_id', roleData.id);
                
            if (unlinkError) throw Object.assign(new Error(unlinkError.message), { code: unlinkError.code || 'DB_DELETE_USER_ROLE_ERROR' });

            // C. Cancella i dati specifici del listino/professione
            const { error: deleteProError } = await supabase
                .from('professionals')
                .delete()
                .eq('user_id', currentUser.id);

            if (deleteProError) throw Object.assign(new Error(deleteProError.message), { code: deleteProError.code || 'DB_DELETE_PROFESSIONAL_ERROR' });

            alert("Ruolo rimosso con successo!");
            window.location.href = "../../ruoli.html"; 

        } catch (error) {
            console.error("Errore durante l'eliminazione del ruolo:", error);
            
            // LOG DI SISTEMA
            await logError({
                source: 'impostazioni_profilo',
                action: 'delete_professional_role',
                errorMessage: error.message || "Fallimento durante la rimozione a cascata del ruolo",
                errorCode: error.code || 'UNKNOWN_DB_ERROR',
                context: { userId: currentUser?.id }
            });

            alert("Errore di sistema. Riprova più tardi. I tecnici sono stati informati.");
            
            deleteRoleBtn.innerHTML = 'Elimina Ruolo Professionista';
            deleteRoleBtn.style.pointerEvents = 'auto';
        }
    });
}

// Avvia tutto al caricamento!
loadUserProfile();