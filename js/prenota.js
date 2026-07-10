import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ID presi dall'URL (Puliti da eventuali slash o spazi!)
const urlParams = new URLSearchParams(window.location.search);
let vetId = urlParams.get('user_id'); 
if (vetId) vetId = vetId.replace(/\/$/, '').trim(); // Rimuove sporcizia dall'URL

// Se l'utente ha cliccato un servizio specifico nella pagina precedente
const urlServiceId = urlParams.get('service_id');

let currentUser = null;
let isPersonalVisit = false; // <-- VARIABILE MAGICA

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
    
    // CONTROLLO BLINDATO AUTOPRENOTAZIONE
    isPersonalVisit = (String(currentUser.id).trim() === String(vetId).trim());
    
    // Debug in console per tua sicurezza
    console.log("ID Mio:", currentUser.id);
    console.log("ID Vet:", vetId);
    console.log("È una visita personale?", isPersonalVisit);

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
        
        const dateStr = d.toISOString().split('T')[0];
        pill.dataset.date = dateStr;

        pill.addEventListener("click", () => {
            document.querySelectorAll("#dateContainer .pill").forEach(p => p.classList.remove("active"));
            pill.classList.add("active");
            selectedDateStr = dateStr;
            selectedTimeStr = null; 
            checkFormValidity();
            loadAvailableTimes(dateStr); 
        });

        dateContainer.appendChild(pill);
    }
}

// Nuova funzione per caricare i servizi
async function loadServices() {
    const { data: services, error } = await supabase
        .from('provider_services')
        .select('*')
        .eq('provider_id', vetId);

    const noServicesMsg = document.getElementById("noServicesMsg");
    serviceSelect.innerHTML = "";

    if (error || !services || services.length === 0) {
        serviceSelect.style.display = 'none'; 
        noServicesMsg.style.display = 'block'; 
        
        totalPrice.textContent = "-- €";
        summaryPrice.textContent = "--";
        return false; 
    }

    services.forEach(srv => {
        const option = document.createElement('option');
        option.value = srv.id;
        option.dataset.prezzo = srv.prezzo;
        option.dataset.durata = srv.durata_minuti;
        option.textContent = `${srv.nome_servizio} · ${srv.durata_minuti} min · €${srv.prezzo}`;
        
        if (urlServiceId && urlServiceId === srv.id) {
            option.selected = true;
        }

        serviceSelect.appendChild(option);
    });

    serviceSelect.dispatchEvent(new Event("change"));
    return true; 
}

