// ==========================================
// 1. IMPORT CENTRALIZZATI E SETUP
// ==========================================
import { supabase } from '../utils/supabaseClient.js';
import { logError } from '../utils/logger.js';

let currentUser = null;
let isEditing = false; 

// Elementi DOM Principali
const form = document.getElementById("certificationsForm");
const btnModificaSalva = document.getElementById("btnModificaSalva");
const formMessage = document.getElementById("formMessage");
const deleteRoleBtn = document.getElementById("deleteRoleBtn"); // Tasto eliminazione

// Elementi Dati Personali
const vetNomeCognome = document.getElementById("vetNomeCognome");
const vetEmail = document.getElementById("vetEmail");
const vetDataNascita = document.getElementById("vetDataNascita");
const vetNumeroOrdine = document.getElementById("vetNumeroOrdine");

// Elementi File
const avatarUpload = document.getElementById("avatarUpload");
const ciUpload = document.getElementById("ciUpload");
const tesseraUpload = document.getElementById("tesseraUpload");
const firmaUpload = document.getElementById("firmaUpload"); // FIX: nuovo campo firma (per le prescrizioni)

// ==========================================
// 2. HELPER PER L'UI DEGLI UPLOAD
// ==========================================
function setupFileInput(inputId, nameId, subtextId, badgeId) {
    const input = document.getElementById(inputId);
    const nameDisplay = document.getElementById(nameId);
    const subtextDisplay = document.getElementById(subtextId);
    const badge = badgeId ? document.getElementById(badgeId) : null;

    if (!input) return;

    input.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (file) {
            nameDisplay.textContent = file.name;
            nameDisplay.style.color = "#F58220";
            subtextDisplay.textContent = "Pronto per l'invio";
            if (badge) badge.classList.add("hidden");
        }
    });
}

setupFileInput("avatarUpload", "avatarFileName", "avatarSubtext", "avatarStatusBadge");
setupFileInput("ciUpload", "ciFileName", "ciSubtext", "ciStatusBadge");
setupFileInput("tesseraUpload", "tesseraFileName", "tesseraSubtext", "tesseraStatusBadge");
setupFileInput("firmaUpload", "firmaFileName", "firmaSubtext", "firmaStatusBadge");

function showDocBadge(prefix, fileUrl, replaceLabel) {
    if (!fileUrl) return;
    const badge = document.getElementById(`${prefix}StatusBadge`);
    const fileName = document.getElementById(`${prefix}FileName`);
    if (badge) badge.classList.remove("hidden");
    if (fileName) fileName.textContent = replaceLabel;
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
        vetEmail.value = user.email;

        const { data: profile } = await supabase
            .from('profiles')
            .select('nome, cognome, data_nascita')
            .eq('id', user.id)
            .single();

        if (profile) {
            const nome = profile.nome || "";
            const cognome = profile.cognome || "";
            vetNomeCognome.value = `${nome} ${cognome}`.trim();
            if (profile.data_nascita) vetDataNascita.value = profile.data_nascita;
        }

        const { data: vetData } = await supabase
            .from('veterinarians')
            .select('numero_ordine, foto_professionale_url, documento_identita_url, tessera_ordine_url, firma_url')
            .eq('user_id', user.id)
            .maybeSingle();

       if (vetData) {
    if (vetData.numero_ordine) {
        vetNumeroOrdine.value = vetData.numero_ordine;
    }
    // Badge verde "presente a sistema" per ogni file già caricato
    showDocBadge("avatar", vetData.foto_professionale_url, "Sostituisci foto");
    showDocBadge("ci", vetData.documento_identita_url, "Sostituisci documento");
    showDocBadge("tessera", vetData.tessera_ordine_url, "Sostituisci tessera");
    showDocBadge("firma", vetData.firma_url, "Sostituisci firma");
}
        disabilitaCampi(true);

    } catch (error) {
        console.error("Errore caricamento dati iniziali:", error);
    }
}

