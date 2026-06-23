import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Elementi DOM
const navHome = document.getElementById("navHome");
const navAgenda = document.getElementById("navAgenda");
const homeSection = document.getElementById("homeSection");
const agendaSection = document.getElementById("agendaSection");
const urgencyToggle = document.getElementById("urgencyToggle");
const agendaList = document.getElementById("agendaList");
const currentDateDisplay = document.getElementById("currentDateDisplay");
const logoutBtn = document.getElementById("logoutBtn");

let currentUser = null;

// Formatta la data di oggi (es. "10 giugno")
const options = { day: 'numeric', month: 'long' };
currentDateDisplay.textContent = new Date().toLocaleDateString('it-IT', options);

// ==========================================
// 1. AUTENTICAZIONE
// ==========================================
supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === "SIGNED_OUT" || !session) {
        window.location.href = "login.html";
        return;
    }

    currentUser = session.user;

    // Verifica ruolo veterinario
    const { data: userRole, error: roleError } = await supabase
        .from("user_roles")
        .select("role_id, roles(nome)")
        .eq("user_id", currentUser.id)
        .maybeSingle();

    if (roleError || !userRole || userRole.roles.nome !== "veterinario") {
        window.location.href = "login.html";
        return;
    }

    // Se è tutto ok, carica i dati dinamici!
    loadUrgencyStatus();
    loadAgenda();
});

// ==========================================
// 2. CHIAMATE API DINAMICHE
// ==========================================

// A. Carica e gestisci lo Switch Urgenze
async function loadUrgencyStatus() {
    const { data: vetData, error } = await supabase
        .from("veterinarians")
        .select("is_available_now")
        .eq("user_id", currentUser.id)
        .single();

    if (!error && vetData) {
        urgencyToggle.checked = vetData.is_available_now;
    }
}

urgencyToggle.addEventListener("change", async (e) => {
    const isAvailable = e.target.checked;
    urgencyToggle.disabled = true;

    const { error } = await supabase
        .from("veterinarians")
        .update({ is_available_now: isAvailable })
        .eq("user_id", currentUser.id);

    if (error) {
        console.error("Errore aggiornamento:", error);
        urgencyToggle.checked = !isAvailable; 
    }
    urgencyToggle.disabled = false;
});

// B. Carica Appuntamenti e costruisci le card dinamicamente
async function loadAgenda() {
    // Sostituisci 'visite' con il nome reale della tua tabella
    const { data: appuntamenti, error } = await supabase
        .from('visite') 
        .select(`id, orario, stato, motivo, luogo, pets (nome)`)
        .eq('veterinario_id', currentUser.id)
        .order('orario', { ascending: true });

    if (error) {
        agendaList.innerHTML = `<p style="text-align:center; color:red;">Errore caricamento</p>`;
        return;
    }

    agendaList.innerHTML = ''; // Svuota il contenitore

    if (!appuntamenti || appuntamenti.length === 0) {
        agendaList.innerHTML = `<p style="text-align:center; color:#888;">Nessun appuntamento per oggi.</p>`;
        return;
    }

    // Costruisci le card inserendoci dentro i dati reali
    appuntamenti.forEach(visita => {
        let borderClass = "border-orange"; 
        if (visita.stato === "PROSSIMO") borderClass = "border-blue";

        const orario = new Date(visita.orario).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const nomePet = visita.pets ? visita.pets.nome : "Sconosciuto";

        const card = document.createElement("div");
        card.className = `agenda-card ${borderClass}`;
        
        card.innerHTML = `
            <div class="status-indicator">${orario} · ${visita.stato || ''}</div>
            <h4>${nomePet} · ${visita.motivo}</h4>
            <p>${visita.luogo || 'Sede clinica'}</p>
        `;
        agendaList.appendChild(card);
    });
}

// ==========================================
// 3. NAVIGAZIONE TAB
// ==========================================
function switchTab(activeNav, activeSection) {
    document.querySelectorAll(".nav-item").forEach(el => el.classList.remove("active"));
    homeSection.classList.add("hidden");
    agendaSection.classList.add("hidden");

    activeNav.classList.add("active");
    activeSection.classList.remove("hidden");
}

navHome.addEventListener("click", (e) => { e.preventDefault(); switchTab(navHome, homeSection); });
navAgenda.addEventListener("click", (e) => { e.preventDefault(); switchTab(navAgenda, agendaSection); });

// ==========================================
// 4. LOGOUT
// ==========================================
logoutBtn.addEventListener("click", async () => {
    await supabase.auth.signOut();
});