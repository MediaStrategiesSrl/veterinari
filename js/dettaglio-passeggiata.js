import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let currentPetId = null;
let currentWalkId = null;

async function init() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = "login.html"; return; }
    currentUser = user;

    // 1. Prendi l'ID della passeggiata dall'URL (es: dettaglio-passeggiata.html?id=123)
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
}

async function checkPartecipazione() {
    if (!currentPetId) return;
    const { data } = await supabase.from('walk_participants').select('id').eq('walk_id', currentWalkId).eq('pet_id', currentPetId).single();
    
    const btn = document.getElementById("btnPartecipa");
    if (data) {
        btn.textContent = "Iscritto!";
        btn.disabled = true;
        btn.style.background = "#10B981"; // Verde successo
    }
}

// BOTTONE PARTECIPA
document.getElementById("btnPartecipa").addEventListener("click", async (e) => {
    e.target.textContent = "Iscrizione...";
    e.target.disabled = true;

    const { error } = await supabase.from('walk_participants').insert({
        walk_id: currentWalkId,
        pet_id: currentPetId,
        owner_id: currentUser.id
    });

    if (!error) {
        e.target.textContent = "Iscritto!";
        e.target.style.background = "#10B981";
        loadWalkDetails(); // Aggiorna il numerino dei partecipanti
    } else {
        alert("Errore durante l'iscrizione.");
        e.target.disabled = false;
    }
});

init();