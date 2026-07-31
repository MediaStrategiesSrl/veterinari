// ==========================================
// 1. IMPORT CENTRALIZZATI E SETUP
// ==========================================
import { supabase } from '../utils/supabaseClient.js';
import { logError } from '../utils/logger.js';

// Elementi DOM - Form e Input
const profileForm = document.getElementById('profileForm');
const nomeCognomeInput = document.getElementById('nomeCognome');
const emailInput = document.getElementById('email');
const dataNascitaInput = document.getElementById('dataNascita');
const formMessage = document.getElementById('formMessage');
const submitBtn = document.getElementById('submitBtn');

// Elementi DOM - Upload File e Container
const documentoFile = document.getElementById('documentoFile');
const docStatus = document.getElementById('docStatus');
const fileLabelText = document.getElementById('fileLabelText');
const uploadContainer = document.querySelector('.file-upload-label'); // Label che fa da bottone di upload

// Elementi DOM - Elimina Ruolo
const deleteRoleBtn = document.getElementById('deleteRoleBtn');

let currentUser = null;
let isEditing = false; // Stato iniziale: NON siamo in modalità modifica

// ==========================================
// 2. INIZIALIZZAZIONE E CARICAMENTO DATI
// ==========================================
async function init() {
    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            window.location.href = 'login.html';
            return;
        }
        currentUser = user;

        // All'avvio il form è bloccato (Sola Lettura)
        impostaStatoModifica(false);

        if (nomeCognomeInput) nomeCognomeInput.placeholder = "Caricamento in corso...";
        if (emailInput) emailInput.placeholder = "Caricamento in corso...";

        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('nome, cognome, email, data_nascita, documento_url')
            .eq('id', currentUser.id)
            .single();

        if (profileError) throw profileError;

        if (nomeCognomeInput) {
            nomeCognomeInput.value = `${profile.nome || ''} ${profile.cognome || ''}`.trim();
        }
        if (emailInput) {
            emailInput.value = profile.email || currentUser.email || '';
        }
        if (dataNascitaInput && profile.data_nascita) {
            dataNascitaInput.value = profile.data_nascita;
        }

        if (profile.documento_url && docStatus) {
            docStatus.classList.remove('hidden');
            fileLabelText.textContent = "Documento presente a sistema";
        }

    } catch (error) {
        console.error("Errore nel caricamento:", error);
        mostraMessaggio("Impossibile caricare i dati del profilo.", false);
        logError({ source: 'datipersonali_sponsor', action: 'init', errorMessage: error.message });
    }
}

// ==========================================
// 3. LOGICA DEL BOTTONE: MODIFICA -> SALVA
// ==========================================
if (profileForm) {
    profileForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        formMessage.classList.add('hidden');
        formMessage.textContent = '';
        
        // FASE 1: SE NON SIAMO IN MODIFICA, CLICCARE SBLOCCA IL FORM
        if (!isEditing) {
            isEditing = true;
            impostaStatoModifica(true); // Sblocca tutto
            
            // Cambia l'aspetto del bottone in stile "Salva" pieno
            submitBtn.innerHTML = '<i class="fa-solid fa-check"></i> Salva Modifiche';
            submitBtn.style.backgroundColor = '#F58220';
            submitBtn.style.color = '#ffffff';
            submitBtn.style.border = 'none';
            
            if (nomeCognomeInput) nomeCognomeInput.focus();
            return; 
        }

        // FASE 2: SIAMO IN MODIFICA, CLICCARE SALVA I DATI NEL DB
        const fullNome = nomeCognomeInput.value.trim();
        const dataNascita = dataNascitaInput.value;

        if (!fullNome) {
            mostraMessaggio("Il campo Nome e Cognome è obbligatorio.", false);
            return;
        }

        const partiNome = fullNome.split(' ');
        const nome = partiNome[0] || '';
        const cognome = partiNome.length > 1 ? partiNome.slice(1).join(' ') : '';

        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvataggio...';
        submitBtn.disabled = true;

        try {
            const { error: updateError } = await supabase
                .from('profiles')
                .update({ 
                    nome: nome, 
                    cognome: cognome,
                    data_nascita: dataNascita || null 
                })
                .eq('id', currentUser.id);

            if (updateError) throw updateError;

            mostraMessaggio("Dati aggiornati con successo!", true);
            
            // Torna allo stato di sola lettura
            isEditing = false;
            impostaStatoModifica(false);
            
            // Ripristina l'aspetto originale del bottone "Modifica Dati" (outlined)
            submitBtn.innerHTML = '<i class="fa-solid fa-pen"></i> Modifica Dati';
            submitBtn.style.backgroundColor = 'transparent';
            submitBtn.style.color = '#F58220';
            submitBtn.style.border = '1px solid #F58220';

        } catch (error) {
            console.error("Errore salvataggio:", error);
            mostraMessaggio("Errore nel salvataggio.", false);
            
            submitBtn.innerHTML = '<i class="fa-solid fa-check"></i> Salva Modifiche';
            impostaStatoModifica(true);
            
            logError({ source: 'datipersonali_sponsor', action: 'update_profile', errorMessage: error.message });
        } finally {
            submitBtn.disabled = false;
        }
    });
}

