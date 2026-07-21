// ==========================================
// 1. IMPORT CENTRALIZZATI
// ==========================================
import { supabase } from '../utils/supabaseClient.js';
import { logError } from '../utils/logger.js';

// Elementi DOM (Base)
const form = document.getElementById("profileForm");
const nomeCognomeInput = document.getElementById("nomeCognome");
const emailInput = document.getElementById("email");
const dataNascitaInput = document.getElementById("dataNascita");
const submitBtn = document.getElementById("submitBtn");
const formMessage = document.getElementById("formMessage");
const deleteRoleBtn = document.getElementById("deleteRoleBtn"); // Bottone eliminazione ruolo

// Elementi DOM (Upload Documento)
const documentoFile = document.getElementById("documentoFile");
const fileLabelText = document.getElementById("fileLabelText");
const docStatus = document.getElementById("docStatus");

// Elementi DOM (Upload Avatar Professionale)
const avatarUpload = document.getElementById("avatarUpload");
const avatarLabelText = document.getElementById("avatarLabelText");
const avatarStatus = document.getElementById("avatarStatus");

let currentUser = null;
let isEditing = false; 

// ==========================================
// 2. GESTIONE VISIVA DEGLI UPLOAD
// ==========================================
if (documentoFile) {
    documentoFile.addEventListener("change", (e) => {
        if (e.target.files.length > 0 && fileLabelText) {
            fileLabelText.textContent = e.target.files[0].name;
            fileLabelText.style.color = "#1E293B";
            fileLabelText.style.fontWeight = "bold";
        }
    });
}

if (avatarUpload) {
    avatarUpload.addEventListener("change", (e) => {
        if (e.target.files.length > 0 && avatarLabelText) {
            avatarLabelText.textContent = e.target.files[0].name;
            avatarLabelText.style.color = "#0284C7"; // Tonalità azzurra coerente col mondo Pro
            avatarLabelText.style.fontWeight = "bold";
        }
    });
}

// ==========================================
// 3. HELPER UPLOAD STORAGE
// ==========================================
async function uploadFileToStorage(file, bucketName, folderPath) {
    if (!file) return null;
    
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `${folderPath}/${fileName}`;

    const { error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(filePath, file, { upsert: true });

    if (uploadError) throw Object.assign(new Error(uploadError.message), { code: uploadError.code || 'STORAGE_UPLOAD_ERROR' });
    
    return filePath;
}

// ==========================================
// 4. CARICAMENTO DATI (PROFILES + VETERINARIANS)
// ==========================================
async function loadUserData() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        window.location.href = "../../index.html";
        return;
    }
    currentUser = user;

    try {
        emailInput.value = user.email;

        // Estrazione dati anagrafici dalla tabella profiles e foto professionale da veterinarians
        const [{ data: profile, error: profileError }, { data: vetData, error: vetError }] = await Promise.all([
            supabase.from('profiles').select('nome, cognome, data_nascita, documento_url').eq('id', user.id).single(),
            supabase.from('veterinarians').select('foto_professionale_url').eq('user_id', user.id).maybeSingle()
        ]);

        if (profileError && profileError.code !== 'PGRST116') {
            throw Object.assign(new Error(profileError.message), { code: profileError.code || 'DB_PROFILE_FETCH_ERROR' });
        }

        if (profile) {
            const nome = profile.nome || "";
            const cognome = profile.cognome || "";
            nomeCognomeInput.value = `${nome} ${cognome}`.trim();

            if (profile.data_nascita) {
                dataNascitaInput.value = profile.data_nascita;
            }

            if (profile.documento_url && docStatus && fileLabelText) {
                docStatus.classList.remove("hidden");
                fileLabelText.textContent = "Sostituisci documento esistente";
            }
        }

        if (vetData && vetData.foto_professionale_url && avatarStatus && avatarLabelText) {
            avatarStatus.classList.remove("hidden");
            avatarLabelText.textContent = "Sostituisci foto professionale esistente";
        }

        disabilitaCampi(true);

    } catch (error) {
        console.error("Errore recupero dati professionista:", error);
        
        await logError({
            source: 'frontend_dati_personali_pro',
            action: 'load_user_profile',
            errorMessage: error.message || "Errore durante il recupero dei dati del professionista",
            errorCode: error.code || 'DB_PROFILE_FETCH_ERROR',
            stackTrace: error.stack,
            context: { user_id: currentUser ? currentUser.id : 'sconosciuto' }
        });

        showMessage("Impossibile caricare i dati del profilo.", "#DC2626");
    }
}

