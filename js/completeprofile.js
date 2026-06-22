import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const form = document.getElementById("completeProfileForm");
const roleCardsContainer = document.getElementById("role-cards-container");
const roleSelectHidden = document.getElementById("roleSelect");
const dynamicFormFields = document.getElementById("dynamicFormFields");

const professionalFields = document.getElementById("professionalFields");
const clientFields = document.getElementById("clientFields");
const vetFields = document.getElementById("vetFields");
const sponsorFields = document.getElementById("sponsorFields");

// Elementi dinamici per la specifica del tipo di animale
const petSpecieSelect = document.getElementById("petSpecie");
const specificPetTypeGroup = document.getElementById("specificPetTypeGroup");
const petSpecieSpecific = document.getElementById("petSpecieSpecific");
const specificProfessionSelect = document.getElementById("specificProfession");
const specificProfessionOtherGroup = document.getElementById("specificProfessionOtherGroup");
const specificProfessionOther = document.getElementById("specificProfessionOther");

const statusMessage = document.getElementById("statusMessage");
const submitButton = document.getElementById("submitButton");

let rolesMap = {};

const roleDescriptions = {
    "proprietario": "Animali, salute, servizi e incontri",
    "veterinario": "Cartella clinica, visite e video-consulti",
    "altro professionista": "Agenda, clienti, servizi e pagamenti",
    "sponsor": "Campagne geolocalizzate e statistiche"
};

// 1. CARICAMENTO DINAMICO DELLE CARD RUOLI DAL DB
async function loadRoles() {
    try {
        const { data: roles, error } = await supabase
            .from('roles')
            .select('id, nome, label')
            .order('id', { ascending: true });

        if (error) throw error;

        roleCardsContainer.innerHTML = '';
        
        roles.forEach(role => {
            rolesMap[role.nome] = role.id;

            const card = document.createElement('div');
            card.className = 'role-card';
            card.dataset.value = role.nome;

            const descText = roleDescriptions[role.nome] || "Esplora le funzionalità dedicate";

            card.innerHTML = `
                <div>
                    <h3 class="role-card-title">${role.label}</h3>
                    <p class="role-card-desc">${descText}</p>
                </div>
                <div class="role-card-arrow">➔</div>
            `;

            card.addEventListener('click', () => handleRoleSelection(card, role.nome));
            roleCardsContainer.appendChild(card);
        });
    } catch (error) {
        showStatus("Errore nel caricamento dei ruoli: " + error.message, "error");
    }
}

// 2. GESTIONE DELLA SELEZIONE DELLA CARD
function handleRoleSelection(selectedCard, roleName) {
    document.querySelectorAll('.role-card').forEach(c => c.classList.remove('selected'));
    selectedCard.classList.add('selected');
    roleSelectHidden.value = roleName;

    dynamicFormFields.classList.remove("hidden");
    
    // Reset di tutti i blocchi visivi e parametri obbligatori
    [professionalFields, clientFields, vetFields, sponsorFields, specificPetTypeGroup, specificProfessionOtherGroup].forEach(el => { if(el) el.classList.add("hidden"); });
    setRequired("specificProfession", false);
    setRequired("specificProfessionOther", false);
    setRequired("petName", false);
    setRequired("petSpecie", false);
    setRequired("petSpecieSpecific", false);
    setRequired("vetOrderNumber", false);
    setRequired("vetClinicAddress", false);
    setRequired("sponsorCompanyName", false);
    setRequired("sponsorVat", false);

    if (roleName === "altro professionista" && professionalFields) {
        professionalFields.classList.remove("hidden");
        setRequired("specificProfession", true);
    } else if (roleName === "proprietario" && clientFields) {
        clientFields.classList.remove("hidden");
        setRequired("petName", true);
        setRequired("petSpecie", true);
    } else if (roleName === "veterinario" && vetFields) {
        vetFields.classList.remove("hidden");
        setRequired("vetOrderNumber", true);
        setRequired("vetClinicAddress", true);
    } else if (roleName === "sponsor" && sponsorFields) {
        sponsorFields.classList.remove("hidden");
        setRequired("sponsorCompanyName", true);
        setRequired("sponsorVat", true);
    }
}

// Evento per ascoltare se il tipo di animale è impostato su "Altro"
if (petSpecieSelect) {
    petSpecieSelect.addEventListener("change", function() {
        if (this.value === "Altro") {
            if (specificPetTypeGroup) specificPetTypeGroup.classList.remove("hidden");
            setRequired("petSpecieSpecific", true);
        } else {
            if (specificPetTypeGroup) specificPetTypeGroup.classList.add("hidden");
            setRequired("petSpecieSpecific", false);
            if (petSpecieSpecific) petSpecieSpecific.value = "";
        }
    });
}

