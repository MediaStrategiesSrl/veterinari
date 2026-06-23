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

// Seleziona elementi del DOM del form di registrazione
const form = document.getElementById("signupForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const confirmPasswordInput = document.getElementById("confirmPassword");
const passwordError = document.getElementById("passwordError");
const statusMessage = document.getElementById("statusMessage");
const submitButton = form.querySelector('button[type="submit"]');

// Gestisce lo stato di caricamento del pulsante
function setLoading(isLoading) {
    submitButton.disabled = isLoading;
    submitButton.textContent = isLoading ? "Registrazione in corso..." : "Registrati";
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

// Verifica che le credenziali Supabase siano configurate correttamente
function isSupabaseConfigured() {
    return (
        SUPABASE_URL &&
        SUPABASE_ANON_KEY &&
        !SUPABASE_URL.startsWith("INSERISCI") &&
        !SUPABASE_ANON_KEY.startsWith("INSERISCI")
    );
}

// Gestisce l'invio del form di registrazione
form.addEventListener("submit", async function (event) {
    event.preventDefault();
    hideStatus();

    // Valida che le password coincidano
    if (passwordInput.value !== confirmPasswordInput.value) {
        passwordError.classList.add("visible");
        confirmPasswordInput.focus();
        return;
    }

    passwordError.classList.remove("visible");

    if (!isSupabaseConfigured()) {
        showStatus(
            "Configura SUPABASE_URL e SUPABASE_ANON_KEY in js/config.js prima di registrarti.",
            "error"
        );
        return;
    }

    setLoading(true);

   // 1. Rileva automaticamente se sei sul PC in locale o sul server online
const isLocal = window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost";

// 2. Crea il link corretto aggiungendo la cartella /VeterinariApp/ solo se sei online
const targetRedirectUrl = isLocal 
    ? window.location.origin + "/completeprofile.html"
    : window.location.origin + "/VeterinariApp/completeprofile.html";

// 3. Invia la richiesta di registrazione passando l'URL dinamico appena calcolato
const { data, error } = await supabase.auth.signUp({
    email: emailInput.value.trim(),
    password: passwordInput.value,
    options: {
        redirectTo: targetRedirectUrl, 
    },
});
    setLoading(false);

    // Gestisce errori di registrazione
    if (error) {
        showStatus(error.message, "error");
        return;
    }

    // Se richiede conferma email
    if (data.user && !data.session) {
        showStatus(
            "Registrazione completata. Controlla la tua email per confermare l'account.",
            "success"
        );
        form.reset();
        return;
    }

    showStatus("Registrazione completata. Ora puoi accedere.", "success");
    form.reset();
});

// Mostra/nasconde errore password in tempo reale
confirmPasswordInput.addEventListener("input", function () {
    if (passwordInput.value === confirmPasswordInput.value) {
        passwordError.classList.remove("visible");
    }
});
