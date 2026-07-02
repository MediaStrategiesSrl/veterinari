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
const submitButton = document.getElementById("submitButton");

// Gestisce lo stato di caricamento del pulsante (mantenendo le icone!)
function setLoading(isLoading) {
    submitButton.disabled = isLoading;
    if (isLoading) {
        // Mostra un'icona di caricamento che gira
        submitButton.innerHTML = `Registrazione in corso... <i class="fa-solid fa-spinner fa-spin" style="margin-left: 5px;"></i>`;
    } else {
        // Ripristina la freccia originale
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
   const targetRedirectUrl = window.location.origin + "/completeprofile.html";

    // 3. Invia la richiesta di registrazione passando l'URL dinamico calcolato
    const { data, error } = await supabase.auth.signUp({
        email: emailInput.value.trim(),
        password: passwordInput.value,
        options: {
            // CORREZIONE: parametro esatto per la conferma via email su Supabase V2
            emailRedirectTo: targetRedirectUrl, 
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
function checkPasswordsMatch() {
    // Se il campo conferma è vuoto, non mostrare nessun errore (non infastidiamo l'utente)
    if (confirmPasswordInput.value === "") {
        passwordError.classList.remove("visible");
    } 
    // Se l'utente ha scritto qualcosa e non coincide, mostra l'errore
    else if (passwordInput.value !== confirmPasswordInput.value) {
        passwordError.classList.add("visible");
    } 
    // Se coincidono perfettamente, nascondi l'errore
    else {
        passwordError.classList.remove("visible");
    }
}

// Facciamo scattare il controllo sia quando scrive nella prima password, sia nella seconda
confirmPasswordInput.addEventListener("input", checkPasswordsMatch);
passwordInput.addEventListener("input", checkPasswordsMatch);