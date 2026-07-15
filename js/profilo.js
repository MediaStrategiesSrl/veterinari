// ==========================================
// 1. IMPORT CENTRALIZZATI E SETUP
// ==========================================
// Assicurati che i percorsi (../utils/) puntino alla tua struttura reale
import { supabase } from '../utils/supabaseClient.js';
import { logError } from '../utils/logger.js';

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
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        if (authError) throw Object.assign(new Error(authError.message), { code: authError.code || 'AUTH_SYS_ERROR' });
        
        if (!user) {
            window.location.href = "../../index.html";
            return;
        }
        currentUser = user; // Salviamo l'utente!

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

        // STAMPA FINALE
        if (profileHeaderContainer) {
            profileHeaderContainer.innerHTML = avatarHTML + `
                <h1 id="userNameDisplay">${nomeCompletoUtente}</h1>
                <p id="userDetailsDisplay">Account verificato · ${citta}</p>
            `;
        }

    } catch (err) {
        console.error("Errore nel caricamento del profilo:", err);
        
        // ==========================================
        // TRIGGER LOG ERROR
        // ==========================================
        await logError({
            source: 'profilo_proprietario',
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
            
            // ==========================================
            // TRIGGER LOG ERROR
            // ==========================================
            await logError({
                source: 'profilo_proprietario',
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
                    
                if (roleError) throw Object.assign(new Error(roleError.message), { code: roleError.code || 'DB_FETCH_ROLE_ERROR' });

                // B. Pulisci Appuntamenti
                const { error: apptError } = await supabase
                    .from('appointments')
                    .delete()
                    .eq('owner_id', currentUser.id);
                if (apptError) throw Object.assign(new Error(apptError.message), { code: apptError.code || 'DB_DELETE_APPT_ERROR' });

                // C. Pulisci Consulti urgenti
                const { error: urgentError } = await supabase
                    .from('urgent_consultations')
                    .delete()
                    .eq('owner_id', currentUser.id);
                if (urgentError) throw Object.assign(new Error(urgentError.message), { code: urgentError.code || 'DB_DELETE_URGENT_ERROR' });

                // D. Elimina gli animali (Questo attiverà il CASCADE interno del DB per distruggere in automatico anche i 'medical_records')
                const { error: petsError } = await supabase
                    .from('pets')
                    .delete()
                    .eq('owner_id', currentUser.id);
                if (petsError) throw Object.assign(new Error(petsError.message), { code: petsError.code || 'DB_DELETE_PETS_ERROR' });

                // E. Infine, sgancia chirurgicamente il ruolo dalla tabella user_roles (Usiamo doppio .eq per sicurezza)
                const { error: unlinkError } = await supabase
                    .from('user_roles')
                    .delete()
                    .eq('user_id', currentUser.id)
                    .eq('role_id', roleData.id);
                if (unlinkError) throw Object.assign(new Error(unlinkError.message), { code: unlinkError.code || 'DB_DELETE_USER_ROLE_ERROR' });

                alert("Ruolo Proprietario e relativi animali rimossi con successo!");
                window.location.href = "../../ruoli.html";

            } catch (error) {
                console.error("Errore durante l'eliminazione del ruolo proprietario:", error);
                
                // ==========================================
                // TRIGGER LOG ERROR
                // ==========================================
                await logError({
                    source: 'profilo_proprietario',
                    action: 'delete_owner_role',
                    errorMessage: error.message || "Fallimento durante l'eliminazione a cascata del ruolo proprietario",
                    errorCode: error.code || 'UNKNOWN_DB_ERROR',
                    context: { userId: currentUser?.id }
                });

                alert("Si è verificato un errore di sistema critico. L'operazione è stata interrotta e i tecnici sono stati avvisati.");
                
                deleteRoleBtn.innerHTML = 'Elimina Ruolo Proprietario';
                deleteRoleBtn.style.pointerEvents = 'auto';
            }
        }
    });
}

// Avvio
loadUserProfile();