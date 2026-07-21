// ==========================================
// 1. IMPORT E SETUP
// ==========================================
import { supabase } from '../utils/supabaseClient.js';
import { logError } from '../utils/logger.js';

let currentUser = null; 

const vetName = document.getElementById("vetName");
const vetSubtitle = document.getElementById("vetSubtitle");
const vetAvatar = document.getElementById("vetAvatar");
const logoutBtn = document.getElementById("logoutBtn");
const deleteRoleBtn = document.getElementById("deleteRoleBtn");

// ==========================================
// 2. CARICAMENTO PROFILO E IMMAGINE
// ==========================================
async function initProfile() {
    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            window.location.href = "../../index.html";
            return;
        }
        currentUser = user; 

        // Query per estrarre i dati
        const { data: vetData, error: profileError } = await supabase
            .from('veterinarians')
            .select(`
                numero_ordine,
                foto_professionale_url,
                profiles (nome, cognome, avatar_url)
            `)
            .eq('user_id', user.id)
            .single();

        if (profileError) throw profileError;

        if (vetData.profiles) {
            const nome = vetData.profiles.nome || "";
            const cognome = vetData.profiles.cognome || "";
            const nomeCompleto = (nome || cognome) ? `${nome} ${cognome}`.trim() : "Dott. Sconosciuto";
            
            vetName.textContent = nomeCompleto;
            if (vetData.numero_ordine) {
                vetSubtitle.textContent = `Medico veterinario · Ordine n. ${vetData.numero_ordine}`;
            } else {
                vetSubtitle.textContent = `Medico veterinario`;
            }
            
            // ==========================================
            // LOGICA AVATAR FONDAMENTALE
            // ==========================================
            let finalAvatarUrl = "";
            
            // Diamo precedenza alla foto professionale in camice salvata
            const rawAvatarPath = vetData.foto_professionale_url || vetData.profiles?.avatar_url;
            const fallbackUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(nomeCompleto)}&background=E2E8F0&color=64748B`;

            console.log("Dato letto dal DB:", rawAvatarPath); // Per debug

            if (rawAvatarPath) {
                // Se è già un URL completo (es. Google auth fallback), lo usiamo
                if (rawAvatarPath.startsWith('http://') || rawAvatarPath.startsWith('https://')) {
                    finalAvatarUrl = rawAvatarPath;
                } else {
                    // Genera l'URL pubblico dal path relativo salvato nel DB
                    const { data: urlData } = supabase.storage.from('storage_veterinari').getPublicUrl(rawAvatarPath);
                    // Il parametro ?t= forza il browser a scaricare l'immagine aggiornata, bypassando la cache
                    finalAvatarUrl = `${urlData.publicUrl}?t=${new Date().getTime()}`;
                }
            } else {
                finalAvatarUrl = fallbackUrl;
            }

            console.log("URL generato per l'interfaccia:", finalAvatarUrl); // Per debug

            // Iniezione nell'elemento HTML <img>
            if (vetAvatar) {
                vetAvatar.onerror = null; 
                vetAvatar.src = finalAvatarUrl;
                
                // Fallback in caso di immagine rotta
                vetAvatar.onerror = () => {
                    console.warn("Impossibile scaricare l'immagine. Uso il fallback.");
                    vetAvatar.onerror = null; 
                    vetAvatar.src = fallbackUrl;
                };
            }
        }

    } catch (error) {
        console.error("Errore caricamento profilo:", error);
        if (vetName) vetName.textContent = "Errore di caricamento";
        if (vetSubtitle) vetSubtitle.textContent = "Riprova più tardi";
    }
}

// ==========================================
// 3. LOGOUT
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
            console.error("Errore logout:", error);
            alert("Errore durante la disconnessione.");
            logoutBtn.innerHTML = 'Cambia profilo';
            logoutBtn.disabled = false;
        }
    });
}

initProfile();