function disabilitaCampi(disabilita) {
    vetNomeCognome.disabled = disabilita;
    vetEmail.disabled = disabilita;
    vetDataNascita.disabled = disabilita;
    vetNumeroOrdine.disabled = disabilita;
    avatarUpload.disabled = disabilita;
    ciUpload.disabled = disabilita;
    tesseraUpload.disabled = disabilita;
    if (firmaUpload) firmaUpload.disabled = disabilita;

    // NUOVO: blocco visivo delle card upload finché non si preme "Modifica Profilo"
    toggleUploadCardLock("avatarUploadCard", disabilita);
    toggleUploadCardLock("ciUploadCard", disabilita);
    toggleUploadCardLock("tesseraUploadCard", disabilita);
    toggleUploadCardLock("firmaUploadCard", disabilita);

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

function toggleUploadCardLock(cardId, locked) {
    const card = document.getElementById(cardId);
    if (card) card.classList.toggle("locked", locked);
}

// ==========================================
// 4. SALVATAGGIO DATI E UPLOAD FILE
// ==========================================
form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!isEditing) {
        isEditing = true;
        disabilitaCampi(false);
        vetNomeCognome.focus();
        return;
    }

    btnModificaSalva.disabled = true;
    btnModificaSalva.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvataggio in corso...';
    formMessage.textContent = "";

    try {
        let newAvatarPath = null;
        let newCiPath = null;
        let newTesseraPath = null;
        let newFirmaPath = null; // FIX

        const avatarFile = avatarUpload.files[0];
        const ciFile = ciUpload.files[0];
        const tesseraFile = tesseraUpload.files[0];
        const firmaFile = firmaUpload ? firmaUpload.files[0] : null; // FIX

        // --- UPLOAD FOTO PROFESSIONALE ---
        if (avatarFile) {
            btnModificaSalva.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Upload Foto...';
            const fileExt = avatarFile.name.split('.').pop();
            newAvatarPath = `avatar_vet/${currentUser.id}/avatar_${Date.now()}.${fileExt}`;
            const { error: uploadError } = await supabase.storage.from('storage_veterinari').upload(newAvatarPath, avatarFile, { upsert: true });
            if (uploadError) throw uploadError;
        }

        // --- UPLOAD CARTA D'IDENTITÀ ---
        if (ciFile) {
            btnModificaSalva.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Upload CI...';
            const fileExt = ciFile.name.split('.').pop();
            newCiPath = `user_docs/${currentUser.id}/doc_identita_${Date.now()}.${fileExt}`;
            const { error: uploadError } = await supabase.storage.from('storage_veterinari').upload(newCiPath, ciFile, { upsert: true });
            if (uploadError) throw uploadError;
        }

        // --- UPLOAD TESSERA ORDINE ---
        if (tesseraFile) {
            btnModificaSalva.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Upload Tessera...';
            const fileExt = tesseraFile.name.split('.').pop();
            newTesseraPath = `user_docs/${currentUser.id}/tessera_ordine_${Date.now()}.${fileExt}`;
            const { error: uploadError } = await supabase.storage.from('storage_veterinari').upload(newTesseraPath, tesseraFile, { upsert: true });
            if (uploadError) throw uploadError;
        }

        // --- UPLOAD FIRMA (usata nelle prescrizioni) --- FIX: nuovo blocco
        if (firmaFile) {
            btnModificaSalva.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Upload Firma...';
            const fileExt = firmaFile.name.split('.').pop();
            newFirmaPath = `firme/${currentUser.id}/firma_${Date.now()}.${fileExt}`;
            const { error: uploadError } = await supabase.storage.from('storage_veterinari').upload(newFirmaPath, firmaFile, { upsert: true });
            if (uploadError) throw uploadError;
        }

        btnModificaSalva.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Aggiornamento DB...';

        const [nuovoNome, ...restoCognome] = vetNomeCognome.value.trim().split(' ');
        const nuovoCognome = restoCognome.join(' ');
        
        // 1. UPDATE TABELLA PROFILES
        const profileUpdates = {
            nome: nuovoNome || null,
            cognome: nuovoCognome || null,
            data_nascita: vetDataNascita.value || null
        };
        const { error: profileError } = await supabase.from('profiles').update(profileUpdates).eq('id', currentUser.id);
        if (profileError) throw profileError;

        // 2. UPDATE TABELLA VETERINARIANS
        const vetUpdates = {
            numero_ordine: vetNumeroOrdine.value.trim() || null
        };
        
        if (newAvatarPath) vetUpdates.foto_professionale_url = newAvatarPath;
        if (newCiPath) vetUpdates.documento_identita_url = newCiPath;
        if (newTesseraPath) vetUpdates.tessera_ordine_url = newTesseraPath;
        if (newFirmaPath) vetUpdates.firma_url = newFirmaPath; // FIX

        const { error: vetError } = await supabase.from('veterinarians').update(vetUpdates).eq('user_id', currentUser.id); 
        if (vetError) throw vetError;

        // 3. UPDATE EMAIL
        if (vetEmail.value !== currentUser.email) {
            await supabase.auth.updateUser({ email: vetEmail.value });
            formMessage.textContent = "Dati salvati! Controlla la nuova email.";
        } else {
            formMessage.textContent = "Profilo e documenti salvati con successo!";
        }

        formMessage.style.color = "#059669";
        
        isEditing = false;
        disabilitaCampi(true);
        avatarUpload.value = "";
        ciUpload.value = "";
        tesseraUpload.value = "";
        if (firmaUpload) firmaUpload.value = ""; // FIX

    } catch (error) {
        console.error("Errore di salvataggio:", error);
        formMessage.textContent = "Errore durante il salvataggio dei dati.";
        formMessage.style.color = "#DC2626";
        disabilitaCampi(false); 
    } finally {
        btnModificaSalva.disabled = false;
    }
});

