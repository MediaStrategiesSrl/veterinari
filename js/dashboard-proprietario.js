// 1. IMPORT CENTRALIZZATI
// ==========================================
// Assicurati che i percorsi puntino alla cartella corretta (es. ../utils/)
import { supabase } from '../utils/supabaseClient.js';
import { logError } from '../utils/logger.js';


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
        window.location.href = "index.html"; 
    } else if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
        loadDashboardData(session.user);
    }
});

async function loadDashboardData(user) {
    try {
        // --- 1. CARICA PROFILO UTENTE ---
        const { data: profile } = await supabase.from("profiles").select("nome, avatar_url").eq("id", user.id).single();
        if (profile?.nome) userNameDisplay.textContent = profile.nome;
        
        // --- FIX STORAGE PROFILO UTENTE (se esiste l'elemento profAvatar nel DOM) ---
        const profAvatar = document.getElementById('profAvatar');
        if (profile?.avatar_url && profAvatar) {
            const { data } = supabase.storage.from('storage_veterinari').getPublicUrl(profile.avatar_url);
            profAvatar.src = data.publicUrl;
        }
        
        // --- 2. CARICA TUTTI GLI ANIMALI ---
        const { data: pets, error: petsError } = await supabase
            .from("pets")
            .select("id, nome, avatar_url")
            .eq("owner_id", user.id);

        if (petsError) throw Object.assign(new Error(petsError.message), { code: petsError.code || 'DB_PETS_FETCH_ERROR' });

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
            await logError({
                source: 'frontend_dashboard_proprietario',
                action: 'load_agenda',
                errorMessage: appError.message,
                errorCode: appError.code || 'DB_AGENDA_FETCH_ERROR',
                context: { user_id: user.id }
            });
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
        await logError({
            source: 'frontend_dashboard_proprietario',
            action: 'load_dashboard_data',
            errorMessage: error.message,
            errorCode: error.code || 'UNKNOWN_ERROR',
            stackTrace: error.stack,
            context: { user_id: user?.id }
        });
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

    // --- FIX STORAGE ANIMALE ---
    if (petImage) {
        if (pet.avatar_url) {
            const { data } = supabase.storage.from('storage_veterinari').getPublicUrl(pet.avatar_url);
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
        vaccineStatusContainer.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Caricamento...'; 
        
        // 1. Peschiamo l'ultima visita dalla cartella clinica usando 'created_at' e 'motivo'
        const { data: ultimaVisita, error: recordError } = await supabase
            .from("medical_records")
            .select("*")
            .eq("pet_id", pet.id)
            .order("id", { ascending: false }) // Prende la più recente
            .limit(1)
            .maybeSingle();

        if (recordError) {
            console.error("❌ ERRORE SUPABASE:", recordError.message);
            await logError({
                source: 'frontend_dashboard_proprietario',
                action: 'load_last_visit',
                errorMessage: recordError.message,
                errorCode: recordError.code || 'DB_RECORD_FETCH_ERROR',
                context: { pet_id: pet.id }
            });
        }

        if (ultimaVisita) {
            // 3. Prendiamo il motivo (o la diagnosi se il motivo è vuoto) e lo tagliamo a 30 caratteri
            let motivoTesto = ultimaVisita.motivo || ultimaVisita.diagnosi || "Controllo generale";
            if (motivoTesto.length > 30) motivoTesto = motivoTesto.substring(0, 30) + '...';

            // 4. Stampiamo il risultato nella card arancione
            vaccineStatusContainer.innerHTML = `<i class="fa-solid fa-stethoscope"></i> Ultima visita: <span style="color:#64748B;">${motivoTesto}</span>`;
            
        } else {
            // Se non c'è davvero nessuna visita nel DB per questo cane
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
            
            // --- FIX STORAGE UPLOAD (Aggiunta cartella pets_avatar/) ---
            const filePath = `pets_avatar/${fileName}`;
            
            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('storage_veterinari')
                .upload(filePath, file);

            if (uploadError) throw Object.assign(new Error(uploadError.message), { code: uploadError.code || 'STORAGE_UPLOAD_ERROR' });

            const { error: dbError } = await supabase
                .from('pets')
                .update({ avatar_url: uploadData.path })
                .eq('id', currentActivePetId);

            if (dbError) throw Object.assign(new Error(dbError.message), { code: dbError.code || 'DB_PET_UPDATE_ERROR' });

            const { data } = supabase.storage.from('storage_veterinari').getPublicUrl(uploadData.path);
            petImage.src = data.publicUrl;

        } catch (error) {
            console.error("Errore durante l'upload:", error);
            await logError({
                source: 'frontend_dashboard_proprietario',
                action: 'upload_avatar',
                errorMessage: error.message,
                errorCode: error.code || 'AVATAR_UPLOAD_ERROR',
                stackTrace: error.stack,
                context: { pet_id: currentActivePetId }
            });
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
                    const idVet = richiestaInArrivo.veterinarian_id; 

                    const { data: vet, error: vetError } = await supabase
                        .from('profiles')
                        .select(`
                            nome,
                            cognome,
                            veterinarians (
                                numero_ordine,
                                indirizzo_clinica
                            )
                        `)
                        .eq('id', idVet) 
                        .single();
                    
                    if (vetError) {
                        console.error("❌ ERRORE LETTURA DATI VET:", vetError.message);
                        await logError({
                            source: 'frontend_dashboard_proprietario',
                            action: 'read_vet_qr_request',
                            errorMessage: vetError.message,
                            errorCode: vetError.code || 'DB_VET_FETCH_ERROR',
                            context: { vet_id: idVet }
                        });
                    }
                    
                    // 1. Estraiamo i dati del veterinario in modo sicuro
                    // (Supabase potrebbe restituire un array o un oggetto singolo, li gestiamo entrambi)
                    let vDati = null;
                    if (vet && vet.veterinarians) {
                        vDati = Array.isArray(vet.veterinarians) ? vet.veterinarians[0] : vet.veterinarians;
                    }

                    // 2. Creiamo i testi dinamici
                    const nomeCompleto = vet ? `Dott. ${vet.nome} ${vet.cognome || ''}` : "Veterinario";
                    
                    // Sostituiamo "Medico veterinario verificato" con il numero dell'ordine
                    const dettagliOrdine = vDati && vDati.numero_ordine
                        ? `Ordine n. ${vDati.numero_ordine}` 
                        : "Ordine in aggiornamento";
                        
                    // Inseriamo l'indirizzo vero
                    const indirizzo = vDati && vDati.indirizzo_clinica
                        ? vDati.indirizzo_clinica 
                        : "Indirizzo non specificato";

                    // 3. Lanciamo la modale
                    mostraPopupApprovazione(nomeCompleto, dettagliOrdine, indirizzo, richiestaInArrivo.id);
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
        console.error(error);
        await logError({
            source: 'frontend_dashboard_proprietario',
            action: 'answer_qr_request',
            errorMessage: error.message,
            errorCode: error.code || 'DB_QR_UPDATE_ERROR',
            context: { request_id: idRichiesta, status: sceltaUtente }
        });
        alert("Errore di connessione. Riprova.");
    }
};

// ========================================================
// UI: VIEW A SCHERMO INTERO DINAMICA (Mockup)
// ========================================================
function mostraPopupApprovazione(nomeVet, dettagliOrdine, indirizzo, idRichiesta) {
    // Evita doppioni
    if (document.getElementById("qr-auth-fullscreen")) return;

    const popupHTML = `
        <div id="qr-auth-fullscreen" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background-color: #FAF8F5; z-index: 10000; display: flex; flex-direction: column; font-family: 'Inter', sans-serif; overflow-y: auto;">
            
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 20px;">
                <button onclick="nascondiPopupApprovazione()" style="background: none; border: none; font-size: 20px; cursor: pointer; color: #1E293B;"><i class="fa-solid fa-chevron-left"></i></button>
                <div style="text-align: center;">
                    <h2 style="margin: 0; font-size: 1.2rem; color: #1E293B;">Richiesta di accesso</h2>
                    <p style="margin: 2px 0 0; font-size: 0.85rem; color: #94A3B8;">Nuovo veterinario</p>
                </div>
                <div style="width: 40px; height: 40px; background: white; border-radius: 50%; display: flex; justify-content: center; align-items: center; box-shadow: 0 2px 5px rgba(0,0,0,0.05); color: #1E293B;">
                    <i class="fa-solid fa-diamond"></i>
                </div>
            </div>

            <div style="margin: 10px 20px; background: linear-gradient(135deg, #41AECF, #2E8CAE); border-radius: 20px; padding: 25px; color: white; box-shadow: 0 10px 20px rgba(65, 174, 207, 0.2);">
                <div style="background: rgba(255,255,255,0.3); display: inline-block; padding: 4px 10px; border-radius: 8px; font-size: 0.7rem; font-weight: bold; letter-spacing: 0.5px; margin-bottom: 15px;">
                    IDENTITÀ VERIFICATA
                </div>
                <h1 style="margin: 0 0 10px; font-size: 1.8rem;">${nomeVet}</h1>
                <p style="margin: 0 0 5px; font-size: 0.9rem; opacity: 0.9;">Medico veterinario &middot; ${dettagliOrdine}</p>
                <p style="margin: 0; font-size: 0.9rem; opacity: 0.9;">Studio temporaneo: ${indirizzo}</p>
            </div>

            <div style="padding: 20px;">
                <h3 style="margin: 0 0 15px; font-size: 1.1rem; color: #1E293B;">Dati richiesti</h3>
                
                <div style="display: flex; align-items: center; background: white; padding: 15px; border-radius: 16px; margin-bottom: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.03);">
                    <div style="width: 50px; height: 50px; background: #FFF7ED; color: #F58220; border-radius: 12px; display: flex; justify-content: center; align-items: center; font-size: 20px; margin-right: 15px;">
                        <i class="fa-solid fa-plus"></i>
                    </div>
                    <div style="flex: 1;">
                        <h4 style="margin: 0 0 4px; font-size: 1rem; color: #1E293B;">Cartella clinica completa</h4>
                        <p style="margin: 0; font-size: 0.8rem; color: #94A3B8;">Visite, diagnosi, terapie e allegati</p>
                    </div>
                    <i class="fa-solid fa-chevron-right" style="color: #CBD5E1; font-size: 0.9rem;"></i>
                </div>

                <div style="display: flex; align-items: center; background: white; padding: 15px; border-radius: 16px; margin-bottom: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.03);">
                    <div style="width: 50px; height: 50px; background: #F0F9FA; color: #41AECF; border-radius: 12px; display: flex; justify-content: center; align-items: center; font-size: 20px; margin-right: 15px;">
                        <i class="fa-solid fa-clover"></i>
                    </div>
                    <div style="flex: 1;">
                        <h4 style="margin: 0 0 4px; font-size: 1rem; color: #1E293B;">Storico attività</h4>
                        <p style="margin: 0; font-size: 0.8rem; color: #94A3B8;">Appuntamenti e passeggiate</p>
                    </div>
                    <i class="fa-solid fa-chevron-right" style="color: #CBD5E1; font-size: 0.9rem;"></i>
                </div>

                <div style="display: flex; align-items: center; background: white; padding: 15px; border-radius: 16px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.03);">
                    <div style="width: 50px; height: 50px; background: #FFF7ED; color: #F58220; border-radius: 12px; display: flex; justify-content: center; align-items: center; font-size: 20px; margin-right: 15px;">
                        <i class="fa-solid fa-square"></i>
                    </div>
                    <div style="flex: 1;">
                        <h4 style="margin: 0 0 4px; font-size: 1rem; color: #1E293B;">Documenti dell'animale</h4>
                        <p style="margin: 0; font-size: 0.8rem; color: #94A3B8;">Microchip, passaporto, assicurazione</p>
                    </div>
                    <i class="fa-solid fa-chevron-right" style="color: #CBD5E1; font-size: 0.9rem;"></i>
                </div>

                <p style="font-size: 0.8rem; color: #94A3B8; line-height: 1.5; margin-bottom: 30px;">
                    L'autorizzazione resterà valida fino alla revoca. Ogni consultazione e modifica sarà registrata.
                </p>

                <div style="display: flex; gap: 15px; padding-bottom: 20px;">
                    <button onclick="rispondiAllaRichiesta('${idRichiesta}', 'rejected')" style="flex: 1; padding: 16px; border-radius: 16px; border: 2px solid #E2E8F0; background: transparent; color: #1E293B; font-weight: bold; font-size: 1rem; cursor: pointer;">Rifiuta</button>
                    <button onclick="rispondiAllaRichiesta('${idRichiesta}', 'approved')" style="flex: 1; padding: 16px; border-radius: 16px; border: none; background: #F58220; color: white; font-weight: bold; font-size: 1rem; cursor: pointer; box-shadow: 0 4px 12px rgba(245, 130, 32, 0.2);">Conferma accesso</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML("beforeend", popupHTML);
}

window.nascondiPopupApprovazione = function() {
    const popup = document.getElementById("qr-auth-fullscreen");
    if (popup) popup.remove();
}