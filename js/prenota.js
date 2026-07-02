import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ID presi dall'URL e Sessione
const urlParams = new URLSearchParams(window.location.search);
// CORREZIONE CHIAVE: Ora cerchiamo il nome esatto che abbiamo inviato!
const vetId = urlParams.get('user_id'); 
let currentUser = null;

// Stato della prenotazione
let selectedDateStr = null;
let selectedTimeStr = null;
let currentServiceDuration = 30; // durata di default

// Elementi DOM
const vetNameSubtitle = document.getElementById("vetNameSubtitle");
const vetAddress = document.getElementById("vetAddress");
const petSelect = document.getElementById("petSelect");
const serviceSelect = document.getElementById("serviceSelect");
const dateContainer = document.getElementById("dateContainer");
const timeContainer = document.getElementById("timeContainer");
const confirmBtn = document.getElementById("confirmBtn");
const totalPrice = document.getElementById("totalPrice");
const summaryPrice = document.getElementById("summaryPrice");
const statusMessage = document.getElementById("statusMessage");

async function initPrenota() {
    if (!vetId) {
        alert("Nessun professionista selezionato!");
        window.location.href = "dashboard-proprietario.html";
        return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        window.location.href = "../../index.html";
        return;
    }
    currentUser = user;

    await loadVetInfo();
    await loadPets();

    const hasServices = await loadServices();
    if (hasServices) {
        generateDatePills();
    }
}

// 1. Carica info veterinario
async function loadVetInfo() {
    const { data: vet, error } = await supabase
        .from('veterinarians')
        .select(`
            indirizzo_clinica,
            profiles (nome, cognome)
        `)
        .eq('user_id', vetId)
        .single();

    if (!error && vet) {
        const nomeCompleto = `${vet.profiles?.nome || ''} ${vet.profiles?.cognome || ''}`.trim();
        vetNameSubtitle.textContent = `Dott. ${nomeCompleto}`;
        vetAddress.textContent = vet.indirizzo_clinica || "Indirizzo non specificato";
    }
}

// 2. Carica gli animali dell'utente
async function loadPets() {
    const { data: pets } = await supabase
        .from('pets')
        .select('id, nome, specie')
        .eq('owner_id', currentUser.id);

    petSelect.innerHTML = "";
    if (pets && pets.length > 0) {
        pets.forEach(pet => {
            const option = document.createElement('option');
            option.value = pet.id;
            option.textContent = `${pet.nome} · ${pet.specie}`;
            petSelect.appendChild(option);
        });
    } else {
        petSelect.innerHTML = `<option value="" disabled selected>Nessun animale registrato</option>`;
    }
}

// 3. Genera i prossimi 7 giorni
function generateDatePills() {
    dateContainer.innerHTML = "";
    const oggi = new Date();
    const giorniSettimana = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];

    for (let i = 0; i < 7; i++) {
        const d = new Date(oggi);
        d.setDate(oggi.getDate() + i);
        
        const pill = document.createElement("div");
        pill.className = "pill";
        
        const nomeGiorno = i === 0 ? "Oggi" : giorniSettimana[d.getDay()];
        pill.textContent = `${nomeGiorno} ${d.getDate()}`;
        
        // Salviamo la data in formato YYYY-MM-DD per fare le query al DB
        const dateStr = d.toISOString().split('T')[0];
        pill.dataset.date = dateStr;

        pill.addEventListener("click", () => {
            // Rimuovi classe active agli altri
            document.querySelectorAll("#dateContainer .pill").forEach(p => p.classList.remove("active"));
            pill.classList.add("active");
            selectedDateStr = dateStr;
            selectedTimeStr = null; // Resetta l'orario
            checkFormValidity();
            loadAvailableTimes(dateStr); // Cerca orari liberi
        });

        dateContainer.appendChild(pill);
    }
}

// Nuova funzione per caricare i servizi
async function loadServices() {
    const { data: services, error } = await supabase
        .from('provider_services') // <-- METTI IL NOME ESATTO DELLA TUA TABELLA
        .select('*')
        .eq('provider_id', vetId);

    const noServicesMsg = document.getElementById("noServicesMsg");
    serviceSelect.innerHTML = "";

    // Se c'è un errore o non ci sono servizi registrati
    if (error || !services || services.length === 0) {
        serviceSelect.style.display = 'none'; // Nascondi la tendina
        noServicesMsg.style.display = 'block'; // Mostra il messaggio di errore
        
        // Blocca i prezzi
        totalPrice.textContent = "-- €";
        summaryPrice.textContent = "--";
        return false; // Ritorna FALSO per fermare il caricamento delle date
    }

    // Se ci sono servizi, popoliamo la tendina
    services.forEach(srv => {
        const option = document.createElement('option');
        option.value = srv.id;
        option.dataset.prezzo = srv.prezzo;
        option.dataset.durata = srv.durata_minuti;
        option.textContent = `${srv.nome_servizio} · ${srv.durata_minuti} min · €${srv.prezzo}`;
        serviceSelect.appendChild(option);
    });

    // Scatena un evento "change" finto per aggiornare i prezzi mostrati sotto a schermo
    serviceSelect.dispatchEvent(new Event("change"));
    return true; // Ritorna VERO, possiamo procedere
}

