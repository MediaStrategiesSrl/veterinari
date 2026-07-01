import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const vetName = document.getElementById("vetName");
const vetSubtitle = document.getElementById("vetSubtitle");
const vetAvatar = document.getElementById("vetAvatar");

async function initProfile() {
    try {
        // 1. Verifica chi è loggato
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            window.location.href = "login.html";
            return;
        }

        // 2. Prendi Profilo e Dati del Veterinario (JOIN)
        const { data: vetData, error } = await supabase
            .from('veterinarians')
            .select(`
                numero_ordine,
                profiles (nome, avatar_url)
            `)
            .eq('user_id', user.id)
            .single();

        if (error) throw error;

        // 3. Popola Nome e Avatar
        if (vetData.profiles) {
            const nomeProf = vetData.profiles.nome || "Dott. Sconosciuto";
            vetName.textContent = nomeProf;
            
            if (vetData.profiles.avatar_url) {
                vetAvatar.src = vetData.profiles.avatar_url;
            } else {
                vetAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(nomeProf)}&background=E2E8F0&color=64748B`;
            }
        }

        // 4. Popola Sottotitolo (Numero Ordine dinamico!)
        if (vetData.numero_ordine) {
            // Se nel DB c'è scritto "Ordine milano n.5123", lo stampa direttamente
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
// LOGOUT / CAMBIO PROFILO
// ==========================================
const logoutBtn = document.getElementById("logoutBtn");

if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
        // Opzionale: Cambia il testo mentre carica
        logoutBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uscita in corso...';
        logoutBtn.disabled = true;

        try {
            // Disconnette l'utente da Supabase
            const { error } = await supabase.auth.signOut();
            if (error) throw error;

            // Pulisce la memoria del browser per sicurezza
            localStorage.clear();
            sessionStorage.clear();

            // Rimanda alla pagina di Login
            window.location.href = "index.html";
        } catch (error) {
            console.error("Errore durante il logout:", error);
            alert("Errore durante la disconnessione.");
            logoutBtn.innerHTML = 'Cambia profilo';
            logoutBtn.disabled = false;
        }
    });
}

initProfile();