// Evento per ascoltare se la professione specifica è impostata su "Altro"
if (specificProfessionSelect) {
    specificProfessionSelect.addEventListener("change", function() {
        if (this.value === "Altro") {
            if (specificProfessionOtherGroup) specificProfessionOtherGroup.classList.remove("hidden");
            setRequired("specificProfessionOther", true);
        } else {
            if (specificProfessionOtherGroup) specificProfessionOtherGroup.classList.add("hidden");
            setRequired("specificProfessionOther", false);
            if (specificProfessionOther) specificProfessionOther.value = "";
        }
    });
}

// 3. SALVATAGGIO RELAZIONALE DEI DATI
form.addEventListener("submit", async function (event) {
    event.preventDefault();
    hideStatus();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
        showStatus("Sessione utente non trovata. Effettua il login.", "error");
        return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "Salvataggio...";

    const selectedRoleName = roleSelectHidden.value;
    const selectedRoleId = rolesMap[selectedRoleName];

    // --- STEP 1: Aggiornamento dati anagrafici in 'profiles' ---
    const profileData = {
        id: user.id,
        nome: document.getElementById("firstName").value.trim(),
        cognome: document.getElementById("lastName").value.trim(),
        telefono: document.getElementById("phone").value.trim(),
        citta: document.getElementById("city").value.trim(),
        email: user.email
    };

    const { error: profileError } = await supabase.from("profiles").upsert(profileData);
    if (profileError) {
        showStatus("Errore anagrafica: " + profileError.message, "error");
        enableSubmit();
        return;
    }

    // --- STEP 2: Inserimento riga nella tabella ponte 'user_roles' ---
    const { error: roleError } = await supabase.from("user_roles").upsert({ user_id: user.id, role_id: selectedRoleId });
    if (roleError) {
        showStatus("Errore assegnazione ruolo: " + roleError.message, "error");
        enableSubmit();
        return;
    }

    // --- STEP 3: Scrittura nelle tabelle specifiche ---
    if (selectedRoleName === "altro professionista") {
        let finalTipoProfessione;
        if (specificProfessionSelect?.value === "Altro") {
            finalTipoProfessione = specificProfessionOther?.value.trim() || "Altro";
        } else {
            finalTipoProfessione = specificProfessionSelect?.value || "";
        }

        const { error: profError } = await supabase.from("professionals").upsert({
            user_id: user.id,
            tipo_professione: finalTipoProfessione,
            tariffa_oraria: 0.00 
        });
        if (profError) return handleSpecificError(profError.message);

    } else if (selectedRoleName === "proprietario") {
        const generatedQrHash = "QR-" + crypto.randomUUID().substring(0, 8).toUpperCase();

        // Determina se salvare il valore standard o quello scritto a mano nel campo specifico
        let finalSpecie;
        if (document.getElementById("petSpecie").value === "Altro") {
            finalSpecie = document.getElementById("petSpecieSpecific").value.trim();
        } else {
            finalSpecie = document.getElementById("petSpecie").value;
        }

        const { error: petError } = await supabase.from("pets").insert({
            owner_id: user.id,
            nome: document.getElementById("petName").value.trim(),
            specie: finalSpecie, // <--- Salva la stringa corretta nella colonna specie del tuo DB
            qr_code_hash: generatedQrHash
        });
        if (petError) return handleSpecificError(petError.message);

    } else if (selectedRoleName === "veterinario") {
        const { error: vetError } = await supabase.from("veterinarians").upsert({
            user_id: user.id,
            numero_ordine: document.getElementById("vetOrderNumber").value.trim(),
            indirizzo_clinica: document.getElementById("vetClinicAddress").value.trim(),
            is_available_now: false
        });
        if (vetError) return handleSpecificError(vetError.message);

    } else if (selectedRoleName === "sponsor") {
        const { error: sponsorError } = await supabase.from("sponsors").upsert({
            user_id: user.id,
            nome_azienda: document.getElementById("sponsorCompanyName").value.trim(),
            partita_iva: document.getElementById("sponsorVat").value.trim()
        });
        if (sponsorError) return handleSpecificError(sponsorError.message);
    }

    showStatus("Profilo completato con successo! Reindirizzamento...", "success");
    setTimeout(() => { window.location.href = "dashboard.html"; }, 2000);
});

function handleSpecificError(msg) {
    showStatus("Errore salvataggio dati specifici: " + msg, "error");
    enableSubmit();
}

function enableSubmit() {
    submitButton.disabled = false;
    submitButton.textContent = "Salva e Continua";
}

function setRequired(id, isRequired) {
    const element = document.getElementById(id);
    if (element) element.required = isRequired;
}

function showStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;
    statusMessage.hidden = false;
}

function hideStatus() { statusMessage.hidden = true; }

loadRoles();