function disabilitaCampi(disabilita) {
    nomeCognomeInput.disabled = disabilita;
    emailInput.disabled = disabilita;
    dataNascitaInput.disabled = disabilita;
    if (documentoFile) documentoFile.disabled = disabilita;
    if (avatarUpload) avatarUpload.disabled = disabilita;
    
    if (disabilita) {
        submitBtn.innerHTML = '<i class="fa-solid fa-pen"></i> Modifica Dati';
        submitBtn.style.backgroundColor = "transparent";
        submitBtn.style.color = "#0284C7"; // Colore accento associato al profilo professionista
        submitBtn.style.border = "2px solid #0284C7";
    } else {
        submitBtn.innerHTML = '<i class="fa-solid fa-check"></i> Salva Modifiche';
        submitBtn.style.backgroundColor = "#0284C7";
        submitBtn.style.color = "white";
    }
}

// ==========================================
// 5. SALVATAGGIO (TOGGLE MODIFICA -> SALVA)
// ==========================================
form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!isEditing) {
        isEditing = true;
        disabilitaCampi(false);
        nomeCognomeInput.focus(); 
        return; 
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvataggio...';
    formMessage.innerHTML = "";

    try {
        let docPath = null;
        let avatarPath = null;
        
        const docFile = documentoFile ? documentoFile.files[0] : null;
        const avFile = avatarUpload ? avatarUpload.files[0] : null;

        // 1. UPLOAD FOTO PROFESSIONALE
        if (avFile) {
            submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Upload foto professionale...';
            avatarPath = await uploadFileToStorage(avFile, 'storage_veterinari', `avatar_pro/${currentUser.id}`);
        }

        // 2. UPLOAD DOCUMENTO PERSONALE
        if (docFile) {
            submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Upload documento...';
            docPath = await uploadFileToStorage(docFile, 'storage_veterinari', `user_docs/${currentUser.id}`);
        }

        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Aggiornamento profilo...';

        const [nuovoNome, ...restoCognome] = nomeCognomeInput.value.trim().split(' ');
        const nuovoCognome = restoCognome.join(' '); 

        // 3. PREPARA DATI E AGGIORNA PROFILES
        const profileUpdateData = {
            nome: nuovoNome || null,
            cognome: nuovoCognome || null,
            data_nascita: dataNascitaInput.value || null
        };
        
        if (docPath) profileUpdateData.documento_url = docPath;

        const { error: updateError } = await supabase
            .from('profiles')
            .update(profileUpdateData)
            .eq('id', currentUser.id);

        if (updateError) throw Object.assign(new Error(updateError.message), { code: updateError.code || 'DB_PROFILE_UPDATE_ERROR' });

        // 4. AGGIORNA FOTO PROFESSIONALE NELLA TABELLA VETERINARIANS
        if (avatarPath) {
            const { error: vetUpdateError } = await supabase
                .from('veterinarians')
                .update({ foto_professionale_url: avatarPath })
                .eq('user_id', currentUser.id);

            if (vetUpdateError) throw Object.assign(new Error(vetUpdateError.message), { code: vetUpdateError.code || 'DB_VET_UPDATE_ERROR' });
        }

        // 5. AGGIORNA EMAIL
        if (emailInput.value !== currentUser.email) {
            const { error: emailError } = await supabase.auth.updateUser({
                email: emailInput.value
            });
            if (emailError) throw Object.assign(new Error(emailError.message), { code: emailError.code || 'AUTH_EMAIL_UPDATE_ERROR' });
            
            showMessage("Dati salvati! Controlla la tua nuova email per confermare l'indirizzo.", "#059669");
        } else {
            showMessage("Profilo professionale salvato con successo!", "#059669");
        }
        
        // 6. RESET INTERFACCIA
        if (docPath && docStatus && fileLabelText) {
            docStatus.classList.remove("hidden");
            fileLabelText.textContent = "Sostituisci documento esistente";
            if (documentoFile) documentoFile.value = ""; 
        }
        if (avatarPath && avatarStatus && avatarLabelText) {
            avatarStatus.classList.remove("hidden");
            avatarLabelText.textContent = "Sostituisci foto professionale esistente";
            if (avatarUpload) avatarUpload.value = "";
        }

        isEditing = false;
        disabilitaCampi(true);

    } catch (error) {
        console.error("Errore salvataggio professionista:", error);
        
        await logError({
            source: 'frontend_dati_personali_pro',
            action: 'update_user_data',
            errorMessage: error.message || "Eccezione durante l'aggiornamento del profilo professionista",
            errorCode: error.code || 'PROFILE_SAVE_ERROR',
            stackTrace: error.stack,
            context: {
                user_id: currentUser ? currentUser.id : 'sconosciuto',
                attempted_email_update: emailInput.value !== (currentUser ? currentUser.email : ''),
                uploaded_document: !!(documentoFile && documentoFile.files[0]),
                uploaded_avatar: !!(avatarUpload && avatarUpload.files[0])
            }
        });

        showMessage("Si è verificato un errore durante il salvataggio.", "#DC2626");
        disabilitaCampi(false);
    } finally {
        submitBtn.disabled = false;
    }
});

