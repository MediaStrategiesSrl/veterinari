// ==========================================
// 1. IMPORT CENTRALIZZATI
// ==========================================
// Assicurati che i percorsi puntino alla cartella corretta (es. ../utils/)
import { supabase } from '../utils/supabaseClient.js';
import { logError } from '../utils/logger.js';

let currentUser = null;
let currentPetId = null; // ID dell'animale attivo che sta navigando

// Elementi DOM
const walksList = document.getElementById("walksList");
const friendsList = document.getElementById("friendsList");
const nomePetCorrente = document.getElementById("nomePetCorrente");

// Modals
const modalCrea = document.getElementById("modalCreaPasseggiata");
const modalNotifiche = document.getElementById("modalNotifiche");

// ==========================================
// INIZIALIZZAZIONE PAGINA
// ==========================================
async function init() {
    try {
        // 1. Controllo Autenticazione
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) throw Object.assign(new Error(authError.message), { code: authError.code || 'AUTH_SYS_ERROR' });
        
        if (!user) { 
            window.location.href = "../../index.html"; 
            return; 
        }
        currentUser = user;

        // Recuperiamo il pet attivo salvato dalla Dashboard
        currentPetId = localStorage.getItem("activePetId");

        if (currentPetId) {
            // SE ABBIAMO GIA L'ID, SCARICHIAMO IL SUO NOME DAL DATABASE
            const { data: pet, error: petError } = await supabase
                .from('pets')
                .select('nome')
                .eq('id', currentPetId)
                .single();
                
            if (petError) throw Object.assign(new Error(petError.message), { code: petError.code || 'DB_FETCH_PET_ERROR' });
            if (pet) nomePetCorrente.textContent = pet.nome;
            
        } else {
            // SE NON C'È UN ID, PRENDIAMO IL PRIMO CANE
            const { data: pets, error: petsError } = await supabase
                .from('pets')
                .select('id, nome')
                .eq('owner_id', user.id)
                .limit(1);

            if (petsError) throw Object.assign(new Error(petsError.message), { code: petsError.code || 'DB_FETCH_PETS_ERROR' });
            
            if (pets && pets.length > 0) {
                currentPetId = pets[0].id;
                localStorage.setItem("activePetId", currentPetId);
                nomePetCorrente.textContent = pets[0].nome;
            }
        }

        // Facciamo partire i caricamenti
        loadPasseggiate();
        loadAmici();
        checkNotificheAmicizia();

    } catch (error) {
        console.error("Errore critico in init passeggiate:", error);
        await logError({
            source: 'passeggiate_amici',
            action: 'init_page',
            errorMessage: error.message || "Errore durante l'inizializzazione della pagina passeggiate",
            errorCode: error.code || 'UNKNOWN_SYS_ERROR',
            context: {}
        });
    }
}

// ==========================================
// 2. CARICA PASSEGGIATE ("Vicino a te")
// ==========================================
async function loadPasseggiate() {
    try {
        const oggiISO = new Date().toISOString();
        const { data: walks, error } = await supabase
            .from('walks')
            .select('*')
            .gte('data_passeggiata', oggiISO)
            .order('data_passeggiata', { ascending: true })
            .limit(5);

        if (error) throw Object.assign(new Error(error.message), { code: error.code || 'DB_FETCH_WALKS_ERROR' });

        if (walks.length === 0) {
            walksList.innerHTML = `<p style="text-align:center; color:#888;">Nessuna passeggiata in programma.</p>`;
            return;
        }

        walksList.innerHTML = "";
        walks.forEach(walk => {
            const dataStr = new Date(walk.data_passeggiata).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            
            walksList.innerHTML += `
                <a href="dettaglio-passeggiata.html?id=${walk.id}" style="text-decoration: none; color: inherit;">
                    <div class="walk-item-card">
                        <div class="walk-icon"><i class="fa-solid fa-tree"></i></div>
                        <div class="walk-info">
                            <h4>${walk.titolo}</h4>
                            <p>${dataStr} · max ${walk.max_animali} animali</p>
                        </div>
                        <i class="fa-solid fa-chevron-right" style="color: #CBD5E1;"></i>
                    </div>
                </a>
            `;
        });
    } catch (error) {
        console.error("Errore caricamento passeggiate:", error);
        walksList.innerHTML = `<p style="color:#DC2626; text-align:center;">Errore durante il caricamento delle passeggiate.</p>`;
        
        await logError({
            source: 'passeggiate_amici',
            action: 'load_passeggiate',
            errorMessage: error.message || "Impossibile recuperare le passeggiate dal DB",
            errorCode: error.code || 'UNKNOWN_DB_ERROR',
            context: {}
        });
    }
}