// 4. Carica orari liberi incrociando con il Database!
async function loadAvailableTimes(dateStr) {
    timeContainer.innerHTML = `<p style="color: #64748B; font-size: 0.9rem;"><i class="fa-solid fa-spinner fa-spin"></i> Ricerca disponibilità...</p>`;
    
    const allSlots = ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "14:30", "15:00", "15:30", "16:00", "16:30"];
    
    try {
        const { data: bookedAppointments, error } = await supabase
            .from('appointments')
            .select('data_inizio')
            .eq('provider_id', vetId)
            .gte('data_inizio', `${dateStr}T00:00:00Z`)
            .lte('data_inizio', `${dateStr}T23:59:59Z`);

        if (error) throw error;

        const bookedTimes = bookedAppointments.map(app => {
            const d = new Date(app.data_inizio);
            return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }); 
        });

        timeContainer.innerHTML = "";
        let availableCount = 0;

        allSlots.forEach(slot => {
            const pill = document.createElement("div");
            pill.className = "pill";
            pill.textContent = slot;

            if (bookedTimes.includes(slot)) {
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

// 5. Aggiornamento prezzi dinamico CON CONTROLLO AUTOPRENOTAZIONE
serviceSelect.addEventListener("change", () => {
    const selectedOption = serviceSelect.options[serviceSelect.selectedIndex];
    
    const prezzoStandard = selectedOption.getAttribute('data-prezzo');
    currentServiceDuration = parseInt(selectedOption.getAttribute('data-durata')) || 30; 
    
    if (isPersonalVisit) {
        totalPrice.textContent = `0,00 € (Visita Personale)`;
        summaryPrice.textContent = `€ 0,00`;
    } else {
        totalPrice.textContent = `${prezzoStandard},00 €`;
        summaryPrice.textContent = `€ ${prezzoStandard},00`;
    }
});

// 6. Controlla se abilitare il bottone Conferma
function checkFormValidity() {
    if (selectedDateStr && selectedTimeStr && petSelect.value) {
        confirmBtn.disabled = false;
    } else {
        confirmBtn.disabled = true;
    }
}

// 7. PRENOTA (Scrittura nel Database e Invio Email)
confirmBtn.addEventListener("click", async () => {
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Elaborazione in corso...';
    
    const dataInizio = new Date(`${selectedDateStr}T${selectedTimeStr}:00`);
    const dataFine = new Date(dataInizio.getTime() + currentServiceDuration * 60000);

    const costoStr = serviceSelect.options[serviceSelect.selectedIndex].getAttribute('data-prezzo');
    const costoFinale = isPersonalVisit ? 0 : parseFloat(costoStr);

    try {
        // A. SALVATAGGIO NEL DATABASE
        const { error } = await supabase
            .from('appointments')
            .insert({
                owner_id: currentUser.id,
                provider_id: vetId,
                pet_id: petSelect.value,
                data_inizio: dataInizio.toISOString(),
                data_fine: dataFine.toISOString(),
                stato: 'programmato',
                costo: costoFinale
            });

        if (error) throw error;

        // ==========================================
        // B. INVIO EMAIL TRAMITE EDGE FUNCTION
        // ==========================================
        try {
            // Estrapola il nome del cane pulito (rimuove il "· Specie")
            const nomePetCompleto = petSelect.options[petSelect.selectedIndex].textContent;
            const nomeAnimale = nomePetCompleto.split(' · ')[0].trim();
            
            // Estrapola il nome del dottore e formatta la data
            const nomeProfessionista = vetNameSubtitle.textContent.replace('Dott. ', '').trim();
            const dataVisitaFormattata = dataInizio.toLocaleString('it-IT', { dateStyle: 'long', timeStyle: 'short' });

            const datiEmail = {
                // ATTENZIONE: per i test, inserisci qui la tua mail usata su Resend
                emailProprietario: currentUser.email, 
                emailProfessionista: "mediastrategiessrl@gmail.com", // Sostituisci con la tua vera email di test!
                nomeAnimale: nomeAnimale,
                nomeProfessionista: nomeProfessionista,
                dataVisita: dataVisitaFormattata,
                noteAggiuntive: "Prenotazione effettuata autonomamente tramite l'applicazione."
            };

            const { data: funcData, error: funcError } = await supabase.functions.invoke('send-booking-email', {
                body: datiEmail
            });

            if (funcError) {
                console.warn("Appuntamento salvato, ma errore nell'invio della mail:", funcError);
            } else {
                console.log("Email inviate con successo alla clinica e al cliente!");
            }
        } catch (emailErr) {
            console.error("Errore imprevisto durante la chiamata email:", emailErr);
        }
        // ==========================================

        statusMessage.textContent = isPersonalVisit 
            ? "Visita personale inserita correttamente!" 
            : "Appuntamento confermato! Ti abbiamo inviato una mail di riepilogo.";
            
        statusMessage.className = "status-message success";
        statusMessage.hidden = false;

        setTimeout(() => {
            window.location.href = "dashboard-proprietario.html";
        }, 2500);

    } catch (err) {
        statusMessage.textContent = "Errore Supabase: " + (err.message || JSON.stringify(err));
        statusMessage.className = "status-message error";
        statusMessage.hidden = false;
        confirmBtn.disabled = false;
        confirmBtn.textContent = "Riprova";
    }
});

initPrenota();