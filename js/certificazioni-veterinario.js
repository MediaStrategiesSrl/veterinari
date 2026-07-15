// 1. IMPORT CENTRALIZZATI
// ==========================================
// Assicurati che i percorsi puntino alla cartella corretta (es. ../utils/)
import { supabase } from '../utils/supabaseClient.js';
import { logError } from '../utils/logger.js';

let currentUser = null;
let isEditing = false; // Controlla lo stato Lettura/Scrittura

// Elementi DOM Principali
const form = document.getElementById("certificationsForm");
const btnModificaSalva = document.getElementById("btnModificaSalva");
const formMessage = document.getElementById("formMessage");

// Elementi Dati Personali
const vetNomeCognome = document.getElementById("vetNomeCognome");
const vetEmail = document.getElementById("vetEmail");
const vetDataNascita = document.getElementById("vetDataNascita");
const vetNumeroOrdine = document.getElementById("vetNumeroOrdine");

// Elementi File
const avatarUpload = document.getElementById("avatarUpload");
const ciUpload = document.getElementById("ciUpload");
const tesseraUpload = document.getElementById("tesseraUpload");

// ==========================================
// 1. HELPER PER L'UI DEGLI UPLOAD
// ==========================================
function setupFileInput(inputId, nameId, subtextId) {
    const input = document.getElementById(inputId);
    const nameDisplay = document.getElementById(nameId);
    const subtextDisplay = document.getElementById(subtextId);
    const card = input.closest('.upload-card');

    input.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (file) {
            nameDisplay.textContent = file.name;
            nameDisplay.style.color = "#059669"; // Verde successo
            subtextDisplay.textContent = "Pronto per l'invio";
            card.classList.add("file-selected");
        } else {
            card.classList.remove("file-selected");
        }
    });
}

// Inizializza i 3 input file
setupFileInput("avatarUpload", "avatarFileName", "avatarSubtext");
setupFileInput("ciUpload", "ciFileName", "ciSubtext");
setupFileInput("tesseraUpload", "tesseraFileName", "tesseraSubtext");

// ==========================================
// 2. HELPER UPLOAD STORAGE
// ==========================================
async function uploadFileToStorage(file, bucketName, folderPath) {
    if (!file) return null;
    
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `${folderPath}/${fileName}`;

    const { error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(filePath, file, { upsert: true });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
        .from(bucketName)
        .getPublicUrl(filePath);

    return publicUrl;
}

// ==========================================
// 3. INIZIALIZZAZIONE E CARICAMENTO DATI
// ==========================================
async function initPage() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        window.location.href = "../../index.html";
        return;
    }
    currentUser = user;

    try {
        // A. Carica Email
        vetEmail.value = user.email;

        // B. Carica Dati Profilo (profiles)
        const { data: profile } = await supabase
            .from('profiles')
            .select('nome, cognome, data_nascita')
            .eq('id', user.id)
            .single();

        if (profile) {
            vetNomeCognome.value = `${profile.nome || ''} ${profile.cognome || ''}`.trim();
            if (profile.data_nascita) vetDataNascita.value = profile.data_nascita;
        }

        // C. Carica Dati Medico (veterinarians)
        const { data: vetData } = await supabase
            .from('veterinarians')
            .select('numero_ordine')
            .eq('user_id', user.id)
            .maybeSingle();

        if (vetData && vetData.numero_ordine) {
            vetNumeroOrdine.value = vetData.numero_ordine;
        }

        // Blocca tutto all'avvio
        disabilitaCampi(true);

    } catch (error) {
        console.error("Errore caricamento dati iniziali:", error);
        
        // --- INIZIO AGGIUNTA LOG ---
        await logError({
            source: 'frontend_profilo_vet',
            action: 'init_page_load',
            errorMessage: error.message || "Fallimento durante il caricamento dei dati utente o profilo",
            errorCode: error.code || 'INIT_LOAD_ERROR',
            stackTrace: error.stack,
            context: {
                user_id: currentUser ? currentUser.id : 'sconosciuto',
                attempted_fetch: ['profiles', 'veterinarians']
            }
        });
        // --- FINE AGGIUNTA LOG ---
    }
}

// Gestione blocco/sblocco interfaccia
function disabilitaCampi(disabilita) {
    vetNomeCognome.disabled = disabilita;
    vetEmail.disabled = disabilita;
    vetDataNascita.disabled = disabilita;
    vetNumeroOrdine.disabled = disabilita;
    avatarUpload.disabled = disabilita;
    ciUpload.disabled = disabilita;
    tesseraUpload.disabled = disabilita;
    
    if (disabilita) {
        btnModificaSalva.innerHTML = '<i class="fa-solid fa-pen"></i> Modifica Profilo';
        btnModificaSalva.style.backgroundColor = "transparent";
        btnModificaSalva.style.color = "#F58220";
        btnModificaSalva.style.border = "2px solid #F58220";
    } else {
        btnModificaSalva.innerHTML = '<i class="fa-solid fa-check"></i> Salva Documenti';
        btnModificaSalva.style.backgroundColor = "#F58220";
        btnModificaSalva.style.color = "white";
    }
}

