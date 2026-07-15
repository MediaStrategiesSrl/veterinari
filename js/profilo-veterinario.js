// ==========================================
// 1. IMPORT CENTRALIZZATI E SETUP
// ==========================================
// Assicurati che i percorsi (../utils/) puntino alla tua struttura reale
import { supabase } from '../utils/supabaseClient.js';
import { logError } from '../utils/logger.js';

let currentUser = null; // Variabile globale fondamentale!

const vetName = document.getElementById("vetName");
const vetSubtitle = document.getElementById("vetSubtitle");
const vetAvatar = document.getElementById("vetAvatar");
const logoutBtn = document.getElementById("logoutBtn");
const deleteRoleBtn = document.getElementById("deleteRoleBtn");

// ==========================================
// 1. CARICAMENTO PROFILO
// ==========================================
async function initProfile() {
    try {
        // Verifica chi è loggato
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        if (authError) throw Object.assign(new Error(authError.message), { code: authError.code || 'AUTH_SYS_ERROR' });
        
        if (!user) {
            window.location.href = "../../index.html";
            return;
        }
        currentUser = user; 

        // Prendi Profilo e Dati del Veterinario (JOIN)
        const { data: vetData, error: profileError } = await supabase
            .from('veterinarians')
            .select(`
                numero_ordine,
                profiles (nome, cognome, avatar_url)
            `)
            .eq('user_id', user.id)
            .single();

        if (profileError) throw Object.assign(new Error(profileError.message), { code: profileError.code || 'DB_FETCH_VET_PROFILE_ERROR' });

        // Popola Nome e Avatar
        if (vetData.profiles) {
            const nome = vetData.profiles.nome || "";
            const cognome = vetData.profiles.cognome || "";

            const nomeCompleto = (nome || cognome) ? `${nome} ${cognome}`.trim() : "Dott. Sconosciuto";
            vetName.textContent = nomeCompleto;
            
            // Genera l'URL pubblico dal bucket
            if (vetData.profiles.avatar_url) {
                const { data: urlData } = supabase.storage.from('storage_veterinari').getPublicUrl(vetData.profiles.avatar_url);
                vetAvatar.src = urlData.publicUrl;
            } else {
                vetAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(nomeCompleto)}&background=E2E8F0&color=64748B`;
            }
        }

        // Popola Sottotitolo (Numero Ordine dinamico allineato al mockup)
        if (vetData.numero_ordine) {
            vetSubtitle.textContent = `Medico veterinario · Ordine n. ${vetData.numero_ordine}`;
        } else {
            vetSubtitle.textContent = `Medico veterinario`;
        }

    } catch (error) {
        console.error("Errore caricamento profilo vet:", error);
        
        // ==========================================
        // TRIGGER LOG ERROR
        // ==========================================
        await logError({
            source: 'profilo_veterinario',
            action: 'init_profile',
            errorMessage: error.message || "Impossibile recuperare i dati del profilo",
            errorCode: error.code || 'UNKNOWN_SYS_ERROR',
            context: { userId: currentUser?.id }
        });

        vetName.textContent = "Errore di caricamento";
        vetSubtitle.textContent = "Riprova più tardi";
    }
}

// ==========================================
// 2. LOGOUT / CAMBIO PROFILO
// ==========================================
if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
        logoutBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uscita in corso...';
        logoutBtn.disabled = true;

        try {
            const { error } = await supabase.auth.signOut();
            if (error) throw Object.assign(new Error(error.message), { code: error.code || 'AUTH_SIGNOUT_ERROR' });

            localStorage.clear();
            sessionStorage.clear();
            window.location.href = "../../index.html";
        } catch (error) {
            console.error("Errore durante il logout:", error);
            
            // ==========================================
            // TRIGGER LOG ERROR
            // ==========================================
            await logError({
                source: 'profilo_veterinario',
                action: 'logout_user',
                errorMessage: error.message || "Logout fallito",
                errorCode: error.code || 'UNKNOWN_AUTH_ERROR',
                context: { userId: currentUser?.id }
            });

            alert("Errore durante la disconnessione di sistema. Riprova.");
            logoutBtn.innerHTML = 'Cambia profilo';
            logoutBtn.disabled = false;
        }
    });
}

// ==========================================
// 3. ELIMINA RUOLO VETERINARIO
// ==========================================
if (deleteRoleBtn) {
    deleteRoleBtn.addEventListener('click', async () => {
        const confermato = confirm("Attenzione: Sei sicuro di voler eliminare il tuo ruolo di Veterinario? Perderai l'accesso alla tua clinica, ai tuoi appuntamenti e alle cartelle cliniche compilate.");
        
        if (confermato) {
            deleteRoleBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Pulizia in corso...';
            deleteRoleBtn.style.pointerEvents = 'none';

            try {
                // A. Trova l'ID del ruolo "Veterinario"
                const { data: roleData, error: roleError } = await supabase
                    .from('roles')
                    .select('id')
                    .ilike('nome', '%veterinario%')
                    .single();
                    
                if (roleError) throw Object.assign(new Error(roleError.message), { code: roleError.code || 'DB_FETCH_ROLE_ERROR' });

                // B. Pulisci Appuntamenti (dove il vet è il fornitore/provider)
                const { error: apptError } = await supabase
                    .from('appointments')
                    .delete()
                    .eq('provider_id', currentUser.id);
                if (apptError) throw Object.assign(new Error(apptError.message), { code: apptError.code || 'DB_DELETE_APPT_ERROR' });

                // C. Pulisci Consulti Urgenti
                const { error: urgentError } = await supabase
                    .from('urgent_consultations')
                    .delete()
                    .eq('vet_id', currentUser.id);
                if (urgentError) throw Object.assign(new Error(urgentError.message), { code: urgentError.code || 'DB_DELETE_URGENT_ERROR' });

                // D. Pulisci Cartelle Cliniche
                const { error: medError } = await supabase
                    .from('medical_records')
                    .delete()
                    .eq('vet_id', currentUser.id);
                if (medError) throw Object.assign(new Error(medError.message), { code: medError.code || 'DB_DELETE_RECORDS_ERROR' });

                // E. Sgancia il ruolo da user_roles (Usiamo .eq su entrambe le condizioni per sicurezza)
                const { error: unlinkError } = await supabase
                    .from('user_roles')
                    .delete()
                    .eq('user_id', currentUser.id)
                    .eq('role_id', roleData.id);
                if (unlinkError) throw Object.assign(new Error(unlinkError.message), { code: unlinkError.code || 'DB_DELETE_USER_ROLE_ERROR' });

                // F. Elimina la riga dalla tabella veterinarians
                const { error: deleteVetError } = await supabase
                    .from('veterinarians')
                    .delete()
                    .eq('user_id', currentUser.id);
                if (deleteVetError) throw Object.assign(new Error(deleteVetError.message), { code: deleteVetError.code || 'DB_DELETE_VET_ERROR' });

                alert("Ruolo Veterinario rimosso con successo!");
                window.location.href = "../../ruoli.html";

            } catch (error) {
                console.error("Errore durante l'eliminazione del ruolo veterinario:", error);
                
                // ==========================================
                // TRIGGER LOG ERROR
                // ==========================================
                await logError({
                    source: 'profilo_veterinario',
                    action: 'delete_vet_role',
                    errorMessage: error.message || "Fallimento durante l'eliminazione a cascata del ruolo",
                    errorCode: error.code || 'UNKNOWN_DB_ERROR',
                    context: { userId: currentUser?.id }
                });

                alert("Si è verificato un errore di sistema critico. L'eliminazione è stata interrotta e i tecnici sono stati avvisati.");
                
                deleteRoleBtn.innerHTML = 'Elimina Ruolo Veterinario';
                deleteRoleBtn.style.pointerEvents = 'auto';
            }
        }
    });
}

initProfile();