// ==========================================
// 3. CARICA AMICI ("Gli amici di Milo")
// ==========================================
async function loadAmici() {
    if (!currentPetId) return;

    try {
        const { data: friendships, error } = await supabase
            .from('pet_friendships')
            .select(`
                passeggiate_insieme,
                pet1:pets!pet1_id(id, nome, avatar_url),
                pet2:pets!pet2_id(id, nome, avatar_url)
            `)
            .or(`pet1_id.eq.${currentPetId},pet2_id.eq.${currentPetId}`)
            .eq('status', 'accepted');

        if (error) throw Object.assign(new Error(error.message), { code: error.code || 'DB_FETCH_FRIENDS_ERROR' });

        if (!friendships || friendships.length === 0) return; // Lascia il messaggio vuoto predefinito

        friendsList.innerHTML = "";
        friendships.forEach(f => {
            const amico = f.pet1.id === currentPetId ? f.pet2 : f.pet1;
            const foto = amico.avatar_url ? supabase.storage.from('avatars').getPublicUrl(amico.avatar_url).data.publicUrl : '../../img/default-dog.jpg';

            friendsList.innerHTML += `
                <div class="friend-card">
                    <img src="${foto}" alt="${amico.nome}" class="friend-img">
                    <div class="friend-info">
                        <h4>${amico.nome}</h4>
                        <p>${f.passeggiate_insieme} passeggiat${f.passeggiate_insieme > 1 ? 'e' : 'a'} insieme</p>
                    </div>
                </div>
            `;
        });
    } catch (error) {
        console.error("Errore caricamento amici:", error);
        await logError({
            source: 'passeggiate_amici',
            action: 'load_amici',
            errorMessage: error.message || "Impossibile recuperare la lista amici dal DB",
            errorCode: error.code || 'UNKNOWN_DB_ERROR',
            context: { currentPetId }
        });
    }
}

// ==========================================
// 4. GESTIONE NOTIFICHE RICHIESTE AMICIZIA
// ==========================================
async function checkNotificheAmicizia() {
    if (!currentPetId) return;

    try {
        const { data: pendingRequests, error } = await supabase
            .from('pet_friendships')
            .select('id, pet1:pets!pet1_id(nome)')
            .eq('pet2_id', currentPetId)
            .eq('status', 'pending');

        if (error) throw Object.assign(new Error(error.message), { code: error.code || 'DB_FETCH_NOTIFICATIONS_ERROR' });

        const badge = document.getElementById("badgeNotifiche");
        
        if (pendingRequests && pendingRequests.length > 0) {
            badge.textContent = pendingRequests.length;
            badge.hidden = false;

            const listaNotifiche = document.getElementById("listaNotifiche");
            listaNotifiche.innerHTML = "";
            pendingRequests.forEach(req => {
                listaNotifiche.innerHTML += `
                    <div style="background: #F8FAFC; padding: 15px; border-radius: 12px;">
                        <p style="margin: 0 0 10px 0; color: #1E293B;"><strong>${req.pet1.nome}</strong> vuole fare amicizia!</p>
                        <div style="display:flex; gap: 10px;">
                            <button class="btn-primary accetta-btn" data-id="${req.id}" style="padding: 10px; flex:1;">Accetta</button>
                            <button class="btn-secondary rifiuta-btn" data-id="${req.id}" style="padding: 10px; flex:1; background:#E2E8F0; border:none; border-radius:30px; font-weight:bold; color: #1E293B;">Rifiuta</button>
                        </div>
                    </div>
                `;
            });

            document.querySelectorAll(".accetta-btn").forEach(btn => {
                btn.addEventListener("click", async (e) => await rispondiAmicizia(e.target.dataset.id, 'accepted'));
            });
            document.querySelectorAll(".rifiuta-btn").forEach(btn => {
                btn.addEventListener("click", async (e) => await rispondiAmicizia(e.target.dataset.id, 'rejected'));
            });
        } else {
            badge.hidden = true;
            document.getElementById("listaNotifiche").innerHTML = `<p style="color:#94A3B8;">Nessuna nuova richiesta.</p>`;
        }
    } catch (error) {
        console.error("Errore controllo notifiche:", error);
        await logError({
            source: 'passeggiate_amici',
            action: 'check_notifiche',
            errorMessage: error.message || "Impossibile recuperare le richieste di amicizia",
            errorCode: error.code || 'UNKNOWN_DB_ERROR',
            context: { currentPetId }
        });
    }
}

