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
            .select('nome, cognome, citta') // Rimosso intenzionalmente avatar_url
            .eq('id', user.id)
            .single();

        if (profileError) throw Object.assign(new Error(profileError.message), { code: profileError.code || 'DB_FETCH_PROFILE_ERROR' });

        // Popola l'interfaccia
        let nomeUtente = profileData.nome?.trim() || "";
        let cognomeUtente = profileData.cognome?.trim() || "";
        const nomeCompletoUtente = [nomeUtente, cognomeUtente].filter(Boolean).join(" ").trim() || "Utente Senza Nome";
        let citta = profileData.citta?.trim() || "Milano";

        // ==========================================
        // GESTIONE AVATAR: FORZATURA INIZIALI ARANCIONI
        // ==========================================
        // Ignoriamo la foto profilo. Generiamo sempre le iniziali arancioni.
        const encodedName = encodeURIComponent(nomeCompletoUtente);
        const fallbackUrl = `https://ui-avatars.com/api/?name=${encodedName}&background=F58220&color=FFFFFF`;
        const avatarHTML = `<img src="${fallbackUrl}" alt="Avatar" class="user-image-avatar" style="width: 80px; height: 80px; border-radius: 20px; object-fit: cover;">`;

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

        if (profileHeaderContainer) {
            profileHeaderContainer.innerHTML = `
                <div class="user-initials-avatar" style="background-color: #DC2626; color: white; width: 80px; height: 80px; border-radius: 20px; display: flex; align-items: center; justify-content: center; font-size: 2rem;">!</div>
                <h1 id="userNameDisplay">Errore</h1>
                <p id="userDetailsDisplay">Impossibile caricare i dati</p>
            `;
        }
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

// Avvio
loadUserProfile();