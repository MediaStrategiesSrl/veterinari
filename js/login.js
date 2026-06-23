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
const submitButton = form.querySelector('button[type="submit"]');

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

    submitButton.disabled = true;
    submitButton.textContent = "Accesso in corso...";

    try {
        // 1. Esegui il Login con Supabase
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email: emailInput.value.trim(),
            password: passwordInput.value
        });

        if (authError) {
            showStatus("Credenziali non valide: " + authError.message, "error");
            enableSubmit();
            return;
        }

        const user = authData.user;

        // 2. Scopri il ruolo dell'utente per il redirect dinamico
        // Interroghiamo la tabella user_roles e facciamo un join con roles
        const { data: roleData, error: roleError } = await supabase
            .from('user_roles')
            .select(`
                roles (
                    nome_ruolo
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
            // Estrapoliamo il nome del ruolo (se esiste, altrimenti null) e lo mettiamo in minuscolo per sicurezza
            const userRole = roleData?.roles?.nome_ruolo?.toLowerCase();

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
                    // Fallback di sicurezza: se il ruolo non è definito o è diverso, mandalo a una pagina predefinita (es. proprietario o completamento profilo)
                    console.log("Ruolo non riconosciuto o mancante, fallback attivato.");
                    window.location.href = "dashboard-proprietario.html"; 
                    break;
            }
        }, 1500);

    } catch (err) {
        console.error("Errore generico durante il login:", err);
        showStatus("Errore imprevisto durante il login.", "error");
        enableSubmit();
    }
});

// Funzioni di utilità
function enableSubmit() {
    submitButton.disabled = false;
    submitButton.textContent = "Accedi";
}

function showStatus(message, type) {
    statusMessage.textContent = message;
    // Pulisce le classi precedenti e aggiunge quella corretta (es. 'success' o 'error')
    statusMessage.className = `status-message ${type}`;
    statusMessage.hidden = false;
}

function hideStatus() {
    statusMessage.hidden = true;
    statusMessage.className = 'status-message';
}