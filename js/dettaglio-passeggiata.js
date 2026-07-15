// 1. IMPORT CENTRALIZZATI
// ==========================================
// Assicurati che i percorsi puntino alla cartella corretta (es. ../utils/)
import { supabase } from '../utils/supabaseClient.js';
import { logError } from '../utils/logger.js';

let currentUser = null;
let currentPetId = null;
let currentWalkId = null;
let isGiaIscritto = false;

async function init() {
    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) throw Object.assign(new Error(authError.message), { code: authError.code || 'AUTH_ERROR' });
        
        if (!user) { window.location.href = "index.html"; return; }
        currentUser = user;

        // 1. Prendi l'ID della passeggiata dall'URL
        const urlParams = new URLSearchParams(window.location.search);
        currentWalkId = urlParams.get('id');

        if (!currentWalkId) {
            alert("Passeggiata non trovata!");
            window.location.href = "passeggiate.html";
            return;
        }

        // 2. Prendi l'animale attivo dal LocalStorage e scarica il nome
        currentPetId = localStorage.getItem("activePetId");
        if (currentPetId) {
            const { data: pet, error: petError } = await supabase.from('pets').select('nome').eq('id', currentPetId).single();
            if (petError && petError.code !== 'PGRST116') throw Object.assign(new Error(petError.message), { code: petError.code });
            
            if (pet) {
                document.querySelectorAll(".pet-name-fill").forEach(el => el.textContent = pet.nome);
            }
        }

        await loadWalkDetails();
        await checkPartecipazione();
        
    } catch (error) {
        console.error("Errore in init:", error);
        await logError({
            source: 'frontend_dettaglio_passeggiata',
            action: 'init_page',
            errorMessage: error.message || "Errore inizializzazione pagina passeggiata",
            errorCode: error.code || 'INIT_ERROR',
            stackTrace: error.stack
        });
    }
}

async function loadWalkDetails() {
    try {
        // Scarica dettagli passeggiata
        const { data: walk, error } = await supabase.from('walks').select('*').eq('id', currentWalkId).single();
        if (error) throw Object.assign(new Error(error.message), { code: error.code || 'WALK_FETCH_ERROR' });
        if (!walk) return;

        // Scarica conteggio partecipanti
        const { count, error: countError } = await supabase.from('walk_participants').select('*', { count: 'exact', head: true }).eq('walk_id', currentWalkId);
        if (countError) throw Object.assign(new Error(countError.message), { code: countError.code || 'COUNT_FETCH_ERROR' });

        // Formatta la data
        const dataObj = new Date(walk.data_passeggiata);
        const dataStr = dataObj.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
        const oraStr = dataObj.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

        // Popola HTML
        document.getElementById("headerLuogo").textContent = walk.luogo;
        document.getElementById("walkTitleDisplay").textContent = walk.titolo;
        document.getElementById("walkDescDisplay").textContent = walk.descrizione;
        document.getElementById("walkDateTime").innerHTML = `<i class="fa-regular fa-calendar"></i> ${dataStr} · ${oraStr}`;
        
        document.getElementById("statPartecipanti").textContent = `${count || 0}/${walk.max_animali}`;
        document.getElementById("statDistanza").textContent = `${walk.lunghezza_km} km`;
        document.getElementById("statLivello").textContent = walk.livello;

        await loadPartecipanti();
        
    } catch (error) {
        console.error("Errore loadWalkDetails:", error);
        await logError({
            source: 'frontend_dettaglio_passeggiata',
            action: 'load_walk_details',
            errorMessage: error.message,
            errorCode: error.code || 'DETAILS_LOAD_ERROR',
            stackTrace: error.stack,
            context: { walk_id: currentWalkId }
        });
    }
}

// ==========================================
// CONTROLLO STATO ISCRIZIONE
// ==========================================
async function checkPartecipazione() {
    try {
        if (!currentPetId) return;
        const { data, error } = await supabase.from('walk_participants').select('id').eq('walk_id', currentWalkId).eq('pet_id', currentPetId).single();
        
        if (error && error.code !== 'PGRST116') throw Object.assign(new Error(error.message), { code: error.code });

        const btn = document.getElementById("btnPartecipa");
        if (!btn) return;

        if (data) {
            isGiaIscritto = true;
            btn.innerHTML = `<i class="fa-solid fa-xmark"></i> Annulla Iscrizione`;
            btn.disabled = false;
            btn.style.background = "#DC2626"; // Rosso
            btn.style.color = "white";
        } else {
            isGiaIscritto = false;
            // Recupera il nome del pet dal DOM per riscriverlo nel bottone
            const petName = document.querySelector(".pet-name-fill") ? document.querySelector(".pet-name-fill").textContent : "...";
            btn.innerHTML = `Partecipa con <span class="pet-name-fill">${petName}</span>`;
            btn.disabled = false;
            btn.style.background = "#F58220"; // Arancione
            btn.style.color = "white";
        }
    } catch (error) {
        console.error("Errore checkPartecipazione:", error);
        await logError({
            source: 'frontend_dettaglio_passeggiata',
            action: 'check_participation',
            errorMessage: error.message,
            errorCode: error.code || 'CHECK_PART_ERROR',
            stackTrace: error.stack,
            context: { walk_id: currentWalkId, pet_id: currentPetId }
        });
    }
}