// ==========================================
// 5. ELIMINAZIONE RUOLO (VETERINARIO)
// ==========================================
if (deleteRoleBtn) {
    deleteRoleBtn.addEventListener('click', async () => {
        const confermato = confirm("Attenzione: Sei sicuro di voler eliminare il tuo ruolo di Veterinario? Perderai l'accesso all'agenda, ai tuoi appuntamenti e alle cartelle cliniche dei pazienti. Il tuo account principale rimarrà intatto.");
        
        if (confermato) {
            deleteRoleBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Pulizia dati in corso...';
            deleteRoleBtn.style.pointerEvents = 'none';

            try {
                const { data: roleData, error: roleError } = await supabase
                    .from('roles')
                    .select('id')
                    .ilike('nome', '%veterinario%')
                    .single();
                    
                if (roleError) throw Object.assign(new Error(roleError.message), { code: roleError.code || 'DB_FETCH_ROLE_ERROR' });

                await supabase.from('appointments').delete().eq('provider_id', currentUser.id);
                await supabase.from('urgent_consultations').delete().eq('vet_id', currentUser.id);
                await supabase.from('medical_records').delete().eq('vet_id', currentUser.id);
                await supabase.from('veterinarian_patients').delete().eq('veterinarian_id', currentUser.id);
                await supabase.from('pet_access_requests').delete().eq('veterinarian_id', currentUser.id);

                const { error: unlinkError } = await supabase
                    .from('user_roles')
                    .delete()
                    .eq('user_id', currentUser.id)
                    .eq('role_id', roleData.id);
                if (unlinkError) throw Object.assign(new Error(unlinkError.message), { code: unlinkError.code || 'DB_DELETE_USER_ROLE_ERROR' });

                const { error: deleteVetError } = await supabase
                    .from('veterinarians')
                    .delete()
                    .eq('user_id', currentUser.id);
                if (deleteVetError) throw Object.assign(new Error(deleteVetError.message), { code: deleteVetError.code || 'DB_DELETE_VET_TABLE_ERROR' });

                alert("Ruolo Medico Veterinario rimosso con successo!");
                window.location.href = "../../ruoli.html";

            } catch (error) {
                console.error("Errore durante l'eliminazione del ruolo veterinario:", error);
                
                await logError({
                    source: 'certificazioni_veterinario',
                    action: 'delete_vet_role',
                    errorMessage: error.message || "Fallimento durante l'eliminazione a cascata del ruolo veterinario",
                    errorCode: error.code || 'UNKNOWN_DB_ERROR',
                    context: { userId: currentUser?.id }
                });

                alert("Si è verificato un errore di sistema critico. L'operazione è stata interrotta e i tecnici sono stati avvisati.");
                
                deleteRoleBtn.innerHTML = 'Elimina Ruolo Veterinario';
                deleteRoleBtn.style.pointerEvents = 'auto';
            }
        }
    });
}

initPage();