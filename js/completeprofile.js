// 1. IMPORT CENTRALIZZATI
// ==========================================
// Assicurati che i percorsi puntino alla cartella corretta (es. ../utils/)
import { supabase } from '../utils/supabaseClient.js';
import { logError } from '../utils/logger.js';

// Elementi DOM
const form = document.getElementById("completeProfileForm");
const roleCardsContainer = document.getElementById("role-cards-container");
const roleSelectHidden = document.getElementById("roleSelect");
const dynamicFormFields = document.getElementById("dynamicFormFields");

const professionalFields = document.getElementById("professionalFields");
const clientFields = document.getElementById("clientFields");
const vetFields = document.getElementById("vetFields");
const sponsorFields = document.getElementById("sponsorFields");

// Elementi dinamici
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

// ==========================================
// 1. INIZIALIZZAZIONE SICURA E PRE-FILL ANAGRAFICA
// ==========================================
async function initializePage() {
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error || !session) {
        console.warn("Nessuna sessione attiva. Reindirizzo al login/signup.");
        if (error) {
            await logError({
                source: 'frontend_complete_profile',
                action: 'init_get_session',
                errorMessage: error.message,
                errorCode: error.code || 'SESSION_FETCH_ERROR',
                context: { userAgent: navigator.userAgent }
            });
        }
        window.location.href = "signup.html";
        return;
    }
    
    console.log("Utente autenticato. ID:", session.user.id);
    
    // NUOVO: Controlla e pre-compila i dati se l'utente esiste già
    await prefillExistingProfile(session.user.id);
    
    await loadRoles();
}

// Funzione dedicata al recupero e blocco dei dati anagrafici esistenti
async function prefillExistingProfile(userId) {
    try {
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('nome, cognome, data_nascita, telefono, citta, indirizzo')
            .eq('id', userId)
            .single();

        // Se l'errore è PGRST116 significa "Nessuna riga trovata" (è un utente nuovo), quindi ignoriamo l'errore
        if (error && error.code !== 'PGRST116') {
            console.error("Errore durante il controllo del profilo esistente:", error);
            return;
        }

        // Se il profilo esiste, auto-compiliamo i campi e li blocchiamo
        if (profile) {
            const fieldsToFill = {
                'firstName': profile.nome,
                'lastName': profile.cognome,
                'birthDate': profile.data_nascita,
                'phone': profile.telefono,
                'city': profile.citta,
                'address': profile.indirizzo
            };

            for (const [elementId, value] of Object.entries(fieldsToFill)) {
                const inputElement = document.getElementById(elementId);
                if (inputElement && value) {
                    inputElement.value = value;
                    // Blocchiamo il campo per evitare disallineamenti nel DB
                    inputElement.setAttribute('readonly', true);
                    // Diamo un feedback visivo (grigetto) per far capire che il dato è bloccato
                    inputElement.style.backgroundColor = '#F8FAFC';
                    inputElement.style.color = '#94A3B8';
                    inputElement.style.cursor = 'not-allowed';
                }
            }
        }
    } catch (err) {
        console.error("Eccezione durante il prefill:", err);
    }
}

supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT" || (!session && event === "INITIAL_SESSION")) {
        window.location.href = "signup.html";
    }
});

// ==========================================
// 2. CARICAMENTO RUOLI
// ==========================================

const roleIcons = {
    "proprietario": '<div class="profile-icon icon-paw"><i class="fa-solid fa-paw"></i></div>',
    "veterinario": '<div class="profile-icon icon-plus"><i class="fa-solid fa-plus"></i></div>',
    "altro professionista": '<div class="profile-icon icon-scissors"><i class="fa-solid fa-scissors"></i></div>',
    "sponsor": '<div class="profile-icon icon-arrow"><i class="fa-solid fa-arrow-right-long" style="transform: rotate(-45deg);"></i></div>'
};

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
            card.className = 'profile-row-card'; 
            card.dataset.value = role.nome;

            const descText = roleDescriptions[role.nome] || "Esplora le funzionalità dedicate";
            const iconHtml = roleIcons[role.nome.toLowerCase()] || '<div class="profile-icon"><i class="fa-solid fa-user"></i></div>';

            card.innerHTML = `
                ${iconHtml}
                <div class="profile-text">
                    <h3>${role.label || role.nome}</h3>
                    <p>${descText}</p>
                </div>
                <div class="profile-arrow"><i class="fa-solid fa-chevron-right"></i></div>
            `;

            card.addEventListener('click', () => handleRoleSelection(card, role.nome));
            roleCardsContainer.appendChild(card);
        });
    } catch (error) {
        // --- LOG ERRORE DB ---
        await logError({
            source: 'frontend_complete_profile',
            action: 'load_roles',
            errorMessage: error.message,
            errorCode: error.code || 'DB_ROLES_FETCH_ERROR',
            stackTrace: error.stack
        });
        showStatus("Errore nel caricamento dei ruoli: " + error.message, "error");
    }
}