// ==========================================
// 4. GESTIONE UPLOAD FILE (BLOCCATO SE NON IN EDIT)
// ==========================================
if (documentoFile) {
    documentoFile.addEventListener('change', async (e) => {
        // Blocco di sicurezza ulteriore: se non si è in modifica, blocca l'upload
        if (!isEditing) {
            alert("Prima di caricare o modificare documenti, clicca su 'Modifica Dati'.");
            documentoFile.value = "";
            return;
        }

        const file = e.target.files[0];
        if (!file || !currentUser) return;

        const fileExt = file.name.split('.').pop();
        const filePath = `documenti/${currentUser.id}_${Date.now()}.${fileExt}`;

        fileLabelText.textContent = "Caricamento in corso...";

        try {
            const { error: uploadError } = await supabase.storage
                .from('storage_veterinari')
                .upload(filePath, file, { upsert: true });

            if (uploadError) throw uploadError;

            const { data: publicUrlData } = supabase.storage
                .from('storage_veterinari')
                .getPublicUrl(filePath);

            const { error: dbError } = await supabase
                .from('profiles')
                .update({ documento_url: publicUrlData.publicUrl })
                .eq('id', currentUser.id);

            if (dbError) throw dbError;

            docStatus.classList.remove('hidden');
            fileLabelText.textContent = "Documento caricato con successo!";
            
        } catch (error) {
            console.error("Errore upload documento:", error);
            alert("Errore durante il caricamento del documento.");
            fileLabelText.textContent = "Errore di caricamento. Riprova.";
            logError({ source: 'datipersonali_sponsor', action: 'upload_documento', errorMessage: error.message });
        }
    });
}

// Intercetta il click sulla label del file per bloccarla se non si è in modalità modifica
if (uploadContainer) {
    uploadContainer.addEventListener('click', (e) => {
        if (!isEditing) {
            e.preventDefault();
            alert("Clicca prima su 'Modifica Dati' in fondo alla pagina per abilitare il caricamento dei documenti.");
        }
    });
}

// ==========================================
// 5. AZIONE: ELIMINA RUOLO
// ==========================================
if (deleteRoleBtn) {
    deleteRoleBtn.addEventListener('click', async () => {
        const conferma = confirm("Stai per rimuovere il ruolo. Sei sicuro?");
        if (!conferma) return;

        deleteRoleBtn.textContent = "Elaborazione in corso...";
        deleteRoleBtn.style.opacity = "0.6";
        deleteRoleBtn.style.pointerEvents = "none";

        try {
            const { data: roleData, error: roleError } = await supabase
                .from('roles')
                .select('id')
                .eq('nome', 'sponsor')
                .single();

            if (roleError) throw roleError;

            const { error: deleteAssocError } = await supabase
                .from('user_roles')
                .delete()
                .eq('user_id', currentUser.id)
                .eq('role_id', roleData.id);

            if (deleteAssocError) throw deleteAssocError;

            await supabase.from('sponsors').delete().eq('user_id', currentUser.id);

            alert("Ruolo eliminato con successo.");
            window.location.href = '../../ruoli.html';

        } catch (error) {
            console.error("Errore eliminazione ruolo:", error);
            alert("Errore di sistema. Operazione annullata.");
            logError({ source: 'datipersonali_sponsor', action: 'delete_role', errorMessage: error.message });
            
            deleteRoleBtn.textContent = "Elimina Ruolo";
            deleteRoleBtn.style.opacity = "1";
            deleteRoleBtn.style.pointerEvents = "auto";
        }
    });
}

// ==========================================
// UTILITIES (GESTIONE STATO EDITING)
// ==========================================
function mostraMessaggio(testo, isSuccess) {
    if (!formMessage) return;
    formMessage.textContent = testo;
    formMessage.classList.remove('hidden');
    formMessage.style.color = isSuccess ? '#065F46' : '#991B1B';
    
    if (isSuccess) {
        setTimeout(() => {
            formMessage.classList.add('hidden');
        }, 4000);
    }
}

function impostaStatoModifica(abilita) {
    // Se 'abilita' è true, i campi diventano editabili. Se è false, tornano readonly.
    const disabilita = !abilita;

    if (nomeCognomeInput) {
        nomeCognomeInput.disabled = disabilita;
        if (disabilita) nomeCognomeInput.classList.add('readonly-input');
        else nomeCognomeInput.classList.remove('readonly-input');
    }
    
    if (dataNascitaInput) {
        dataNascitaInput.disabled = disabilita;
        if (disabilita) dataNascitaInput.classList.add('readonly-input');
        else dataNascitaInput.classList.remove('readonly-input');
    }
    
    if (emailInput) {
        emailInput.disabled = true; // L'email non si modifica mai direttamente qui
        emailInput.classList.add('readonly-input');
    }

    // Gestione visiva dell'area di upload in base allo stato
    if (uploadContainer) {
        if (disabilita) {
            uploadContainer.style.opacity = "0.6";
            uploadContainer.style.cursor = "not-allowed";
        } else {
            uploadContainer.style.opacity = "1";
            uploadContainer.style.cursor = "pointer";
        }
    }
}

// Avvio
document.addEventListener('DOMContentLoaded', init);