import { supabase } from '../utils/supabaseClient.js';

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
        showStatus("Errore imprevisto. Riprova più tardi.", "error");
        setLoading(false);
    }
});