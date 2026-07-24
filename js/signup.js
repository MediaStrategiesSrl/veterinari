// ==========================================
// 1. IMPORT CENTRALIZZATI
// ==========================================
import { supabase } from '../utils/supabaseClient.js';
import { logError } from '../utils/logger.js';

// ==========================================
// ELEMENTI DOM
// ==========================================
const form = document.getElementById("signupForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const confirmPasswordInput = document.getElementById("confirmPassword");
const passwordError = document.getElementById("passwordError");
const emailConsentInput = document.getElementById("emailConsent"); // NUOVO ELEMENTO
const statusMessage = document.getElementById("statusMessage");
const submitButton = document.getElementById("submitButton");

// ==========================================
// FUNZIONI DI SUPPORTO UI
// ==========================================
function setLoading(isLoading) {
    submitButton.disabled = isLoading;
    if (isLoading) {
        submitButton.innerHTML = `Registrazione in corso... <i class="fa-solid fa-spinner fa-spin" style="margin-left: 5px;"></i>`;
    } else {
        submitButton.innerHTML = `Registrati ora <i class="fa-solid fa-arrow-right" style="margin-left: 5px;"></i>`;
    }
}

function showStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;
    statusMessage.hidden = false;
}

function hideStatus() {
    statusMessage.hidden = true;
    statusMessage.textContent = "";
    statusMessage.className = "status-message";
}

// Mostra/nasconde errore password in tempo reale
function checkPasswordsMatch() {
    if (confirmPasswordInput.value === "") {
        passwordError.classList.remove("visible");
    } else if (passwordInput.value !== confirmPasswordInput.value) {
        passwordError.classList.add("visible");
    } else {
        passwordError.classList.remove("visible");
    }
}

confirmPasswordInput.addEventListener("input", checkPasswordsMatch);
passwordInput.addEventListener("input", checkPasswordsMatch);

// ==========================================
// 2. GESTIONE REGISTRAZIONE
// ==========================================
form.addEventListener("submit", async function (event) {
    event.preventDefault();
    hideStatus();

    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;
    const hasConsentedToEmails = emailConsentInput.checked; // LEGGE IL VALORE DELLA SPUNTA

    // Validazione Logica
    if (password !== confirmPassword) {
        passwordError.classList.add("visible");
        confirmPasswordInput.focus();
        return;
    }

    passwordError.classList.remove("visible");
    setLoading(true);

    try {
        const targetRedirectUrl = window.location.origin + "/completeprofile.html";

        // Chiamata Supabase Auth
        const { data, error } = await supabase.auth.signUp({
            email: email,
            password: password,
            options: {
                emailRedirectTo: targetRedirectUrl, 
                // PASSIAMO IL CONSENSO QUI: Verrà salvato nei metadati dell'utente
                data: {
                    newsletter_consent: hasConsentedToEmails
                }
            },
        });

        if (error) throw Object.assign(new Error(error.message), { code: error.code || 'AUTH_SIGNUP_ERROR' });

        // Gestione flussi post-registrazione
        if (data.user && !data.session) {
            showStatus(
                "Registrazione completata! Controlla la tua casella email per confermare l'account.",
                "success"
            );
        } else {
            showStatus("Registrazione completata. Accesso in corso...", "success");
            setTimeout(() => {
                window.location.href = "/completeprofile.html";
            }, 1500);
        }
        
        form.reset();

    } catch (error) {
        console.error("Errore durante la registrazione:", error);
        
        if (error.code !== 'user_already_exists') {
            await logError({
                source: 'registrazione_utente',
                action: 'submit_signup',
                errorMessage: error.message || "Fallimento critico durante la registrazione",
                errorCode: error.code || 'UNKNOWN_AUTH_ERROR',
                context: { email: email }
            });
        }

        const displayMessage = error.code === 'user_already_exists' 
            ? "Questo indirizzo email è già registrato. Prova ad accedere." 
            : "Si è verificato un errore di sistema. Riprova più tardi.";
            
        showStatus(displayMessage, "error");
    } finally {
        setLoading(false);
    }
});