// 1. IMPORT CENTRALIZZATI
// ==========================================
// Assicurati che i percorsi puntino alla cartella corretta (es. ../utils/)
import { supabase } from '../utils/supabaseClient.js';
import { logError } from '../utils/logger.js';

// Elementi DOM
const form = document.getElementById("loginForm");
const statusMessage = document.getElementById("statusMessage");
const submitButton = document.getElementById("submitButton");

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

    const emailInput = document.getElementById("email");
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

        const user = authData.user;
        let userRole = "";

        // 2. CONTROLLO CORRETTO DEL RUOLO UTENTE
        // Step A: Verifichiamo subito se l'utente è registrato nella tabella 'veterinarians'
        const { data: isVet, error: vetTableError } = await supabase
            .from('veterinarians')
            .select('user_id')
            .eq('user_id', user.id)
            .maybeSingle(); // Evita di andare in crash se la riga non esiste

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
            // Se esiste nella tabella veterinari, il ruolo è confermato!
            userRole = "veterinario";
        } else {
            // Step B: Se non è un veterinario, cerchiamo il suo ruolo nella tabella generica 'user_roles'
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
                // Estrae il testo del ruolo convertendolo in minuscolo
                userRole = (roleData.roles.nome || "").toLowerCase();
            }
        }

        showStatus("Accesso eseguito! Reindirizzamento in corso...", "success");
        
        // 3. Esegui il reindirizzamento in base al ruolo trovato
        setTimeout(() => {
            switch (userRole) {
                case 'veterinario':
                    window.location.href = "pages/veterinario/dashboard-veterinario.html";
                    break;
                case 'professionista': 
                case 'altro professionista': // Gestisce entrambe le possibili diciture
                    window.location.href = "pages/professionista/dashboard-professionista.html";
                    break;
                case 'sponsor':
                    window.location.href = "pages/sponsor/dashboard-sponsor.html";
                    break;
                case 'proprietario':
                    window.location.href = "pages/proprietario/dashboard-proprietario.html";
                    break;
                default:
                    // Fallback di sicurezza: se il ruolo non è definito o non riconosciuto
                    console.log("Ruolo non riconosciuto o mancante, fallback attivato verso proprietario.");
                    window.location.href = "pages/proprietario/dashboard-proprietario.html"; 
                    break;
            }
        }, 1500);

    } catch (err) {
        console.error("Errore generico durante il login:", err);
        showStatus("Errore imprevisto durante il login.", "error");
        setLoading(false);
    }
});

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