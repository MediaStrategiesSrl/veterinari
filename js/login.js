// Importa libreria Supabase per autenticazione
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

// Inizializza client Supabase con credenziali
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const form = document.getElementById("loginForm");
const statusMessage = document.getElementById("statusMessage");
const submitButton = form.querySelector('button[type="submit"]');

form.addEventListener("submit", async function (event) {
    event.preventDefault();
    hideStatus();

    const email = document.getElementById("email");
    const password = document.getElementById("password");

    if(!email || !password) {
        showStatus("Per favore, compila tutti i campi.", "error");
        return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "Accesso in corso...";

    try{
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email.value,
            password: password.value
        });

    if (error) {
            showStatus("Credenziali non valide: " + error.message, "error");
            enableSubmit();
            return;
        }

        // 4. Successo: Supabase ha salvato il token nel LocalStorage. 
        // Reindirizziamo l'utente alla dashboard
        showStatus("Accesso eseguito! Reindirizzamento...", "success");
        
        setTimeout(() => {
            window.location.href = "dashboard.html";
        }, 1500);

    } catch (err) {
        showStatus("Errore imprevisto durante il login.", "error");
        enableSubmit();
    }
});

function enableSubmit() {
    submitButton.disabled = false;
    submitButton.textContent = "Accedi";
}

function showStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;
    statusMessage.hidden = false;
}

function hideStatus() {
    statusMessage.hidden = true;
}