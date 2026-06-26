// Importa libreria Supabase per autenticazione
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

// Inizializza client Supabase con credenziali e memorizzazione della sessione
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        persistSession: true,
        storage: localStorage,
        autoRefreshToken: true,
    },
});

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

        // 2. Scopri il ruolo dell'utente per il redirect dinamico
        const { data: roleData, error: roleError } = await supabase
            .from('user_roles')
            .select(`
                roles (
                    nome_ruolo,
                    nome
                )
            `)
            .eq('user_id', user.id)
            .limit(1)
            .single();

        if (roleError) {
            console.warn("Impossibile recuperare il ruolo o utente senza ruolo:", roleError.message);
        }

        showStatus("Accesso eseguito! Reindirizzamento in corso...", "success");
        
        // 3. Esegui il reindirizzamento in base al ruolo trovato
        setTimeout(() => {
            // Controlliamo sia 'nome_ruolo' che 'nome' nel caso in cui la colonna nel DB si chiami diversamente
            const userRole = roleData?.roles?.nome_ruolo?.toLowerCase() || roleData?.roles?.nome?.toLowerCase();

            switch (userRole) {
                case 'veterinario':
                    window.location.href = "dashboard-veterinario.html";
                    break;
                case 'professionista': 
                case 'altro professionista': // Gestisce entrambe le possibili diciture
                    window.location.href = "dashboard-professionista.html";
                    break;
                case 'sponsor':
                    window.location.href = "dashboard-sponsor.html";
                    break;
                case 'proprietario':
                    window.location.href = "dashboard-proprietario.html";
                    break;
                default:
                    // Fallback di sicurezza: se il ruolo non è definito
                    console.log("Ruolo non riconosciuto o mancante, fallback attivato.");
                    window.location.href = "dashboard-proprietario.html"; 
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