// ==========================================
// 3. GESTIONE INTERFACCIA
// ==========================================
function handleRoleSelection(selectedCard, roleName) {
    document.querySelectorAll('.profile-row-card').forEach(c => c.classList.remove('selected'));
    selectedCard.classList.add('selected');
    
    roleSelectHidden.value = roleName;

    dynamicFormFields.classList.remove("hidden");
    
    [professionalFields, clientFields, vetFields, sponsorFields, specificPetTypeGroup, specificProfessionOtherGroup].forEach(el => { if(el) el.classList.add("hidden"); });
    
    ["specificProfession", "specificProfessionOther", "petName", "petSpecie", "petSpecieSpecific", "vetOrderNumber", "vetClinicAddress", "sponsorCompanyName", "sponsorVat"].forEach(id => setRequired(id, false));

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

// ==========================================
// 4. SALVATAGGIO DATI E REDIRECT
// ==========================================
form.addEventListener("submit", async function (event) {
    event.preventDefault();
    hideStatus();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
        if (userError) {
            await logError({
                source: 'frontend_complete_profile',
                action: 'submit_auth_check',
                errorMessage: userError.message,
                errorCode: userError.code || 'AUTH_CHECK_ERROR'
            });
        }
        showStatus("Sessione utente non trovata. Effettua il login.", "error");
        return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "Salvataggio...";

    const selectedRoleName = roleSelectHidden.value;
    const selectedRoleId = rolesMap[selectedRoleName];

    // STEP 1: Profilo Base
    const profileData = {
        id: user.id,
        nome: document.getElementById("firstName").value.trim(),
        cognome: document.getElementById("lastName").value.trim(),
        data_nascita: document.getElementById("birthDate").value.trim(),
        telefono: document.getElementById("phone").value.trim(),
        citta: document.getElementById("city").value.trim(),
        indirizzo: document.getElementById("address").value.trim(),
        email: user.email
    };

    const { error: profileError } = await supabase.from("profiles").upsert(profileData);
    if (profileError) {
        await logError({
            source: 'frontend_complete_profile',
            action: 'upsert_profile',
            errorMessage: profileError.message,
            errorCode: profileError.code || 'DB_PROFILE_UPSERT_ERROR',
            context: { user_id: user.id }
        });
        showStatus("Errore anagrafica: " + profileError.message, "error");
        enableSubmit();
        return;
    }

    // STEP 2: Assegnazione Ruolo
    const { error: roleError } = await supabase.from("user_roles").upsert({ user_id: user.id, role_id: selectedRoleId });
    if (roleError) {
        await logError({
            source: 'frontend_complete_profile',
            action: 'upsert_user_role',
            errorMessage: roleError.message,
            errorCode: roleError.code || 'DB_USER_ROLE_UPSERT_ERROR',
            context: { user_id: user.id, role_id: selectedRoleId }
        });
        showStatus("Errore assegnazione ruolo: " + roleError.message, "error");
        enableSubmit();
        return;
    }

    // STEP 3: Tabelle Specifiche
    if (selectedRoleName === "altro professionista") {
        let finalTipoProfessione = (specificProfessionSelect?.value === "Altro") 
            ? specificProfessionOther?.value.trim() || "Altro" 
            : specificProfessionSelect?.value || "";

        const { error: profError } = await supabase.from("professionals").upsert({
            user_id: user.id,
            tipo_professione: finalTipoProfessione,
            tariffa_oraria: 0.00 
        });
        if (profError) {
            await logError({ source: 'frontend_complete_profile', action: 'upsert_professional', errorMessage: profError.message, errorCode: profError.code, context: { user_id: user.id }});
            return handleSpecificError(profError.message);
        }

    } else if (selectedRoleName === "proprietario") {
        const generatedQrHash = "QR-" + crypto.randomUUID().substring(0, 8).toUpperCase();
        let finalSpecie = (document.getElementById("petSpecie").value === "Altro") 
            ? document.getElementById("petSpecieSpecific").value.trim() 
            : document.getElementById("petSpecie").value;

        const microchipValue = document.getElementById("petMicrochip").value.trim();
        
        if (microchipValue !== "") {
            const regexMicrochip = /^\d{15}$/;
            if (!regexMicrochip.test(microchipValue)) {
                showStatus("Errore: Il microchip deve contenere esattamente 15 numeri.", "error");
                enableSubmit();
                return;
            }
        }

        // ==========================================
        // FIX CRITICO: Trasforma la stringa vuota in NULL
        // ==========================================
        const finalMicrochip = microchipValue === "" ? null : microchipValue;

        const { error: petError } = await supabase.from("pets").insert({
            owner_id: user.id,
            nome: document.getElementById("petName").value.trim(),
            specie: finalSpecie,
            qr_code_hash: generatedQrHash,
            microchip: finalMicrochip // <-- Inserisce null invece di ""
        });
        
        if (petError) {
            await logError({ source: 'frontend_complete_profile', action: 'insert_pet', errorMessage: petError.message, errorCode: petError.code, context: { owner_id: user.id }});
            return handleSpecificError(petError.message);
        }

    } else if (selectedRoleName === "veterinario") {
        // 1. Salva i dati burocratici nella tabella veterinarians
        const { error: vetError } = await supabase.from("veterinarians").upsert({
            user_id: user.id,
            numero_ordine: document.getElementById("vetOrderNumber").value.trim(),
            is_available_now: false
        });

        if (vetError) {
            await logError({ 
                source: 'frontend_complete_profile', 
                action: 'upsert_veterinarian', 
                errorMessage: vetError.message, 
                errorCode: vetError.code, 
                context: { user_id: user.id }
            });
            return handleSpecificError(vetError.message);
        }

        // 2. Prendi l'indirizzo inserito nel form
        const clinicAddress = document.getElementById("vetClinicAddress").value.trim();
        const userCity = document.getElementById("city").value.trim() || "Milano";

        // 3. Salva SOLO il luogo fisico in provider_locations
        const { error: locError } = await supabase.from("provider_locations").insert({
            provider_id: user.id,
            nome_struttura: "Studio Principale",
            indirizzo: clinicAddress,
            citta: userCity,
            latitudine: 45.4642, // Coordinate base (saranno sovrascritte se usi Google Maps API)
            longitudine: 9.1900,
            is_principale: true
            // NOTA: Non passiamo gli orari. Il DB inserirà il default '{}' in automatico.
        });

        if (locError) {
            await logError({ 
                source: 'frontend_complete_profile', 
                action: 'insert_initial_vet_location', 
                errorMessage: locError.message, 
                errorCode: locError.code, 
                context: { user_id: user.id, address: clinicAddress }
            });
            return handleSpecificError("Errore salvataggio sede clinica: " + locError.message); 
        } 
    } else if (selectedRoleName === "sponsor") {
        const { error: sponsorError } = await supabase.from("sponsors").upsert({
            user_id: user.id,
            nome_azienda: document.getElementById("sponsorCompanyName").value.trim(),
            partita_iva: document.getElementById("sponsorVat").value.trim()
        });
        if (sponsorError) {
            await logError({ source: 'frontend_complete_profile', action: 'upsert_sponsor', errorMessage: sponsorError.message, errorCode: sponsorError.code, context: { user_id: user.id }});
            return handleSpecificError(sponsorError.message);
        }
    }

    // STEP 4: Redirect Dinamico
    showStatus("Profilo completato con successo! Reindirizzamento in corso...", "success");
    
    setTimeout(() => {
        if (selectedRoleName === "proprietario") {
            window.location.href = "pages/proprietario/dashboard-proprietario.html";
        } else if (selectedRoleName === "veterinario") {
            window.location.href = "pages/veterinario/dashboard-veterinario.html";
        } else if (selectedRoleName === "altro professionista") {
            window.location.href = "pages/professionista/dashboard-professionista.html";
        } else if (selectedRoleName === "sponsor") {
            window.location.href = "pages/sponsor/dashboard-sponsor.html";
        } else {
            window.location.href = "index.html";
        }
    }, 2000);
});

// Funzioni di utilità
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

function hideStatus() { 
    statusMessage.hidden = true; 
}

// Avvio
initializePage();