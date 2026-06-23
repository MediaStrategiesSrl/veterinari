// Importa libreria Supabase per autenticazione
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

// Inizializza client Supabase con credenziali e memorizzazione della sessione
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        persistSession: true,
        storage: localStorage,
        autoRefreshToken: true,
    },
});

// Elementi DOM - Dashboard Home
const username = document.getElementById("username");
const petNameDisplay = document.getElementById("petNameDisplay");
const petSpecieDisplay = document.getElementById("petSpecieDisplay"); 
const logoutBtn = document.getElementById("logoutBtn"); 

// Elementi DOM - Gestione Sezioni (SPA)
const navHome = document.getElementById("navHome");
const navAnimals = document.getElementById("navAnimals");
const homeSection = document.getElementById("homeSection");
const animalsSection = document.getElementById("animalsSection");

// Azioni rapide (con controllo per evitare errori se i bottoni non esistono)
const actionVetBtn = document.getElementById("actionVet");
if (actionVetBtn) actionVetBtn.addEventListener("click", () => alert("Chiamata al veterinario in corso..."));

const actionQrBtn = document.getElementById("actionQr");
if (actionQrBtn) actionQrBtn.addEventListener("click", () => alert("Apertura QR Code..."));

// ==========================================
// 1. ASCOLTATORE DELLO STATO DI AUTENTICAZIONE
// ==========================================
supabase.auth.onAuthStateChange((event, session) => {
    console.log("Auth Event:", event, "Session:", session);
    
    if (event === "SIGNED_OUT" || !session) {
        console.warn("Sessione non valida o utente sloggato. Reindirizzo al login.");
        window.location.href = "login.html"; 
    } else if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
        // La sessione è solida e pronta, carichiamo i dati
        checkSessionAndLoadData(session.user);
    }
});

// ==========================================
// 2. CONTROLLO RUOLO E CARICAMENTO DATI
// ==========================================
async function checkSessionAndLoadData(user) {
    // CONTROLLO SICUREZZA: L'utente ha il ruolo corretto?
    const { data: userRole, error: roleError } = await supabase
        .from("user_roles")
        .select("role_id, roles(nome)") // Usiamo "nome" come dal tuo schema DB corretto
        .eq("user_id", user.id)
        .maybeSingle(); 

    console.log("Dashboard user role check:", userRole, roleError);

    if (roleError) {
        console.error("Errore durante il controllo del ruolo utente:", roleError);
        window.location.href = "login.html";
        return;
    }

    // Estrapoliamo il nome dall'oggetto relazionale
    const roleName = userRole?.roles?.nome;

    if (!roleName) {
        console.warn("Utente senza ruolo assegnato. Reindirizzo a completeprofile.");
        window.location.href = "completeprofile.html";
        return;
    }

    if (roleName !== "proprietario") {
        console.warn("Accesso negato: questo utente non è un proprietario.");
        if (roleName === "veterinario") {
            window.location.href = "dashboard-veterinario.html";
        } else {
            window.location.href = "login.html";
        }
        return;
    }

    // RECUPERO DATI PROFILO E PET
    try {
        const { data: profileData, error: profileError } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", user.id)
            .single();

        if (profileError) throw profileError;
        
        // Manteniamo la "N" maiuscola per Nome
        if (username && profileData.nome) {
            username.textContent = profileData.nome; 
        }

        const { data: pet, error: petError } = await supabase
            .from("pets")
            .select("nome, specie")
            .eq("owner_id", user.id)
            .maybeSingle(); 

        if (petError) throw petError;

        if (pet) {
            if (petNameDisplay) petNameDisplay.textContent = pet.nome;
            if (petSpecieDisplay) petSpecieDisplay.textContent = `Tipo: ${pet.specie}`;
            if (document.getElementById("detailPetName")) {
                document.getElementById("detailPetName").textContent = pet.nome;
            }
        } else {
            if (petNameDisplay) petNameDisplay.textContent = "Nessun animale";
            if (petSpecieDisplay) petSpecieDisplay.textContent = "Aggiungi un cucciolo dal profilo";
        }

    } catch (error) {
        console.error("Errore nel caricamento dei dati della dashboard:", error.message);
    }
}

// ==========================================
// 3. GESTIONE CAMBIO TAB (SPA)
// ==========================================
if (navAnimals && navHome) {
    navAnimals.addEventListener("click", (e) => {
        e.preventDefault();
        navHome.classList.remove("active");
        navAnimals.classList.add("active");
        homeSection.classList.add("hidden");
        animalsSection.classList.remove("hidden");
    });

    navHome.addEventListener("click", (e) => {
        e.preventDefault();
        navAnimals.classList.remove("active");
        navHome.classList.add("active");
        animalsSection.classList.add("hidden");
        homeSection.classList.remove("hidden");
    });
}

// ==========================================
// 4. GESTIONE LOGOUT
// ==========================================
if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
        const { error } = await supabase.auth.signOut();
        if (error) {
            console.error("Errore durante il logout:", error.message);
        }
        // Il reindirizzamento verrà gestito in automatico dall'onAuthStateChange
    });
}