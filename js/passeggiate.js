import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let currentPetId = null; // ID dell'animale attivo che sta navigando

// Elementi DOM
const walksList = document.getElementById("walksList");
const friendsList = document.getElementById("friendsList");
const nomePetCorrente = document.getElementById("nomePetCorrente");

// Modals
const modalCrea = document.getElementById("modalCreaPasseggiata");
const modalNotifiche = document.getElementById("modalNotifiche");

async function init() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = "login.html"; return; }
    currentUser = user;

    // Recuperiamo il pet attivo salvato dalla Dashboard
    currentPetId = localStorage.getItem("activePetId");

    if (currentPetId) {
        // SE ABBIAMO GIA L'ID, SCARICHIAMO IL SUO NOME DAL DATABASE
        const { data: pet } = await supabase
            .from('pets')
            .select('nome')
            .eq('id', currentPetId)
            .single();
            
        if (pet) nomePetCorrente.textContent = pet.nome;
        
    } else {
        // SE NON C'È UN ID (es. primo accesso assoluto), PRENDIAMO IL PRIMO CANE
        const { data: pets } = await supabase.from('pets').select('id, nome').eq('owner_id', user.id).limit(1);
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
}

// ==========================================
// 1. CARICA PASSEGGIATE ("Vicino a te")
// ==========================================
async function loadPasseggiate() {
    const oggiISO = new Date().toISOString();
    const { data: walks, error } = await supabase
        .from('walks')
        .select('*')
        .gte('data_passeggiata', oggiISO)
        .order('data_passeggiata', { ascending: true })
        .limit(5);

    if (error) {
        walksList.innerHTML = `<p style="color:red; text-align:center;">Errore caricamento.</p>`;
        return;
    }

    if (walks.length === 0) {
        walksList.innerHTML = `<p style="text-align:center; color:#888;">Nessuna passeggiata in programma.</p>`;
        return;
    }

   walksList.innerHTML = "";
    walks.forEach(walk => {
        const dataStr = new Date(walk.data_passeggiata).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        
        // MODIFICA QUI: Abbiamo avvolto la card in un tag <a>
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
}

// ==========================================
// 2. CARICA AMICI ("Gli amici di Milo")
// ==========================================
async function loadAmici() {
    if (!currentPetId) return;

    // Cerca dove il mio cane è pet1 o pet2 e lo status è 'accepted'
    const { data: friendships, error } = await supabase
        .from('pet_friendships')
        .select(`
            passeggiate_insieme,
            pet1:pets!pet1_id(id, nome, avatar_url),
            pet2:pets!pet2_id(id, nome, avatar_url)
        `)
        .or(`pet1_id.eq.${currentPetId},pet2_id.eq.${currentPetId}`)
        .eq('status', 'accepted');

    if (!friendships || friendships.length === 0) return; // Lascia il messaggio vuoto predefinito

    friendsList.innerHTML = "";
    friendships.forEach(f => {
        // Capiamo chi è l'amico (selettore: se pet1 sono io, l'amico è pet2, e viceversa)
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
}

// ==========================================
// 3. GESTIONE NOTIFICHE RICHIESTE AMICIZIA
// ==========================================
async function checkNotificheAmicizia() {
    if (!currentPetId) return;

    // Cerca richieste in attesa dove il MIO cane è il destinatario (pet2_id)
    const { data: pendingRequests } = await supabase
        .from('pet_friendships')
        .select('id, pet1:pets!pet1_id(nome)')
        .eq('pet2_id', currentPetId)
        .eq('status', 'pending');

    const badge = document.getElementById("badgeNotifiche");
    if (pendingRequests && pendingRequests.length > 0) {
        badge.textContent = pendingRequests.length;
        badge.hidden = false;

        // Riempiamo la modale delle notifiche
        const listaNotifiche = document.getElementById("listaNotifiche");
        listaNotifiche.innerHTML = "";
        pendingRequests.forEach(req => {
            listaNotifiche.innerHTML += `
                <div style="background: #F8FAFC; padding: 15px; border-radius: 12px; margin-bottom: 10px;">
                    <p style="margin: 0 0 10px 0;"><strong>${req.pet1.nome}</strong> vuole fare amicizia!</p>
                    <div style="display:flex; gap: 10px;">
                        <button class="btn-primary accetta-btn" data-id="${req.id}" style="padding: 8px; flex:1; font-size:0.9rem;">Accetta</button>
                        <button class="btn-secondary rifiuta-btn" data-id="${req.id}" style="padding: 8px; flex:1; background:#E2E8F0; border:none; border-radius:30px; font-weight:bold;">Rifiuta</button>
                    </div>
                </div>
            `;
        });

        // Eventi bottoni Accetta/Rifiuta
        document.querySelectorAll(".accetta-btn").forEach(btn => {
            btn.addEventListener("click", async (e) => await rispondiAmicizia(e.target.dataset.id, 'accepted'));
        });
        document.querySelectorAll(".rifiuta-btn").forEach(btn => {
            btn.addEventListener("click", async (e) => await rispondiAmicizia(e.target.dataset.id, 'rejected'));
        });
    }
}

async function rispondiAmicizia(friendshipId, nuovoStatus) {
    await supabase.from('pet_friendships').update({ status: nuovoStatus }).eq('id', friendshipId);
    alert(nuovoStatus === 'accepted' ? "Amicizia accettata!" : "Richiesta rifiutata.");
    modalNotifiche.style.display = "none";
    checkNotificheAmicizia();
    loadAmici(); // Ricarica la barra degli amici!
}

// ==========================================
// 4. LOGICA FORM CREA PASSEGGIATA
// ==========================================
document.getElementById("btnApriCreaPasseggiata").addEventListener("click", () => modalCrea.style.display = "flex");
document.querySelectorAll(".close-modal-btn").forEach(btn => btn.addEventListener("click", () => {
    modalCrea.style.display = "none";
    modalNotifiche.style.display = "none";
}));

document.getElementById("btnNotifiche").addEventListener("click", () => modalNotifiche.style.display = "flex");

document.getElementById("formCreaPasseggiata").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.textContent = "Salvataggio...";
    btn.disabled = true;

    const titolo = document.getElementById("walkTitle").value.trim();
    const luogo = document.getElementById("walkLocation").value.trim();
    const dataInput = document.getElementById("walkDate").value;
    const maxCaniInput = document.getElementById("walkMaxDogs").value;

    // FIX: Convertiamo la data in formato ISO string compatibile con Postgres
    const dataFormattata = new Date(dataInput).toISOString();

    // FIX: Convertiamo la stringa del numero in un numero INTERO reale
    const maxCaniFormattato = parseInt(maxCaniInput, 10);

    const { error } = await supabase.from('walks').insert({
        creator_id: currentUser.id,
        titolo: titolo,
        luogo: luogo,
        data_passeggiata: dataFormattata,
        max_animali: maxCaniFormattato
    });
    if (!error) {
        modalCrea.style.display = "none";
        e.target.reset();
        await loadPasseggiate(); // Ricarica la lista!
    } else {
       // Se fallisce, sputa l'errore tecnico esatto nella console dell'ispeziona elemento
        console.error("ERRORE SUPABASE DETTAGLIATO:", error);
        alert("Errore salvataggio: " + error.message);
    }
    btn.textContent = "Pubblica Passeggiata";
    btn.disabled = false;
});

init();