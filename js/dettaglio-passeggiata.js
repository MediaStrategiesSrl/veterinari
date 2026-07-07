import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let currentPetId = null;
let currentWalkId = null;
let isGiaIscritto = false;

async function init() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = "login.html"; return; }
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
        const { data: pet } = await supabase.from('pets').select('nome').eq('id', currentPetId).single();
        if (pet) {
            document.querySelectorAll(".pet-name-fill").forEach(el => el.textContent = pet.nome);
        }
    }

    await loadWalkDetails();
    await checkPartecipazione();
}

async function loadWalkDetails() {
    // Scarica dettagli passeggiata
    const { data: walk, error } = await supabase.from('walks').select('*').eq('id', currentWalkId).single();
    if (error || !walk) return;

    // Scarica conteggio partecipanti
    const { count } = await supabase.from('walk_participants').select('*', { count: 'exact', head: true }).eq('walk_id', currentWalkId);

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
}

// ==========================================
// CONTROLLO STATO ISCRIZIONE
// ==========================================
async function checkPartecipazione() {
    if (!currentPetId) return;
    const { data } = await supabase.from('walk_participants').select('id').eq('walk_id', currentWalkId).eq('pet_id', currentPetId).single();
    
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
    // 1. Prendi tutti i partecipanti alla passeggiata, con i dati del loro pet
    const { data: partecipanti, error } = await supabase
        .from('walk_participants')
        .select(`
            pet_id,
            pets ( id, nome, avatar_url )
        `)
        .eq('walk_id', currentWalkId);

    if (error || !partecipanti) return;

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
        const { data: friendship } = await supabase
            .from('pet_friendships')
            .select('status')
            .or(`and(pet1_id.eq.${currentPetId},pet2_id.eq.${pet.id}),and(pet1_id.eq.${pet.id},pet2_id.eq.${currentPetId})`)
            .single();

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
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-user-plus"></i> Aggiungi`;
        alert("Errore nell'invio della richiesta.");
    }
}

init();