// 4. Carica orari liberi incrociando con il Database!
async function loadAvailableTimes(dateStr) {
    timeContainer.innerHTML = `<p style="color: #64748B; font-size: 0.9rem;"><i class="fa-solid fa-spinner fa-spin"></i> Ricerca disponibilità...</p>`;
    
    // Iniziamo la giornata lavorativa fittizia (9:00 - 17:00, slot da 30 min)
    const allSlots = ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "14:30", "15:00", "15:30", "16:00", "16:30"];
    
    try {
        // Peschiamo gli appuntamenti ESISTENTI per questo veterinario in questa data
        const { data: bookedAppointments, error } = await supabase
            .from('appointments')
            .select('data_inizio')
            .eq('provider_id', vetId)
            .gte('data_inizio', `${dateStr}T00:00:00Z`)
            .lte('data_inizio', `${dateStr}T23:59:59Z`);

        if (error) throw error;

        // Estraiamo solo gli orari "HH:MM" prenotati
        const bookedTimes = bookedAppointments.map(app => {
            const d = new Date(app.data_inizio);
            // Formattiamo per fuso orario locale
            return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }); 
        });

        timeContainer.innerHTML = "";
        let availableCount = 0;

        allSlots.forEach(slot => {
            const pill = document.createElement("div");
            pill.className = "pill";
            pill.textContent = slot;

            if (bookedTimes.includes(slot)) {
                // Se è occupato, lo disabilitiamo
                pill.classList.add("disabled");
            } else {
                availableCount++;
                pill.addEventListener("click", () => {
                    document.querySelectorAll("#timeContainer .pill:not(.disabled)").forEach(p => p.classList.remove("active"));
                    pill.classList.add("active");
                    selectedTimeStr = slot;
                    checkFormValidity();
                });
            }
            timeContainer.appendChild(pill);
        });

        if (availableCount === 0) {
            timeContainer.innerHTML = `<p style="color: #DC2626; font-size: 0.9rem;">Nessuna disponibilità per questa data.</p>`;
        }

    } catch (err) {
        console.error("Errore lettura appuntamenti:", err);
        timeContainer.innerHTML = `<p style="color: red;">Errore di caricamento orari.</p>`;
    }
}

// 5. Aggiornamento prezzi dinamico
serviceSelect.addEventListener("change", () => {
    const selectedOption = serviceSelect.options[serviceSelect.selectedIndex];
    
    // Prendi prezzo e durata dal database!
    const prezzo = selectedOption.getAttribute('data-prezzo');
    currentServiceDuration = parseInt(selectedOption.getAttribute('data-durata')) || 30; 
    
    totalPrice.textContent = `${prezzo},00 €`;
    summaryPrice.textContent = `€${prezzo},00`;
});

// 6. Controlla se abilitare il bottone Conferma
function checkFormValidity() {
    if (selectedDateStr && selectedTimeStr && petSelect.value) {
        confirmBtn.disabled = false;
    } else {
        confirmBtn.disabled = true;
    }
}

// 7. PRENOTA (Scrittura nel Database)
confirmBtn.addEventListener("click", async () => {
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Prenotazione...';
    
    // Costruiamo l'oggetto Date per inizio e fine
    const dataInizio = new Date(`${selectedDateStr}T${selectedTimeStr}:00`);
    
    // CORREZIONE CHIAVE: Uso currentServiceDuration invece di appointmentDurationMinutes
    const dataFine = new Date(dataInizio.getTime() + currentServiceDuration * 60000);

    // Prezzo (nell'MVP non viene pagato subito, ma salvato nel record)
    const costoStr = serviceSelect.options[serviceSelect.selectedIndex].getAttribute('data-prezzo');

    try {
        const { error } = await supabase
            .from('appointments')
            .insert({
                owner_id: currentUser.id,
                provider_id: vetId,
                pet_id: petSelect.value,
                data_inizio: dataInizio.toISOString(),
                data_fine: dataFine.toISOString(),
                stato: 'programmato',
                costo: parseFloat(costoStr)
            });

        if (error) throw error;

        statusMessage.textContent = "Appuntamento confermato con successo!";
        statusMessage.className = "status-message success";
        statusMessage.hidden = false;

        // Torna alla dashboard dopo 2 secondi
        setTimeout(() => {
            window.location.href = "dashboard-proprietario.html";
        }, 2000);

    } catch (err) {
     statusMessage.textContent = "Errore Supabase: " + (err.message || JSON.stringify(err));
        statusMessage.className = "status-message error";
        statusMessage.hidden = false;
        confirmBtn.disabled = false;
        confirmBtn.textContent = "Riprova";
    }
});

// Avvia script
initPrenota();