function showMessage(text, color) {
    if (formMessage) {
        formMessage.textContent = text;
        formMessage.style.color = color;
        setTimeout(() => { formMessage.textContent = ""; }, 6000);
    }
}

// ==========================================
// 6. ELIMINAZIONE RUOLO (PROFESSIONISTA)
// ==========================================
if (deleteRoleBtn) {
    deleteRoleBtn.addEventListener('click', async () => {
        const confermato = confirm("Attenzione: Sei sicuro di voler eliminare il tuo ruolo di Professionista? Perderai la tua scheda professionale e tutte le informazioni correlate. Il tuo account utente principale rimarrà intatto.");
        
        if (confermato) {
            deleteRoleBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Pulizia dati in corso...';
            deleteRoleBtn.style.pointerEvents = 'none';

            try {
                // A. Trova l'ID del ruolo "Veterinario" o "Professionista"
                const { data: roleData, error: roleError } = await supabase
                    .from('roles')
                    .select('id')
                    .or('nome.ilike.%veterinario%,nome.ilike.%professionista%')
                    .single();
                    
                if (roleError) throw Object.assign(new Error(roleError.message), { code: roleError.code || 'DB_FETCH_ROLE_ERROR' });

                // B. Elimina i dati del profilo professionale dalla tabella veterinarians
                const { error: vetError } = await supabase
                    .from('veterinarians')
                    .delete()
                    .eq('user_id', currentUser.id);

                if (vetError) throw Object.assign(new Error(vetError.message), { code: vetError.code || 'DB_DELETE_VET_ERROR' });

                // C. Sgancia il ruolo dalla tabella user_roles
                const { error: unlinkError } = await supabase
                    .from('user_roles')
                    .delete()
                    .eq('user_id', currentUser.id)
                    .eq('role_id', roleData.id);

                if (unlinkError) throw Object.assign(new Error(unlinkError.message), { code: unlinkError.code || 'DB_DELETE_USER_ROLE_ERROR' });

                alert("Ruolo Professionista e scheda associata rimossi con successo!");
                window.location.href = "../../ruoli.html";

            } catch (error) {
                console.error("Errore durante l'eliminazione del ruolo professionista:", error);
                
                await logError({
                    source: 'dati_personali_pro',
                    action: 'delete_pro_role',
                    errorMessage: error.message || "Fallimento durante l'eliminazione del ruolo professionista",
                    errorCode: error.code || 'UNKNOWN_DB_ERROR',
                    context: { userId: currentUser?.id }
                });

                alert("Si è verificato un errore di sistema critico. L'operazione è stata interrotta e i tecnici sono stati avvisati.");
                
                deleteRoleBtn.innerHTML = 'Elimina Ruolo Professionista';
                deleteRoleBtn.style.pointerEvents = 'auto';
            }
        }
    });
}

// Avvio caricamento dati
loadUserData();