import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, storage: localStorage, autoRefreshToken: true },
});

// Elementi DOM da aggiornare
const userNameDisplay = document.getElementById("userNameDisplay");
const petNameDisplay = document.getElementById("petNameDisplay");
const btnOpenProfile = document.getElementById("btnOpenProfile");
if (btnOpenProfile) {
    btnOpenProfile.addEventListener("click", () => {
        if (currentActivePetId) {
            window.location.href = `profilo-animale.html?petId=${currentActivePetId}`;
        }
    });
}
const qrPetName = document.getElementById("qrPetName");
const agendaContainer = document.getElementById("agendaContainer");
const vaccineStatusContainer = document.getElementById("vaccineStatusContainer"); 
const paginationContainer = document.getElementById("petPaginationDots");
const petImage = document.getElementById("petImage");
const btnAddPet = document.getElementById("btnAddPet");
const btnPrevPet = document.getElementById("btnPrevPet");
const btnNextPet = document.getElementById("btnNextPet");

// Nuove variabili per la gestione dello scorrimento
let userPetsList = [];
let currentPetIndex = 0;
// Elementi per l'upload dell'avatar dalla Dashboard
const dashAvatarWrapper = document.getElementById("dashAvatarWrapper");
const dashboardAvatarUpload = document.getElementById("dashboardAvatarUpload");
const avatarOverlay = document.getElementById("avatarOverlay");

// Variabili globali
let currentActivePetId = null;
let qrChannel = null; // Memorizza l'antenna realtime per poterla spegnere quando cambi animale

// 1. ASCOLTA SESSIONE
supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT" || !session) {
        window.location.href = "login.html"; 
    } else if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
        loadDashboardData(session.user);
    }
});

