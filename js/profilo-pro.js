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
const locationsCountProfile = document.getElementById('locationsCountProfile');

// ==========================================
// 2. CARICA IL PROFILO E IL CONTEGGIO LUOGHI
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
        let citta = profileData.citta?.trim() || "Città non specificata";

        // ==========================================
        // GESTIONE AVATAR: FORZA INIZIALI ARANCIONI
        // ==========================================
        // Come richiesto, qui ignoriamo la foto profilo e forziamo sempre le iniziali arancioni
        const encodedName = encodeURIComponent(nomeCompletoUtente);
        const avatarUrl = `https://ui-avatars.com/api/?name=${encodedName}&background=F58220&color=FFFFFF`;
        
        const avatarHTML = `<img src="${avatarUrl}" alt="Avatar" class="user-image-avatar">`;

        // STAMPA FINALE nell'HTML
        if (profileHeaderContainer) {
            profileHeaderContainer.innerHTML = avatarHTML + `
                <h1 id="userNameDisplay">${nomeCompletoUtente}</h1>
                <p id="userDetailsDisplay">Account verificato &middot; ${citta}</p>
            `;
        }

        // CARICA CONTEGGIO LUOGHI / ZONE
        await loadLocationsCount();

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

        if (profileHeaderContainer) {
            profileHeaderContainer.innerHTML = `
                <div class="user-initials-avatar" style="background-color: #DC2626; color: white;">!</div>
                <h1 id="userNameDisplay">Errore</h1>
                <p id="userDetailsDisplay">Impossibile caricare i dati</p>
            `;
        }
    }
}

// Funzione che conta quante zone/sedi ha configurato il professionista
async function loadLocationsCount() {
    if (!locationsCountProfile) return;

    try {
        const { count, error } = await supabase
            .from('provider_locations')
            .select('*', { count: 'exact', head: true })
            .eq('provider_id', currentUser.id)
            .eq('ruolo_associato', 'professionista'); 

        if (error) throw error;

        if (count === 0) {
            locationsCountProfile.textContent = "Nessuna zona/sede configurata";
        } else {
            locationsCountProfile.textContent = `${count} ${count === 1 ? 'zona/sede configurata' : 'zone/sedi configurate'}`;
        }
    } catch (e) {
        console.error("Errore recupero conteggio luoghi", e);
        locationsCountProfile.textContent = "Gestisci sedi e domicilio";
    }
}

// ==========================================
// 3. TASTO LOGOUT / ESCI
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

// Avvia tutto al caricamento!
loadUserProfile();