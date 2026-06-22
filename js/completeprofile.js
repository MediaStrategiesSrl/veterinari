import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const form = document.getElementById("completeProfileForm");
const roleSelect = document.getElementById("roleSelect");
const dynamicFormFields = document.getElementById("dynamicFormFields");
const professionalFields = document.getElementById("professionalFields");
const clientFields = document.getElementById("clientFields");
const statusMessage = document.getElementById("statusMessage");
const submitButton = document.getElementById("submitButton");
const vetFields = document.getElementById("vetFields");
const sponsorFields = document.getElementById("sponsorFields");

// Mappa globale per associare al volo il 'nome' del ruolo al suo 'id' numerico
let rolesMap = {};

// 1. CARICAMENTO DINAMICO DELLA TENDINA RUOLI
async function loadRoles() {
    try {
        const { data: roles, error } = await supabase
            .from('roles')
            .select('id, nome, label')
            .order('id', { ascending: true });

        if (error) throw error;

        roleSelect.innerHTML = '<option value="" disabled selected>Scegli il tuo profilo...</option>';
        
        roles.forEach(role => {
            // Popoliamo la mappa di riferimento (es. rolesMap["proprietario"] = 2)
            rolesMap[role.nome] = role.id;

            const option = document.createElement('option');
            option.value = role.nome; // Usato per la logica dei toggle visivi del form
            option.textContent = role.label; // Testo visibile (es. "Professionista del Settore Pet")
            roleSelect.appendChild(option);
        });
    } catch (error) {
        showStatus("Errore nel caricamento dei ruoli: " + error.message, "error");
    }
}

// 2. MOSTRA/NASCONDI I CAMPI IN BASE AL RUOLO SELEZIONATO
roleSelect.addEventListener("change", function () {
    dynamicFormFields.classList.remove("hidden");
    
    // Rimuoviamo la visibilità a tutti i blocchi speciali prima di mostrare quello corretto
    if (professionalFields) professionalFields.classList.add("hidden");
    if (clientFields) clientFields.classList.add("hidden");
    if (vetFields) vetFields.classList.add("hidden");
    if (sponsorFields) sponsorFields.classList.add("hidden");

    // Resettiamo i 'required' per evitare blocchi invisibili all'invio
    setRequired("specificProfession", false);
    setRequired("petName", false);
    setRequired("petSpecie", false);
    setRequired("vetOrderNumber", false);
    setRequired("vetClinicAddress", false);
    setRequired("sponsorCompanyName", false);
    setRequired("sponsorVat", false);

    // Controllo basato sul testo esatto della colonna 'nome' del tuo DB
    if (this.value === "altro professionista" && professionalFields) {
        professionalFields.classList.remove("hidden");
        setRequired("specificProfession", true);
    } else if (this.value === "proprietario" && clientFields) {
        clientFields.classList.remove("hidden");
        setRequired("petName", true);
        setRequired("petSpecie", true);
    } else if (this.value === "veterinario" && vetFields) {
        vetFields.classList.remove("hidden"); // <--- Questo mostrerà i campi del veterinario
        setRequired("vetOrderNumber", true);
        setRequired("vetClinicAddress", true);
    } else if (this.value === "sponsor" && sponsorFields) {
        sponsorFields.classList.remove("hidden");
        setRequired("sponsorCompanyName", true);
        setRequired("sponsorVat", true);
    }
});

// Funzione di supporto per evitare crash se un ID non esiste nell'HTML
function setRequired(id, isRequired) {
    const element = document.getElementById(id);
    if (element) {
        element.required = isRequired;
    }
}

// 3. SALVATAGGIO DEI DATI MULTI-TABELLA
form.addEventListener("submit", async function (event) {
    event.preventDefault();
    hideStatus();

    // Recupera l'utente autenticato dalla sessione corrente di Supabase Auth
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
        showStatus("Sessione utente scaduta o non trovata. Riloggati.", "error");
        return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "Salvataggio...";

    const selectedRoleName = roleSelect.value;
    const selectedRoleId = rolesMap[selectedRoleName];

    // --- STEP 1: Inserimento / Aggiornamento Anagrafica in 'profiles' ---
    const profileData = {
        id: user.id, // Specifichiamo l'id per fare un upsert pulito
        nome: document.getElementById("firstName").value.trim(),
        cognome: document.getElementById("lastName").value.trim(),
        telefono: document.getElementById("phone").value.trim(),
        citta: document.getElementById("city").value.trim(),
        email: user.email // Prendiamo l'email direttamente dall'oggetto user di Supabase Auth
    };

    const { error: profileError } = await supabase
        .from("profiles")
        .upsert(profileData);

    if (profileError) {
        showStatus("Errore anagrafica: " + profileError.message, "error");
        enableSubmit();
        return;
    }

    // --- STEP 2: Collegamento Ruolo nella tabella ponte 'user_roles' ---
    const { error: roleError } = await supabase
        .from("user_roles")
        .upsert({ user_id: user.id, role_id: selectedRoleId });

    if (roleError) {
        showStatus("Errore assegnazione ruolo: " + roleError.message, "error");
        enableSubmit();
        return;
    }

    // --- STEP 3: Scrittura nelle tabelle specifiche in base alla scelta ---
    if (selectedRoleName === "altro professionista") {
        const { error: profError } = await supabase
            .from("professionals")
            .upsert({
                user_id: user.id,
                tipo_professione: document.getElementById("specificProfession").value,
                tariffa_oraria: 0.00 // Inizializzazione campo numeric del DB
            });

        if (profError) {
            showStatus("Errore dati professionista: " + profError.message, "error");
            enableSubmit();
            return;
        }
    } 
    else if (selectedRoleName === "proprietario") {
        // Generazione stringa casuale univoca per bypassare il vincolo NOT NULL / UNIQUE di qr_code_hash
        const generatedQrHash = "QR-" + crypto.randomUUID().substring(0, 8).toUpperCase();

        const { error: petError } = await supabase
            .from("pets")
            .insert({
                owner_id: user.id,
                nome: document.getElementById("petName").value.trim(),
                specie: document.getElementById("petSpecie").value,
                qr_code_hash: generatedQrHash
            });

        if (petError) {
            showStatus("Errore inserimento animale: " + petError.message, "error");
            enableSubmit();
            return;
        }
    }

    // Se l'utente ha scelto "veterinario" o "sponsor", i campi extra verranno inseriti 
    // dalle rispettive dashboard dedicate per non appesantire questo primo form.

    showStatus("Profilo attivato con successo! Configurazione completata.", "success");
    setTimeout(() => {
        window.location.href = "dashboard.html";
    }, 2000);
});

function enableSubmit() {
    submitButton.disabled = false;
    submitButton.textContent = "Salva e Continua";
}

function showStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;
    statusMessage.hidden = false;
}

function hideStatus() {
    statusMessage.hidden = true;
}

// Avvio del flusso al caricamento della pagina
loadRoles();