async function rispondiAmicizia(friendshipId, nuovoStatus) {
    try {
        const { error } = await supabase.from('pet_friendships').update({ status: nuovoStatus }).eq('id', friendshipId);
        
        if (error) throw Object.assign(new Error(error.message), { code: error.code || 'DB_UPDATE_FRIENDSHIP_ERROR' });

        alert(nuovoStatus === 'accepted' ? "Amicizia accettata!" : "Richiesta rifiutata.");
        modalNotifiche.style.display = "none";
        
        // Ricarichiamo dati UI
        checkNotificheAmicizia();
        loadAmici(); 
    } catch (error) {
        console.error("Errore durante la risposta all'amicizia:", error);
        alert("Si è verificato un errore di sistema. Riprova più tardi.");
        
        await logError({
            source: 'passeggiate_amici',
            action: 'rispondi_amicizia',
            errorMessage: error.message || "Impossibile aggiornare lo status dell'amicizia",
            errorCode: error.code || 'UNKNOWN_DB_ERROR',
            context: { friendshipId, nuovoStatus }
        });
    }
}

// ==========================================
// 5. LOGICA FORM CREA PASSEGGIATA
// ==========================================
document.getElementById("btnApriCreaPasseggiata").addEventListener("click", () => modalCrea.style.display = "flex");
document.querySelectorAll(".close-modal-btn").forEach(btn => btn.addEventListener("click", () => {
    modalCrea.style.display = "none";
    modalNotifiche.style.display = "none";
}));

document.getElementById("btnNotifiche").addEventListener("click", () => {
    const modal = document.getElementById("modalNotifiche");
    modal.style.display = "block";
    setTimeout(() => {
        if (modal.style.display === "block") {
            modal.style.display = "none";
        }
    }, 5000);
});

document.getElementById("formCreaPasseggiata").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    
    const titolo = document.getElementById("walkTitle").value.trim();
    const luogo = document.getElementById("walkLocation").value.trim();
    const dataInput = document.getElementById("walkDate").value;
    const maxCaniInput = document.getElementById("walkMaxDogs").value;

    // ERRORE LOGICO: Validazione Campi (Nessun Log al DB)
    if (!titolo || !luogo || !dataInput || !maxCaniInput) {
        alert("Per favore compila tutti i campi obbligatori.");
        return;
    }

    btn.textContent = "Salvataggio...";
    btn.disabled = true;

    try {
        const dataFormattata = new Date(dataInput).toISOString();
        const maxCaniFormattato = parseInt(maxCaniInput, 10);

        const { error } = await supabase.from('walks').insert({
            creator_id: currentUser.id,
            titolo: titolo,
            luogo: luogo,
            data_passeggiata: dataFormattata,
            max_animali: maxCaniFormattato
        });
        
        if (error) throw Object.assign(new Error(error.message), { code: error.code || 'DB_INSERT_WALK_ERROR' });

        modalCrea.style.display = "none";
        e.target.reset();
        await loadPasseggiate(); 

    } catch (error) {
        console.error("Errore salvataggio passeggiata:", error);
        alert("Errore di sistema durante la pubblicazione. I tecnici sono stati avvisati.");
        
        // ERRORE DI SISTEMA: Invio log per intervento tecnico
        await logError({
            source: 'passeggiate_amici',
            action: 'crea_passeggiata',
            errorMessage: error.message || "Insert passeggiata fallito nel DB",
            errorCode: error.code || 'UNKNOWN_DB_ERROR',
            context: { titolo, luogo }
        });
    } finally {
        btn.textContent = "Pubblica Passeggiata";
        btn.disabled = false;
    }
});

// Avvia tutto!
init();