// ==========================================
// BOTTONE PARTECIPA / ANNULLA
// ==========================================
const btnPartecipa = document.getElementById("btnPartecipa");
if (btnPartecipa) {
    btnPartecipa.addEventListener("click", async (e) => {
        btnPartecipa.disabled = true;
        btnPartecipa.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Attendere...`;

        if (isGiaIscritto) {
            // AZIONE: DISISCRIVITI
            const { error } = await supabase
                .from('walk_participants')
                .delete()
                .eq('walk_id', currentWalkId)
                .eq('pet_id', currentPetId);

            if (!error) {
                await checkPartecipazione(); 
                await loadWalkDetails(); 
            } else {
                await logError({
                    source: 'frontend_dettaglio_passeggiata',
                    action: 'leave_walk',
                    errorMessage: error.message,
                    errorCode: error.code || 'LEAVE_WALK_ERROR',
                    context: { walk_id: currentWalkId, pet_id: currentPetId }
                });
                alert("Errore durante l'annullamento dell'iscrizione.");
                await checkPartecipazione(); 
            }
        } else {
            // AZIONE: ISCRIVITI
            const { error } = await supabase
                .from('walk_participants')
                .insert({
                    walk_id: currentWalkId,
                    pet_id: currentPetId,
                    owner_id: currentUser.id
                });

            if (!error) {
                await checkPartecipazione(); 
                await loadWalkDetails(); 
            } else {
                await logError({
                    source: 'frontend_dettaglio_passeggiata',
                    action: 'join_walk',
                    errorMessage: error.message,
                    errorCode: error.code || 'JOIN_WALK_ERROR',
                    context: { walk_id: currentWalkId, pet_id: currentPetId, owner_id: currentUser.id }
                });
                alert("Errore durante l'iscrizione.");
                await checkPartecipazione(); 
            }
        }
    });
}

// ==========================================
// CARICAMENTO PARTECIPANTI E AMICIZIE
// ==========================================
async function loadPartecipanti() {
    try {
        // 1. Prendi tutti i partecipanti alla passeggiata, con i dati del loro pet
        const { data: partecipanti, error } = await supabase
            .from('walk_participants')
            .select(`
                pet_id,
                pets ( id, nome, avatar_url )
            `)
            .eq('walk_id', currentWalkId);

        if (error) throw Object.assign(new Error(error.message), { code: error.code });
        if (!partecipanti) return;

        const listaContainer = document.getElementById("listaPartecipanti");
        
        // Filtra via te stesso (non puoi chiederti l'amicizia da solo)
        const altriPartecipanti = partecipanti.filter(p => p.pet_id !== currentPetId);

        if (altriPartecipanti.length === 0) {
            listaContainer.innerHTML = `<p style="color: #94A3B8; font-size: 0.9rem; text-align: center;">Nessun altro animale iscritto al momento.</p>`;
            return;
        }

        listaContainer.innerHTML = ""; // Svuota il contenitore

        // 2. Costruisci la UI per ogni cane
        for (const p of altriPartecipanti) {
            const pet = p.pets;
            
            // Controlla se siete già amici o c'è una richiesta in sospeso
            const { data: friendship, error: friendError } = await supabase
                .from('pet_friendships')
                .select('status')
                .or(`and(pet1_id.eq.${currentPetId},pet2_id.eq.${pet.id}),and(pet1_id.eq.${pet.id},pet2_id.eq.${currentPetId})`)
                .maybeSingle();

            if (friendError && friendError.code !== 'PGRST116') throw Object.assign(new Error(friendError.message), { code: friendError.code });

            // Stato di default del bottone
            let btnHTML = `<button class="btn-add-friend" data-id="${pet.id}"><i class="fa-solid fa-user-plus"></i> Aggiungi</button>`;
            
            if (friendship) {
                if (friendship.status === 'pending') {
                    btnHTML = `<button class="btn-add-friend pending" disabled><i class="fa-solid fa-clock"></i> In attesa</button>`;
                } else if (friendship.status === 'accepted') {
                    btnHTML = `<button class="btn-add-friend friends" disabled><i class="fa-solid fa-check"></i> Amici</button>`;
                }
            }

            // Gestione foto avatar
            const avatarUrl = pet.avatar_url 
                ? supabase.storage.from('avatars').getPublicUrl(pet.avatar_url).data.publicUrl 
                : '../../img/default-dog.jpg';

            listaContainer.innerHTML += `
                <div class="participant-card">
                    <img src="${avatarUrl}" class="participant-img" alt="${pet.nome}">
                    <div class="participant-info">
                        <h4>${pet.nome}</h4>
                    </div>
                    ${btnHTML}
                </div>
            `;
        }

        // 3. Attacca gli eventi ai bottoni "Aggiungi" generati
        document.querySelectorAll('.btn-add-friend:not([disabled])').forEach(btn => {
            btn.addEventListener('click', async (e) => await inviaRichiestaAmicizia(e.target.closest('button')));
        });

    } catch (error) {
        console.error("Errore in loadPartecipanti:", error);
        await logError({
            source: 'frontend_dettaglio_passeggiata',
            action: 'load_participants',
            errorMessage: error.message,
            errorCode: error.code || 'PARTICIPANTS_LOAD_ERROR',
            stackTrace: error.stack,
            context: { walk_id: currentWalkId }
        });
    }
}

async function inviaRichiestaAmicizia(btn) {
    const targetPetId = btn.dataset.id;
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`;

    const { error } = await supabase
        .from('pet_friendships')
        .insert({
            pet1_id: currentPetId,
            pet2_id: targetPetId,
            status: 'pending' // Segna in attesa!
        });

    if (!error) {
        btn.className = 'btn-add-friend pending';
        btn.innerHTML = `<i class="fa-solid fa-clock"></i> In attesa`;
    } else {
        await logError({
            source: 'frontend_dettaglio_passeggiata',
            action: 'send_friend_request',
            errorMessage: error.message,
            errorCode: error.code || 'FRIEND_REQUEST_ERROR',
            context: { from_pet: currentPetId, to_pet: targetPetId }
        });
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-user-plus"></i> Aggiungi`;
        alert("Errore nell'invio della richiesta.");
    }
}

init();