// ==========================================
// 4. SALVATAGGIO (TOGGLE MODIFICA -> SALVA)
// ==========================================
form.addEventListener("submit", async (e) => {
    e.preventDefault();

    // SE IN LETTURA: SBLOCCA I CAMPI
    if (!isEditing) {
        isEditing = true;
        disabilitaCampi(false);
        vetNomeCognome.focus();
        return;
    }

    // SE IN SCRITTURA: SALVA I DATI
    btnModificaSalva.disabled = true;
    btnModificaSalva.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvataggio in corso...';
    formMessage.textContent = "";

    try {
        const avatarFile = avatarUpload.files[0];
        const ciFile = ciUpload.files[0];
        const tesseraFile = tesseraUpload.files[0];

        // 1. Carica le immagini (se selezionate)
        let newAvatarUrl = null;
        let newCiUrl = null;
        let newTesseraUrl = null;

        if (avatarFile) {
            btnModificaSalva.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Upload Foto...';
            newAvatarUrl = await uploadFileToStorage(avatarFile, 'storage_veterinari', 'avatar_vet');
        }
        if (ciFile) {
            btnModificaSalva.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Upload Documento...';
            newCiUrl = await uploadFileToStorage(ciFile, 'storage_veterinari', 'certificazioni');
        }
        if (tesseraFile) {
            btnModificaSalva.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Upload Tessera...';
            newTesseraUrl = await uploadFileToStorage(tesseraFile, 'storage_veterinari', 'certificazioni');
        }

        btnModificaSalva.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Aggiornamento Database...';

        // 2. Dividi il Nome dal Cognome
        const [nuovoNome, ...restoCognome] = vetNomeCognome.value.trim().split(' ');
        
        // 3. Update PROFILES (Nome, Nascita, Avatar)
        const profileUpdates = {
            nome: nuovoNome || null,
            cognome: restoCognome.join(' ') || null,
            data_nascita: vetDataNascita.value || null
        };
        if (newAvatarUrl) profileUpdates.avatar_url = newAvatarUrl;

        const { error: profileError } = await supabase
            .from('profiles')
            .update(profileUpdates)
            .eq('id', currentUser.id);
        if (profileError) throw profileError;

        // 4. Update VETERINARIANS (Ordine, Documenti)
        const vetUpdates = {
            numero_ordine: vetNumeroOrdine.value.trim() || null
        };
        if (newCiUrl) vetUpdates.documento_identita_url = newCiUrl;
        if (newTesseraUrl) vetUpdates.tessera_ordine_url = newTesseraUrl;

        const { error: vetError } = await supabase
            .from('veterinarians')
            .update(vetUpdates)
            .eq('user_id', currentUser.id); // Ricorda: la FK è user_id, non id
        if (vetError) throw vetError;

        // 5. Update EMAIL (Se modificata)
        if (vetEmail.value !== currentUser.email) {
            const { error: emailError } = await supabase.auth.updateUser({ email: vetEmail.value });
            if (emailError) throw emailError;
            formMessage.textContent = "Dati salvati! Controlla la nuova email per confermare l'indirizzo.";
        } else {
            formMessage.textContent = "Profilo e documenti salvati con successo!";
        }

        formMessage.style.color = "#059669";
        
        // Ritorna alla modalità lettura e pulisci i file input
        isEditing = false;
        disabilitaCampi(true);
        avatarUpload.value = "";
        ciUpload.value = "";
        tesseraUpload.value = "";

        // Se preferisci reindirizzare automaticamente, decommenta questa riga:
        // setTimeout(() => { window.location.href = "profilo-veterinario.html"; }, 1500);

    } catch (error) {
        console.error("Errore di salvataggio:", error);
        
        // --- INIZIO AGGIUNTA LOG ---
        await logError({
            source: 'frontend_profilo_vet',
            action: 'save_profile_data',
            errorMessage: error.message || "Eccezione sollevata durante l'aggiornamento dei dati o l'upload storage",
            errorCode: error.code || 'PROFILE_SAVE_ERROR',
            stackTrace: error.stack,
            context: {
                user_id: currentUser ? currentUser.id : 'sconosciuto',
                attempted_email_update: vetEmail.value !== (currentUser ? currentUser.email : ''),
                uploaded_avatar: !!avatarUpload.files[0],
                uploaded_ci: !!ciUpload.files[0],
                uploaded_tessera: !!tesseraUpload.files[0]
            }
        });
        // --- FINE AGGIUNTA LOG ---

        formMessage.textContent = "Errore durante il salvataggio dei dati.";
        formMessage.style.color = "#DC2626";
        disabilitaCampi(false); // Lascia sbloccato per permettere di riprovare
    } finally {
        btnModificaSalva.disabled = false;
    }
});

initPage();