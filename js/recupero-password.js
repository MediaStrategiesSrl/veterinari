import { supabase } from '../utils/supabaseClient.js';
import { logError } from '../utils/logger.js'; // Aggiunto import del logger

const form = document.getElementById("recoveryForm");
const statusMessage = document.getElementById("statusMessage");
const submitButton = document.getElementById("submitButton");
const emailInput = document.getElementById("email");

function setLoading(isLoading) {
    submitButton.disabled = isLoading;
    if (isLoading) {
        submitButton.innerHTML = `Invio in corso... <i class="fa-solid fa-spinner fa-spin" style="margin-left: 5px;"></i>`;
    } else {
        submitButton.innerHTML = `Invia Link di Recupero <i class="fa-solid fa-envelope" style="margin-left: 5px;"></i>`;
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

    const email = emailInput.value.trim();

    if (!email) {
        showStatus("Per favore, inserisci un'email valida.", "error");
        return;
    }

    setLoading(true);

    try {
        // Chiama Supabase per inviare l'email di reset
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            // Sostituisci questo URL con l'indirizzo reale o locale della tua app
            redirectTo: window.location.origin + '/aggiorna-password.html',
        });

        if (error) {
            // LOG ERRORE SUPABASE
            await logError({
                source: 'recupero_password',
                action: 'reset_password_for_email',
                errorMessage: error.message || "Errore rifiutato da Supabase",
                errorCode: error.code || 'SUPABASE_AUTH_ERROR',
                context: { email_inserita: email }
            });

            showStatus("Errore: " + error.message, "error");
            setLoading(false);
            return;
        }

        // Se va a buon fine
        showStatus("Link inviato! Controlla la tua casella di posta (anche nello spam).", "success");
        emailInput.value = ""; // Svuota il campo
        setLoading(false);

    } catch (err) {
        console.error("Errore generico:", err);
        
        // LOG ERRORE DI SISTEMA/RETE
        await logError({
            source: 'recupero_password',
            action: 'submit_form_catch',
            errorMessage: err.message || "Errore imprevisto durante l'invio.",
            errorCode: err.code || 'UNKNOWN_SYS_ERROR',
            stackTrace: err.stack,
            context: { email_inserita: email, userAgent: navigator.userAgent }
        });

        showStatus("Errore imprevisto durante l'invio.", "error");
        setLoading(false);
    }
});