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

// ==========================================
// 2. HELPER PER L'UI DEGLI UPLOAD
// ==========================================
function setupFileInput(inputId, nameId, subtextId) {
    const input = document.getElementById(inputId);
    const nameDisplay = document.getElementById(nameId);
    const subtextDisplay = document.getElementById(subtextId);

    if(!input) return;

    input.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (file) {
            nameDisplay.textContent = file.name;
            nameDisplay.style.color = "#F58220"; 
            subtextDisplay.textContent = "Pronto per l'invio";
        }
    });
}

setupFileInput("avatarUpload", "avatarFileName", "avatarSubtext");
setupFileInput("ciUpload", "ciFileName", "ciSubtext");
setupFileInput("tesseraUpload", "tesseraFileName", "tesseraSubtext");

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
            .select('numero_ordine, foto_professionale_url, documento_identita_url, tessera_ordine_url')
            .eq('user_id', user.id)
            .maybeSingle();

        if (vetData) {
            if (vetData.numero_ordine) {
                vetNumeroOrdine.value = vetData.numero_ordine;
            }
            // Avviso visivo che i file sono già a sistema
            if (vetData.foto_professionale_url) document.getElementById("avatarSubtext").textContent = "Foto presente a sistema";
            if (vetData.documento_identita_url) document.getElementById("ciSubtext").textContent = "Documento presente a sistema";
            if (vetData.tessera_ordine_url) document.getElementById("tesseraSubtext").textContent = "Tessera presente a sistema";
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

        const avatarFile = avatarUpload.files[0];
        const ciFile = ciUpload.files[0];
        const tesseraFile = tesseraUpload.files[0];

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