async function loadDashboardData(user) {
    try {
        // --- 1. CARICA PROFILO UTENTE ---
        const { data: profile } = await supabase.from("profiles").select("nome").eq("id", user.id).single();
        if (profile?.nome) userNameDisplay.textContent = profile.nome;
        
        // --- 2. CARICA TUTTI GLI ANIMALI ---
        const { data: pets, error: petsError } = await supabase
            .from("pets")
            .select("id, nome, avatar_url")
            .eq("owner_id", user.id);

        if (petsError) throw petsError;

        // --- 3. GESTIONE PALLINI E CARD ---
        if (pets && pets.length > 0) {
            userPetsList = pets;

            if (pets.length > 1) {
                if (btnPrevPet) btnPrevPet.classList.remove("hidden");
                if (btnNextPet) btnNextPet.classList.remove("hidden");
            } else {
                if (btnPrevPet) btnPrevPet.classList.add("hidden");
                if (btnNextPet) btnNextPet.classList.add("hidden");
            }
            if (paginationContainer) paginationContainer.innerHTML = ''; 
            
            if (pets.length > 1) {
                pets.forEach((pet, index) => {
                    const dot = document.createElement("span");
                    dot.className = index === 0 ? "dot active" : "dot"; 
                    dot.addEventListener("click", () => updateHeroCard(pet, index)); 
                    if (paginationContainer) paginationContainer.appendChild(dot);
                });
            }

            // Carica i dati del primo animale di default (questo attiverà anche l'antenna QR!)
            updateHeroCard(pets[0], 0);

        } else {
            userPetsList = [];
            if (btnPrevPet) btnPrevPet.classList.add("hidden");
            if (btnNextPet) btnNextPet.classList.add("hidden");
            if (petNameDisplay) petNameDisplay.textContent = "Nessun animale";
            if (btnOpenProfile) btnOpenProfile.innerHTML = `Aggiungi un cucciolo <i class="fa-solid fa-plus"></i>`;
            if (qrPetName) qrPetName.textContent = "tuo animale";
            if (vaccineStatusContainer) vaccineStatusContainer.innerHTML = "Nessun dato medico registrato.";
            if (petImage) petImage.src = "assets/default-pet.png";
            if (paginationContainer) paginationContainer.innerHTML = "";
            currentActivePetId = null;
            
            if (agendaContainer) {
                agendaContainer.innerHTML = '<p style="text-align:center; color:#888; padding: 1rem;">Nessun impegno in programma.</p>';
            }
            return;
        }

        // --- 4. CARICA I PROSSIMI IMPEGNI (Agenda Orizzontale) ---
        if (agendaContainer) agendaContainer.innerHTML = ''; 

        const oggi = new Date();
        oggi.setHours(0, 0, 0, 0);
        const oggiISO = oggi.toISOString();

        // Appuntamenti
        const { data: appuntamenti, error: appError } = await supabase
            .from("appointments")
            .select("id, data_inizio, provider_id")
            .eq("owner_id", user.id)
            .gte("data_inizio", oggiISO)
            .order("data_inizio", { ascending: true })
            .limit(1);

        if (appError) {
            console.error("ERRORE DATABASE:", appError);
            if (agendaContainer) agendaContainer.innerHTML = `<p style="color:red; text-align:center; padding:10px;">Errore DB: ${appError.message}</p>`;
            return;
        }

        // Passeggiate
        const { data: partecipazioni } = await supabase
            .from("walk_participants")
            .select(`walks ( id, luogo, data_passeggiata )`)
            .eq("owner_id", user.id);

        let passeggiate = [];
        if (partecipazioni && partecipazioni.length > 0) {
            const passeggiateFuture = partecipazioni
                .map(p => p.walks)
                .filter(w => w && w.data_passeggiata >= oggiISO)
                .sort((a, b) => new Date(a.data_passeggiata) - new Date(b.data_passeggiata));

            if (passeggiateFuture.length > 0) {
                passeggiate = [passeggiateFuture[0]]; 
            }
        }

        let nuovoHTML = '';

        if (appuntamenti && appuntamenti.length > 0) {
            const apt = appuntamenti[0];
            const dataFormattata = formattaData(apt.data_inizio);
            const dottore = apt.provider?.cognome ? `Dott.ssa/Dott. ${apt.provider.cognome}` : "Veterinario";

            nuovoHTML += `
                <div class="agenda-card">
                    <div class="agenda-icon icon-orange">
                        <i class="fa-solid fa-shield-halved"></i>
                    </div>
                    <div class="agenda-info">
                        <div class="agenda-title">Controllo veterinario <span>></span></div>
                        <div class="agenda-desc">${dataFormattata} – ${dottore}</div>
                    </div>
                </div>
            `;
        }

        if (passeggiate && passeggiate.length > 0) {
            const pass = passeggiate[0];
            const dataFormattata = formattaData(pass.data_passeggiata);

            nuovoHTML += `
                <div class="agenda-card">
                    <div class="agenda-icon icon-blue">
                        <i class="fa-solid fa-tree"></i>
                    </div>
                    <div class="agenda-info">
                        <div class="agenda-title">Passeggiata ${pass.luogo} <span>></span></div>
                        <div class="agenda-desc">${dataFormattata}</div>
                    </div>
                </div>
            `;
        }

        if (nuovoHTML === '') {
            nuovoHTML = '<p style="text-align:center; color:#888; padding: 1rem;">Nessun impegno in programma per i prossimi giorni.</p>';
        }

        if (agendaContainer) {
            agendaContainer.innerHTML = nuovoHTML;
        }

    } catch (error) {
        console.error("Errore in loadDashboardData:", error);
        if (agendaContainer) agendaContainer.innerHTML = '<p style="text-align:center; color:red; padding: 1rem;">Errore nel caricamento dei dati.</p>';
    }
}

