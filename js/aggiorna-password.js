import { supabase } from '../utils/supabaseClient.js';
import { logError } from '../utils/logger.js'; // Import del sistema di logging centrale

const form = document.getElementById("updatePasswordForm");
const statusMessage = document.getElementById("statusMessage");
const submitButton = document.getElementById("submitButton");
const newPasswordInput = document.getElementById("newPassword");

// Supabase scatta questo evento quando l'utente atterra dal link di recupero
supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
        console.log("Modalità recupero password attivata.");
    }
});

function setLoading(isLoading) {
    submitButton.disabled = isLoading;
    if (isLoading) {
        submitButton.innerHTML = `Salvataggio... <i class="fa-solid fa-spinner fa-spin" style="margin-left: 5px;"></i>`;
    } else {
        submitButton.innerHTML = `Salva Nuova Password <i class="fa-solid fa-floppy-disk" style="margin-left: 5px;"></i>`;
    }
}

function showStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;
    statusMessage.hidden = false;
}

form.addEventListener("submit", async function (event) {
    event.preventDefault();
    statusMessage.hidden = true;

    if (newPasswordInput.value.length < 8) {
        showStatus("La password deve avere almeno 8 caratteri.", "error");
        return;
    }

    setLoading(true);

    try {
        // Aggiorna la password dell'utente attualmente "autorizzato" dal token dell'email
        const { error } = await supabase.auth.updateUser({
            password: newPasswordInput.value
        });

        if (error) {
            // LOG ERRORE SUPABASE: Token scaduto, password debole, ecc.
            await logError({
                source: 'aggiorna_password',
                action: 'update_user_password',
                errorMessage: error.message || "Errore rifiutato da Supabase durante l'aggiornamento",
                errorCode: error.code || 'SUPABASE_UPDATE_ERROR',
                context: {}
            });

            showStatus("Errore nell'aggiornamento: " + error.message, "error");
            setLoading(false);
            return;
        }

        // Se va a buon fine, rimandiamo al login
        showStatus("Password aggiornata! Reindirizzamento al login...", "success");
        
        setTimeout(() => {
            window.location.href = "index.html"; // Torna alla pagina di Login principale
        }, 2000);

    } catch (err) {
        console.error("Errore generico:", err);
        
        // LOG ERRORE DI SISTEMA/RETE
        await logError({
            source: 'aggiorna_password',
            action: 'submit_form_catch',
            errorMessage: err.message || "Errore imprevisto durante l'aggiornamento.",
            errorCode: err.code || 'UNKNOWN_SYS_ERROR',
            stackTrace: err.stack,
            context: { userAgent: navigator.userAgent }
        });

        showStatus("Errore imprevisto. Riprova più tardi.", "error");
        setLoading(false);
    }
});