// 1. IMPORT CENTRALIZZATI
// ==========================================
import { supabase } from '../utils/supabaseClient.js';
import { logError } from '../utils/logger.js';

// Elementi DOM
const form = document.getElementById("loginForm");
const statusMessage = document.getElementById("statusMessage");
const submitButton = document.getElementById("submitButton");
const emailInput = document.getElementById("email");
const rememberMeCheckbox = document.getElementById("rememberMe");

// ==========================================
// CONTROLLO SESSIONE ATTIVA ALL'AVVIO
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
    // 1. Controlla se l'utente ha già una sessione attiva su questo dispositivo
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (session && session.user) {
        showStatus("Sessione trovata. Reindirizzamento in automatico...", "success");
        setLoading(true);
        await handleUserRedirect(session.user);
    }
    
    // 2. Se in precedenza aveva spuntato "Ricordami", precompila l'email (Comodità UX)
    const savedEmail = localStorage.getItem("rememberedEmail");
    if (savedEmail) {
        emailInput.value = savedEmail;
        if (rememberMeCheckbox) rememberMeCheckbox.checked = true;
    }
});

// Gestisce lo stato di caricamento del pulsante (mantenendo le icone)
function setLoading(isLoading) {
    submitButton.disabled = isLoading;
    if (isLoading) {
        submitButton.innerHTML = `Accesso in corso... <i class="fa-solid fa-spinner fa-spin" style="margin-left: 5px;"></i>`;
    } else {
        submitButton.innerHTML = `Accedi <i class="fa-solid fa-arrow-right" style="margin-left: 5px;"></i>`;
    }
}

// Gestione dell'invio del form di Login
form.addEventListener("submit", async function (event) {
    event.preventDefault();
    hideStatus();

    const passwordInput = document.getElementById("password");

    // Controllo che i campi non siano vuoti
    if (!emailInput.value.trim() || !passwordInput.value) {
        showStatus("Per favore, compila tutti i campi.", "error");
        return;
    }

    setLoading(true);

    try {
        // 1. Esegui il Login con Supabase
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email: emailInput.value.trim(),
            password: passwordInput.value
        });

        if (authError) {
            showStatus("Credenziali non valide: " + authError.message, "error");
            setLoading(false);
            return;
        }

        // 2. Gestione flag "Ricordami su questo dispositivo"
        if (rememberMeCheckbox && rememberMeCheckbox.checked) {
            localStorage.setItem("rememberedEmail", emailInput.value.trim());
        } else {
            localStorage.removeItem("rememberedEmail");
            // Nota: per rimuovere del tutto la sessione alla chiusura andrebbe configurato 
            // il supabase client su sessionStorage, ma il comportamento standard web 
            // è mantenere il token finché non si fa "Esci".
        }

        showStatus("Accesso eseguito! Reindirizzamento in corso...", "success");
        
        // 3. Verifica ruolo e reindirizza
        await handleUserRedirect(authData.user);

    } catch (err) {
        console.error("Errore generico durante il login:", err);
        showStatus("Errore imprevisto durante il login.", "error");
        setLoading(false);
    }
});

// ==========================================
// LOGICA DI CONTROLLO RUOLO E REDIRECT
// ==========================================
async function handleUserRedirect(user) {
    let userRole = "";

    try {
        // Step A: Verifichiamo subito se l'utente è registrato nella tabella 'veterinarians'
        const { data: isVet, error: vetTableError } = await supabase
            .from('veterinarians')
            .select('user_id')
            .eq('user_id', user.id)
            .maybeSingle();

        if (vetTableError) {
            console.warn("Errore durante il controllo veterinario:", vetTableError.message);
            await logError({
                source: 'frontend_index_login',
                action: 'check_veterinarian',
                errorMessage: vetTableError.message,
                errorCode: vetTableError.code || 'DB_VET_CHECK_ERROR',
                context: { user_id: user.id }
            });
        }

        if (isVet) {
            userRole = "veterinario";
        } else {
            // Step B: Cerchiamo il ruolo nella tabella generica 'user_roles'
            const { data: roleData, error: roleError } = await supabase
                .from('user_roles')
                .select(`
                    roles (
                        nome
                    )
                `)
                .eq('user_id', user.id)
                .limit(1)
                .maybeSingle();

            if (roleError) {
                console.warn("Impossibile recuperare il ruolo o utente senza ruolo:", roleError.message);
                await logError({
                    source: 'frontend_index_login',
                    action: 'fetch_user_role',
                    errorMessage: roleError.message,
                    errorCode: roleError.code || 'DB_USER_ROLE_FETCH_ERROR',
                    context: { user_id: user.id }
                });
            }

            if (roleData?.roles) {
                userRole = (roleData.roles.nome || "").toLowerCase();
            }
        }
    } catch (err) {
        console.error("Errore nel recupero dati utente:", err);
    }

    // 4. Esegui il reindirizzamento in base al ruolo
    setTimeout(() => {
        switch (userRole) {
            case 'veterinario':
                window.location.href = "pages/veterinario/dashboard-veterinario.html";
                break;
            case 'professionista': 
            case 'altro professionista': 
                window.location.href = "pages/professionista/dashboard-professionista.html";
                break;
            case 'sponsor':
                window.location.href = "pages/sponsor/dashboard-sponsor.html";
                break;
            case 'proprietario':
                window.location.href = "pages/proprietario/dashboard-proprietario.html";
                break;
            default:
                // Fallback verso proprietario
                console.log("Ruolo non riconosciuto o mancante, fallback attivato verso proprietario.");
                window.location.href = "pages/proprietario/dashboard-proprietario.html"; 
                break;
        }
    }, 1000); // Ritardo leggermente ridotto per un'esperienza più scattante
}

// Funzioni di utilità
function showStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;
    statusMessage.hidden = false;
}

function hideStatus() {
    statusMessage.hidden = true;
    statusMessage.className = 'status-message';
}