// ==========================================
// FUNZIONE PER AGGIORNARE LA HERO CARD
// ==========================================
async function updateHeroCard(pet, index) {
    currentActivePetId = pet.id;
    currentPetIndex = index; 

    localStorage.setItem("activePetId", currentActivePetId);

    // ATTIVA L'ASCOLTO DELLE NOTIFICHE QR PER QUESTO ANIMALE!
    attivaAscoltoNotificheQR(currentActivePetId);

    if (petNameDisplay) petNameDisplay.textContent = pet.nome;
    if (btnOpenProfile) btnOpenProfile.innerHTML = `Apri la scheda <i class="fa-solid fa-paw"></i>`;
    if (qrPetName) qrPetName.textContent = pet.nome;

    if (petImage) {
        if (pet.avatar_url) {
            const { data } = supabase.storage.from('avatars').getPublicUrl(pet.avatar_url);
            petImage.src = data.publicUrl;
        } else {
            petImage.src = "assets/default-pet.png"; 
        }
    }

    if (paginationContainer) {
        const dots = paginationContainer.querySelectorAll(".dot");
        if (dots.length > 0) {
            dots.forEach(d => d.classList.remove("active"));
            if (dots[index]) dots[index].classList.add("active");
        }
    }

    if (vaccineStatusContainer) {
        vaccineStatusContainer.innerHTML = "Caricamento..."; 
        
        const { data: lastVaccineRecord, error: recordError } = await supabase
            .from("medical_records")
            .select("prossimo_richiamo")
            .eq("pet_id", pet.id)
            .not("prossimo_richiamo", "is", null) 
            .order("id", { ascending: false })
            .limit(1)
            .maybeSingle();

        if (recordError) console.error("Errore recupero richiamo:", recordError);

        if (lastVaccineRecord && lastVaccineRecord.prossimo_richiamo) {
            const dataRichiamo = new Date(lastVaccineRecord.prossimo_richiamo);
            const oggi = new Date();
            const differenzaTempo = dataRichiamo - oggi;
            const giorniRimasti = Math.ceil(differenzaTempo / (1000 * 60 * 60 * 24));
            
            if (giorniRimasti > 0) {
                vaccineStatusContainer.innerHTML = `Il prossimo richiamo vaccinale è tra <strong>${giorniRimasti}</strong> giorni.`;
            } else if (giorniRimasti === 0) {
                vaccineStatusContainer.innerHTML = "Il richiamo vaccinale è <strong>oggi</strong>!";
            } else {
                vaccineStatusContainer.innerHTML = "<span style='color: #D32F2F; font-weight: bold;'>Richiamo vaccinale scaduto!</span>";
            }
        } else {
            vaccineStatusContainer.innerHTML = "Nessun dato medico registrato.";
        }
    }
}

