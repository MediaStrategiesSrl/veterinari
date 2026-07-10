import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null; // Variabile globale fondamentale!

const vetName = document.getElementById("vetName");
const vetSubtitle = document.getElementById("vetSubtitle");
const vetAvatar = document.getElementById("vetAvatar");
const logoutBtn = document.getElementById("logoutBtn");
const deleteRoleBtn = document.getElementById("deleteRoleBtn"); // Aggiunto!

// ==========================================
// 1. CARICAMENTO PROFILO
// ==========================================
async function initProfile() {
    try {
        // Verifica chi è loggato
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            window.location.href = "../../index.html";
            return;
        }
        currentUser = user; // Salviamo l'utente

        // Prendi Profilo e Dati del Veterinario (JOIN)
        const { data: vetData, error } = await supabase
            .from('veterinarians')
            .select(`
                numero_ordine,
                profiles (nome, cognome, avatar_url)
            `)
            .eq('user_id', user.id)
            .single();

        if (error) throw error;

        // Popola Nome e Avatar
        if (vetData.profiles) {
            const nome = vetData.profiles.nome || "";
            const cognome = vetData.profiles.cognome || "";

            const nomeCompleto = (nome || cognome) ? `${nome} ${cognome}`.trim() : "Dott. Sconosciuto";
            vetName.textContent = nomeCompleto;
            
            // CORREZIONE AVATAR: Genera l'URL pubblico dal bucket
            if (vetData.profiles.avatar_url) {
                const { data: urlData } = supabase.storage.from('storage_veterinari').getPublicUrl(vetData.profiles.avatar_url);
                vetAvatar.src = urlData.publicUrl;
            } else {
                vetAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(nomeCompleto)}&background=E2E8F0&color=64748B`;
            }
        }

        // Popola Sottotitolo (Numero Ordine dinamico!)
        if (vetData.numero_ordine) {
            vetSubtitle.textContent = `Medico veterinario · ${vetData.numero_ordine}`;
        } else {
            vetSubtitle.textContent = `Medico veterinario`;
        }

    } catch (error) {
        console.error("Errore caricamento profilo vet:", error);
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
            if (error) throw error;

            localStorage.clear();
            sessionStorage.clear();
            window.location.href = "../../index.html";
        } catch (error) {
            console.error("Errore durante il logout:", error);
            alert("Errore durante la disconnessione.");
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
                    
                if (roleError) throw roleError;

                // B. Pulisci Appuntamenti (dove il vet è il fornitore/provider)
                const { error: apptError } = await supabase
                    .from('appointments')
                    .delete()
                    .eq('provider_id', currentUser.id);
                if (apptError) throw apptError;

                // C. Pulisci Consulti Urgenti
                const { error: urgentError } = await supabase
                    .from('urgent_consultations')
                    .delete()
                    .eq('vet_id', currentUser.id);
                if (urgentError) throw urgentError;

                // D. Pulisci Cartelle Cliniche (Altrimenti blocca l'eliminazione!)
                const { error: medError } = await supabase
                    .from('medical_records')
                    .delete()
                    .eq('vet_id', currentUser.id);
                if (medError) throw medError;

                // E. Sgancia il ruolo da user_roles
                const { error: unlinkError } = await supabase
                    .from('user_roles')
                    .delete()
                    .match({ user_id: currentUser.id, role_id: roleData.id });
                if (unlinkError) throw unlinkError;

                // F. Elimina la riga dalla tabella veterinarians
                const { error: deleteVetError } = await supabase
                    .from('veterinarians')
                    .delete()
                    .eq('user_id', currentUser.id);
                if (deleteVetError) throw deleteVetError;

                alert("Ruolo Veterinario rimosso con successo!");
                window.location.href = "../../ruoli.html";

            } catch (error) {
                console.error("Errore durante l'eliminazione del ruolo veterinario:", error);
                alert("Si è verificato un errore di sistema. Nessun dato è stato rimosso.");
                
                deleteRoleBtn.innerHTML = 'Elimina Ruolo Veterinario';
                deleteRoleBtn.style.pointerEvents = 'auto';
            }
        }
    });
}

initProfile();