// ==========================================
// UPLOAD AVATAR INLINE DALLA DASHBOARD
// ==========================================
if (dashAvatarWrapper && dashboardAvatarUpload) {
    dashAvatarWrapper.addEventListener("click", () => {
        if (currentActivePetId) dashboardAvatarUpload.click();
    });

    dashboardAvatarUpload.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file || !currentActivePetId) return;

        if (avatarOverlay) avatarOverlay.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${currentActivePetId}-${Date.now()}.${fileExt}`;
            
            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(fileName, file);

            if (uploadError) throw uploadError;

            const { error: dbError } = await supabase
                .from('pets')
                .update({ avatar_url: uploadData.path })
                .eq('id', currentActivePetId);

            if (dbError) throw dbError;

            const { data } = supabase.storage.from('avatars').getPublicUrl(uploadData.path);
            petImage.src = data.publicUrl;

        } catch (error) {
            console.error("Errore durante l'upload:", error);
            alert("Impossibile caricare la foto. Riprova.");
        } finally {
            if (avatarOverlay) avatarOverlay.innerHTML = '<i class="fa-solid fa-camera"></i>';
        }
    });
}

// ==========================================
// FUNZIONE DI UTILITÀ FORMATTAZIONE DATA
// ==========================================
function formattaData(isoString) {
    const data = new Date(isoString);
    const opzioniGiorno = { day: 'numeric', month: 'long' };
    const giornoStr = data.toLocaleDateString('it-IT', opzioniGiorno);
    const oreStr = data.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    return `${giornoStr} · ore ${oreStr}`;
}

// ==========================================
// INTERATTIVITÀ DEI BOTTONI E NAVIGAZIONE
// ==========================================
if (btnAddPet) {
    btnAddPet.addEventListener("click", () => window.location.href = "aggiungi-animale.html");
}

if (btnOpenProfile) {
    btnOpenProfile.addEventListener("click", () => window.location.href = "profilo-animale.html");
}

const btnVetSubito = document.getElementById("btnVetSubito");
if (btnVetSubito) btnVetSubito.addEventListener("click", () => alert("Avvio ricerca veterinari urgenti..."));

const btnMostraQR = document.getElementById("btnMostraQR");
if (btnMostraQR) {
    btnMostraQR.addEventListener("click", () => {
        if (currentActivePetId) {
            window.location.href = `qr-pets.html?petId=${currentActivePetId}`;
        } else {
            window.location.href = "qr-pets.html"; 
        }
    });
}

const btnPrenota = document.getElementById("btnPrenota");
if (btnPrenota) btnPrenota.addEventListener("click", () => window.location.href = "cerca.html");

const btnPasseggiata = document.getElementById("btnPasseggiata");
if (btnPasseggiata) btnPasseggiata.addEventListener("click", () => window.location.href = "passeggiate.html");

const btnShop = document.getElementById("btnShop");
if (btnShop) btnShop.addEventListener("click", () => alert("Shop Veterinario in sviluppo..."));

const btnMercatino = document.getElementById("btnMercatino");
if (btnMercatino) btnMercatino.addEventListener("click", () => window.location.href = "mercatino.html");

// SCORRIMENTO ANIMALI TRAMITE FRECCE
if (btnPrevPet) {
    btnPrevPet.addEventListener("click", () => {
        if (userPetsList.length > 1) {
            const newIndex = (currentPetIndex - 1 + userPetsList.length) % userPetsList.length;
            updateHeroCard(userPetsList[newIndex], newIndex);
        }
    });
}

if (btnNextPet) {
    btnNextPet.addEventListener("click", () => {
        if (userPetsList.length > 1) {
            const newIndex = (currentPetIndex + 1) % userPetsList.length;
            updateHeroCard(userPetsList[newIndex], newIndex);
        }
    });
}

// ========================================================
// REATIME: ASCOLTO RICHIESTE DI ACCESSO QR IN TEMPO REALE
// ========================================================
function attivaAscoltoNotificheQR(activePetId) {
    if (!activePetId) return;

    // Se c'è già un canale aperto (perché abbiamo cambiato animale), lo chiudiamo prima
    if (qrChannel) {
        supabase.removeChannel(qrChannel);
    }

    qrChannel = supabase
        .channel(`ascolto-qr-${activePetId}`)
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'pet_access_requests',
                filter: `pet_id=eq.${activePetId}`
            },
            async (payload) => {
                const richiestaInArrivo = payload.new;

                if (richiestaInArrivo.status === 'pending') {
                    // Cerca il nome del vet
                    const { data: vet } = await supabase
                        .from('profiles')
                        .select('nome')
                        .eq('id', richiestaInArrivo.veterinarian_id)
                        .single();
                    
                    const nomeVet = vet ? vet.nome : "Un veterinario";
                    mostraPopupApprovazione(nomeVet, richiestaInArrivo.id);
                }
            }
        )
        .subscribe();
}

window.rispondiAllaRichiesta = async function(idRichiesta, sceltaUtente) {
    const { error } = await supabase
        .from('pet_access_requests')
        .update({ status: sceltaUtente })
        .eq('id', idRichiesta);

    if (!error) {
        nascondiPopupApprovazione();
    } else {
        alert("Errore di connessione. Riprova.");
    }
};

// --- CREAZIONE GRAFICA DEL POPUP AUTOMATICO ---
function mostraPopupApprovazione(nomeVet, idRichiesta) {
    // Evita di creare due popup uguali
    if (document.getElementById("qr-auth-popup")) return;

    const popupHTML = `
        <div id="qr-auth-popup" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 9999; backdrop-filter: blur(4px);">
            <div style="background: white; padding: 25px; border-radius: 20px; width: 90%; max-width: 350px; text-align: center; box-shadow: 0 10px 25px rgba(0,0,0,0.2);">
                <div style="background: #FFF7ED; color: #F58220; width: 60px; height: 60px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 24px; margin: 0 auto 15px;">
                    <i class="fa-solid fa-qrcode"></i>
                </div>
                <h3 style="margin: 0 0 10px; color: #1E293B; font-size: 1.2rem;">Richiesta di Accesso</h3>
                <p style="color: #64748B; font-size: 0.95rem; margin-bottom: 25px; line-height: 1.4;">
                    <strong>${nomeVet}</strong> ha scansionato la medaglietta. Vuoi consentire l'accesso alla cartella clinica?
                </p>
                <div style="display: flex; gap: 10px;">
                    <button onclick="rispondiAllaRichiesta('${idRichiesta}', 'rejected')" style="flex: 1; padding: 12px; border-radius: 12px; border: 1px solid #E2E8F0; background: white; color: #64748B; font-weight: bold; cursor: pointer;">Rifiuta</button>
                    <button onclick="rispondiAllaRichiesta('${idRichiesta}', 'approved')" style="flex: 1; padding: 12px; border-radius: 12px; border: none; background: #059669; color: white; font-weight: bold; cursor: pointer; box-shadow: 0 4px 12px rgba(5, 150, 105, 0.2);">Consenti</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML("beforeend", popupHTML);
}

function nascondiPopupApprovazione() {
    const popup = document.getElementById("qr-auth-popup");
    if (popup) popup.remove();
}