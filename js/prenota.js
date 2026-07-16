// ==========================================
// 1. IMPORT CENTRALIZZATI
// ==========================================
import { supabase } from '../utils/supabaseClient.js';
import { logError } from '../utils/logger.js';

const urlParams = new URLSearchParams(window.location.search);
let vetId = urlParams.get('user_id');
if (vetId) vetId = vetId.replace(/\/$/, '').trim();

const urlServiceId = urlParams.get('service_id');

let currentUser = null;
let isPersonalVisit = false;

// Variabili di Stato
let selectedDateStr = null;
let selectedTimeStr = null;
let currentServiceDuration = 30; // durata di default
let primaryLocation = null; // Memorizza la sede e gli orari del professionista

// Variabili di Stato - Selettore Data (Giorno / Settimana / Mese)
let currentViewMode = 'week'; // 'day' | 'week' | 'month'
let viewAnchorDate = startOfDay(new Date()); // riferimento per vista Giorno/Settimana
let calendarMonthDate = startOfMonth(new Date()); // riferimento (1° del mese) per vista Mese

let viewSwitcherEl, datePrevBtn, dateNextBtn, dateNavLabelEl;

const nomiGiorniBreve = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];
const nomiGiorniEsteso = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];
const nomiMesi = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];

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

    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) throw Object.assign(new Error(authError.message), { code: authError.code || 'AUTH_SYS_ERROR' });
       
        if (!user) {
            window.location.href = "../../index.html";
            return;
        }
        currentUser = user;
       
        // CONTROLLO AUTOPRENOTAZIONE
        isPersonalVisit = (String(currentUser.id).trim() === String(vetId).trim());
       
        await loadVetInfo();
        await loadPets();

        const hasServices = await loadServices();
        if (hasServices) {
            initDateSelector();
        }
    } catch (error) {
        console.error("Errore inizializzazione prenota:", error);
        await logError({
            source: 'prenotazione', action: 'init_page',
            errorMessage: error.message, errorCode: error.code || 'UNKNOWN_SYS_ERROR', context: { vetId }
        });
    }
}

// 1. Carica info veterinario e i suoi Orari JSONB (NUOVA LOGICA PROFILES + LOCATIONS)
async function loadVetInfo() {
    try {
        const { data: profile, error } = await supabase
            .from('profiles')
            .select(`
                nome, cognome,
                provider_locations (id, indirizzo, is_principale, orari_disponibilita)
            `)
            .eq('id', vetId)
            .single();

        if (error) throw Object.assign(new Error(error.message), { code: error.code || 'DB_FETCH_VET_ERROR' });

        if (profile) {
            const nomeCompleto = `${profile.nome || ''} ${profile.cognome || ''}`.trim();
            vetNameSubtitle.textContent = `Dott. ${nomeCompleto}`;

            // Estrapoliamo la sede principale (o la prima disponibile)
            if (profile.provider_locations && profile.provider_locations.length > 0) {
                primaryLocation = profile.provider_locations.find(l => l.is_principale) || profile.provider_locations[0];
                vetAddress.textContent = primaryLocation.indirizzo || "Indirizzo non specificato";
            } else {
                vetAddress.textContent = "Nessuna sede configurata";
            }
        }
    } catch (error) {
        console.error("Errore caricamento info vet:", error);
        vetNameSubtitle.textContent = `Professionista non trovato`;
    }
}

// 2. Carica gli animali dell'utente (Invariato)
async function loadPets() {
    try {
        const { data: pets, error } = await supabase
            .from('pets')
            .select('id, nome, specie')
            .eq('owner_id', currentUser.id);

        if (error) throw error;

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
    } catch (error) {
        console.error("Errore pets:", error);
        petSelect.innerHTML = `<option value="" disabled selected>Errore di caricamento</option>`;
    }
}

// ==========================================
// 3. SELETTORE DATA - Giorno / Settimana / Mese
// ==========================================

// --- Utility date (senza problemi di fuso orario di toISOString) ---
function startOfDay(d) {
    const nd = new Date(d);
    nd.setHours(0, 0, 0, 0);
    return nd;
}
function startOfMonth(d) {
    return new Date(d.getFullYear(), d.getMonth(), 1);
}
function addDays(d, n) {
    const nd = new Date(d);
    nd.setDate(nd.getDate() + n);
    return nd;
}
function addMonths(d, n) {
    return new Date(d.getFullYear(), d.getMonth() + n, 1);
}
function toDateStr(d) {
    const y = d.getFullYear();
    const m = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${day}`;
}
function isPastDate(d) {
    return startOfDay(d).getTime() < startOfDay(new Date()).getTime();
}

function initDateSelector() {
    injectDateSelectorStyles();
    buildDateToolbar();
    renderDateView();
}

// Inserisce gli stili necessari una sola volta (nessuna modifica all'HTML/CSS esistente richiesta)
function injectDateSelectorStyles() {
    if (document.getElementById('dateSelectorStyles')) return;

    const style = document.createElement('style');
    style.id = 'dateSelectorStyles';
    style.textContent = `
        .date-view-toolbar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            flex-wrap: wrap;
            margin-bottom: 14px;
        }
        .view-switcher {
            display: inline-flex;
            background: #fff;
            border: 1px solid #E2E8F0;
            border-radius: 12px;
            padding: 3px;
            gap: 2px;
        }
        .view-switch-btn {
            border: none;
            background: transparent;
            color: #64748B;
            font-weight: 600;
            font-size: 0.85rem;
            padding: 6px 14px;
            border-radius: 9px;
            cursor: pointer;
            transition: background .15s ease, color .15s ease;
        }
        .view-switch-btn:hover { color: #F58220; }
        .view-switch-btn.active { background: #F58220; color: #fff; }
        .date-nav {
            display: inline-flex;
            align-items: center;
            gap: 10px;
        }
        .date-nav-arrow {
            width: 34px;
            height: 34px;
            border-radius: 50%;
            border: 1px solid #E2E8F0;
            background: #fff;
            color: #334155;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all .15s ease;
            flex-shrink: 0;
        }
        .date-nav-arrow:hover:not(:disabled) {
            border-color: #F58220;
            color: #F58220;
            background: #FFF3E9;
        }
        .date-nav-arrow:disabled { opacity: .3; cursor: not-allowed; }
        .date-nav-label {
            font-size: 0.9rem;
            font-weight: 600;
            color: #1E293B;
            min-width: 100px;
            text-align: center;
        }
        .day-view-pill {
            display: inline-flex;
            align-items: center;
            gap: 10px;
            padding: 14px 22px;
            font-size: 0.95rem;
        }
        .calendar-grid-wrapper { width: 100%; }
        .calendar-weekdays {
            display: grid;
            grid-template-columns: repeat(7, 1fr);
            gap: 6px;
            margin-bottom: 6px;
        }
        .calendar-weekday-label {
            text-align: center;
            font-size: 0.72rem;
            font-weight: 700;
            color: #94A3B8;
            text-transform: uppercase;
            letter-spacing: .03em;
        }
        .calendar-days-grid {
            display: grid;
            grid-template-columns: repeat(7, 1fr);
            gap: 6px;
        }
        .calendar-day-cell {
            aspect-ratio: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 10px;
            border: 1px solid #E2E8F0;
            background: #fff;
            color: #334155;
            font-size: 0.85rem;
            font-weight: 500;
            cursor: pointer;
            transition: all .15s ease;
        }
        .calendar-day-cell:hover:not(.disabled):not(.empty) {
            border-color: #F58220;
            color: #F58220;
        }
        .calendar-day-cell.empty { border: none; background: transparent; cursor: default; }
        .calendar-day-cell.disabled { opacity: .3; cursor: not-allowed; background: #F8FAFC; }
        .calendar-day-cell.today { border-color: #F58220; color: #F58220; font-weight: 700; }
        .calendar-day-cell.active { background: #F58220; border-color: #F58220; color: #fff; }
        @media (max-width: 420px) {
            .date-view-toolbar { flex-direction: column; align-items: stretch; }
            .date-nav { justify-content: space-between; }
        }
    `;
    document.head.appendChild(style);
}

// Costruisce la toolbar (switch vista + frecce) una sola volta, prima di #dateContainer
function buildDateToolbar() {
    if (document.getElementById('dateViewToolbar')) return;

    const toolbar = document.createElement('div');
    toolbar.className = 'date-view-toolbar';
    toolbar.id = 'dateViewToolbar';
    toolbar.innerHTML = `
        <div class="view-switcher" id="viewSwitcher">
            <button type="button" class="view-switch-btn active" data-view="day" title="Vista giornaliera">1</button>
            <button type="button" class="view-switch-btn" data-view="week" title="Vista settimanale">7</button>
            <button type="button" class="view-switch-btn" data-view="month" title="Vista mensile">31</button>
        </div>
        <div class="date-nav">
            <button type="button" class="date-nav-arrow" id="datePrevBtn" aria-label="Indietro">
                <i class="fa-solid fa-chevron-left"></i>
            </button>
            <span class="date-nav-label" id="dateNavLabel"></span>
            <button type="button" class="date-nav-arrow" id="dateNextBtn" aria-label="Avanti">
                <i class="fa-solid fa-chevron-right"></i>
            </button>
        </div>
    `;

    dateContainer.parentNode.insertBefore(toolbar, dateContainer);

    viewSwitcherEl = document.getElementById('viewSwitcher');
    datePrevBtn = document.getElementById('datePrevBtn');
    dateNextBtn = document.getElementById('dateNextBtn');
    dateNavLabelEl = document.getElementById('dateNavLabel');

    // Di default partiamo dalla vista Settimana (come nel comportamento originale)
    currentViewMode = 'week';
    viewSwitcherEl.querySelectorAll('.view-switch-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.view === currentViewMode);
    });

    viewSwitcherEl.querySelectorAll('.view-switch-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.dataset.view === currentViewMode) return;
            currentViewMode = btn.dataset.view;

            viewSwitcherEl.querySelectorAll('.view-switch-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Ogni cambio vista riparte da oggi
            viewAnchorDate = startOfDay(new Date());
            calendarMonthDate = startOfMonth(new Date());

            renderDateView();
        });
    });

    datePrevBtn.addEventListener('click', () => shiftView(-1));
    dateNextBtn.addEventListener('click', () => shiftView(1));
}

function shiftView(direction) {
    if (currentViewMode === 'day') {
        viewAnchorDate = addDays(viewAnchorDate, direction);
    } else if (currentViewMode === 'week') {
        viewAnchorDate = addDays(viewAnchorDate, direction * 7);
    } else {
        calendarMonthDate = addMonths(calendarMonthDate, direction);
    }
    renderDateView();
}

function renderDateView() {
    dateContainer.innerHTML = "";

    if (currentViewMode === 'day') renderDayView();
    else if (currentViewMode === 'week') renderWeekView();
    else renderMonthView();

    updateNavState();
}

function updateNavState() {
    const today = startOfDay(new Date());

    if (currentViewMode === 'month') {
        const todayMonth = startOfMonth(new Date());
        datePrevBtn.disabled = calendarMonthDate.getTime() <= todayMonth.getTime();
        dateNavLabelEl.textContent = `${nomiMesi[calendarMonthDate.getMonth()]} ${calendarMonthDate.getFullYear()}`;
        return;
    }

    datePrevBtn.disabled = viewAnchorDate.getTime() <= today.getTime();

    if (currentViewMode === 'day') {
        dateNavLabelEl.textContent = `${nomiGiorniEsteso[viewAnchorDate.getDay()]} ${viewAnchorDate.getDate()} ${nomiMesi[viewAnchorDate.getMonth()]}`;
    } else {
        const endDate = addDays(viewAnchorDate, 6);
        const sameMonth = viewAnchorDate.getMonth() === endDate.getMonth();
        dateNavLabelEl.textContent = sameMonth
            ? `${viewAnchorDate.getDate()} - ${endDate.getDate()} ${nomiMesi[endDate.getMonth()]}`
            : `${viewAnchorDate.getDate()} ${nomiMesi[viewAnchorDate.getMonth()].slice(0, 3)} - ${endDate.getDate()} ${nomiMesi[endDate.getMonth()].slice(0, 3)}`;
    }
}

function selectDatePill(dateStr, el, allEls) {
    allEls.forEach(p => p.classList.remove('active'));
    el.classList.add('active');
    selectedDateStr = dateStr;
    selectedTimeStr = null;
    checkFormValidity();
    loadAvailableTimes(dateStr);
}

// Vista Giorno (pulsantino "1")
function renderDayView() {
    const d = viewAnchorDate;
    const dateStr = toDateStr(d);
    const past = isPastDate(d);
    const isToday = dateStr === toDateStr(new Date());

    const pill = document.createElement('div');
    pill.className = 'pill day-view-pill';
    if (past) pill.classList.add('disabled');
    if (selectedDateStr === dateStr) pill.classList.add('active');
    pill.innerHTML = `<i class="fa-solid fa-calendar-day"></i> ${isToday ? 'Oggi · ' : ''}${nomiGiorniEsteso[d.getDay()]} ${d.getDate()} ${nomiMesi[d.getMonth()]}`;

    if (!past) {
        pill.addEventListener('click', () => selectDatePill(dateStr, pill, [pill]));
    }

    dateContainer.appendChild(pill);
}

// Vista Settimana (pulsantino "7") - stesso comportamento originale, ma navigabile nel tempo
function renderWeekView() {
    const pills = [];
    for (let i = 0; i < 7; i++) {
        const d = addDays(viewAnchorDate, i);
        const dateStr = toDateStr(d);
        const past = isPastDate(d);
        const isToday = dateStr === toDateStr(new Date());

        const pill = document.createElement('div');
        pill.className = 'pill';
        if (past) pill.classList.add('disabled');
        if (selectedDateStr === dateStr) pill.classList.add('active');

        pill.textContent = `${isToday ? 'Oggi' : nomiGiorniBreve[d.getDay()]} ${d.getDate()}`;
        pill.dataset.date = dateStr;

        pills.push(pill);
        dateContainer.appendChild(pill);
    }

    // Ora che tutti i pill esistono nel DOM, collega il click (serve l'elenco completo per il reset "active")
    pills.forEach((pill) => {
        if (pill.classList.contains('disabled')) return;
        pill.addEventListener('click', () => selectDatePill(pill.dataset.date, pill, pills));
    });
}

// Vista Mese (pulsantino "31") - calendario completo, navigabile di mese in mese
function renderMonthView() {
    const wrapper = document.createElement('div');
    wrapper.className = 'calendar-grid-wrapper';

    const weekdaysRow = document.createElement('div');
    weekdaysRow.className = 'calendar-weekdays';
    ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].forEach(lbl => {
        const el = document.createElement('div');
        el.className = 'calendar-weekday-label';
        el.textContent = lbl;
        weekdaysRow.appendChild(el);
    });
    wrapper.appendChild(weekdaysRow);

    const grid = document.createElement('div');
    grid.className = 'calendar-days-grid';

    const year = calendarMonthDate.getFullYear();
    const month = calendarMonthDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const leadingEmpty = (firstDay.getDay() + 6) % 7; // Lun=0 ... Dom=6

    for (let i = 0; i < leadingEmpty; i++) {
        const empty = document.createElement('div');
        empty.className = 'calendar-day-cell empty';
        grid.appendChild(empty);
    }

    const todayStr = toDateStr(new Date());
    const cells = [];

    for (let day = 1; day <= daysInMonth; day++) {
        const d = new Date(year, month, day);
        const dateStr = toDateStr(d);
        const past = isPastDate(d);

        const cell = document.createElement('div');
        cell.className = 'calendar-day-cell';
        if (past) cell.classList.add('disabled');
        if (dateStr === todayStr) cell.classList.add('today');
        if (selectedDateStr === dateStr) cell.classList.add('active');
        cell.textContent = day;
        cell.dataset.date = dateStr;

        cells.push(cell);
        grid.appendChild(cell);
    }

    cells.forEach(cell => {
        if (cell.classList.contains('disabled')) return;
        cell.addEventListener('click', () => selectDatePill(cell.dataset.date, cell, cells));
    });

    wrapper.appendChild(grid);
    dateContainer.appendChild(wrapper);
}

// 4. Carica Servizi
async function loadServices() {
    try {
        const { data: services, error } = await supabase
            .from('provider_services')
            .select('*')
            .eq('provider_id', vetId);

        if (error) throw error;

        const noServicesMsg = document.getElementById("noServicesMsg");
        serviceSelect.innerHTML = "";

        if (!services || services.length === 0) {
            serviceSelect.style.display = 'none';
            if(noServicesMsg) noServicesMsg.style.display = 'block';
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
           
            if (urlServiceId && urlServiceId === srv.id) option.selected = true;
            serviceSelect.appendChild(option);
        });

        serviceSelect.dispatchEvent(new Event("change"));
        return true;
    } catch (error) {
        console.error("Errore servizi:", error);
        return false;
    }
}

// 5. MOTORE DI CALCOLO SLOT DINAMICI SU BASE JSONB
async function loadAvailableTimes(dateStr) {
    timeContainer.innerHTML = `<p style="color: #64748B; font-size: 0.9rem;"><i class="fa-solid fa-spinner fa-spin"></i> Ricerca disponibilità...</p>`;
   
    if (!primaryLocation || !primaryLocation.orari_disponibilita) {
        timeContainer.innerHTML = `<p style="color: #DC2626; font-size: 0.9rem;">Il professionista non ha ancora configurato i suoi orari lavorativi.</p>`;
        return;
    }

    // A. Trova il giorno della settimana (es. "lunedi")
    const dateObj = new Date(dateStr);
    const nomiGiorni = ["domenica", "lunedi", "martedi", "mercoledi", "giovedi", "venerdi", "sabato"];
    const giornoSelezionato = nomiGiorni[dateObj.getDay()];

    const fasceGiorno = primaryLocation.orari_disponibilita[giornoSelezionato] || [];

    if (fasceGiorno.length === 0) {
        timeContainer.innerHTML = `<p style="color: #64748B; font-size: 0.9rem;">Nessuna disponibilità per questa giornata.</p>`;
        return;
    }

    // B. Costruisci gli Slot in base alla durata del servizio (Tetris)
    let allSlots = [];
    fasceGiorno.forEach(fascia => {
        let startParts = fascia.inizio.split(':');
        let endParts = fascia.fine.split(':');
        let startMins = parseInt(startParts[0]) * 60 + parseInt(startParts[1]);
        let endMins = parseInt(endParts[0]) * 60 + parseInt(endParts[1]);

        for (let time = startMins; (time + currentServiceDuration) <= endMins; time += currentServiceDuration) {
            let h = Math.floor(time / 60).toString().padStart(2, '0');
            let m = (time % 60).toString().padStart(2, '0');
            allSlots.push({
                timeStr: `${h}:${m}`,
                startMins: time,
                endMins: time + currentServiceDuration
            });
        }
    });

    try {
        // C. Scarica gli Appuntamenti Esistenti per controllare gli accavallamenti
        const { data: bookedAppointments, error } = await supabase
            .from('appointments')
            .select('data_inizio, data_fine')
            .eq('provider_id', vetId)
            .gte('data_inizio', `${dateStr}T00:00:00Z`)
            .lte('data_inizio', `${dateStr}T23:59:59Z`);

        if (error) throw error;

        // Convertiamo gli appuntamenti presi in minuti per un confronto rapido
        const bookedRanges = bookedAppointments.map(app => {
            const startD = new Date(app.data_inizio);
            const endD = new Date(app.data_fine);
            return {
                start: startD.getHours() * 60 + startD.getMinutes(),
                end: endD.getHours() * 60 + endD.getMinutes()
            };
        });

        // D. Renderizza gli slot e disabilita quelli sovrapposti
        timeContainer.innerHTML = "";
        let availableCount = 0;

        allSlots.forEach(slot => {
            // Controlla se c'è overlap (se l'inizio del nuovo slot è prima della fine di uno vecchio, E la fine del nuovo è dopo l'inizio del vecchio)
            let isOverlapping = bookedRanges.some(b => {
                return (slot.startMins < b.end && slot.endMins > b.start);
            });

            const pill = document.createElement("div");
            pill.className = "pill";
            pill.textContent = slot.timeStr;

            if (isOverlapping) {
                pill.classList.add("disabled");
            } else {
                availableCount++;
                pill.addEventListener("click", () => {
                    document.querySelectorAll("#timeContainer .pill:not(.disabled)").forEach(p => p.classList.remove("active"));
                    pill.classList.add("active");
                    selectedTimeStr = slot.timeStr;
                    checkFormValidity();
                });
            }
            timeContainer.appendChild(pill);
        });

        if (availableCount === 0) {
            timeContainer.innerHTML = `<p style="color: #DC2626; font-size: 0.9rem;">Tutti gli orari sono occupati per questa data.</p>`;
        }

    } catch (err) {
        console.error("Errore lettura appuntamenti:", err);
        timeContainer.innerHTML = `<p style="color: red;">Errore di caricamento orari.</p>`;
    }
}

// 6. Aggiornamento prezzi e ricalcolo slot dinamico
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

    // Se cambio servizio (e durata), ricalcolo gli orari per la data selezionata!
    if (selectedDateStr) {
        selectedTimeStr = null;
        checkFormValidity();
        loadAvailableTimes(selectedDateStr);
    }
});

// 7. Controlla validità form
function checkFormValidity() {
    if (selectedDateStr && selectedTimeStr && petSelect.value) {
        confirmBtn.disabled = false;
    } else {
        confirmBtn.disabled = true;
    }
}

// 8. PRENOTA (Scrittura nel Database)
confirmBtn.addEventListener("click", async () => {
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Elaborazione in corso...';
   
    const dataInizio = new Date(`${selectedDateStr}T${selectedTimeStr}:00`);
    const dataFine = new Date(dataInizio.getTime() + currentServiceDuration * 60000);

    const costoStr = serviceSelect.options[serviceSelect.selectedIndex].getAttribute('data-prezzo');
    const costoFinale = isPersonalVisit ? 0 : parseFloat(costoStr);

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
                costo: costoFinale
            });

        if (error) throw error;

        // INVIO EMAIL TRAMITE EDGE FUNCTION (Mantenuto in blocco separato per non rompere il flusso in caso di fallimento mail)
        try {
            const nomePetCompleto = petSelect.options[petSelect.selectedIndex].textContent;
            const nomeAnimale = nomePetCompleto.split(' · ')[0].trim();
            const nomeProfessionista = vetNameSubtitle.textContent.replace('Dott. ', '').trim();
            const dataVisitaFormattata = dataInizio.toLocaleString('it-IT', { dateStyle: 'long', timeStyle: 'short' });

            const datiEmail = {
                emailProprietario: currentUser.email,
                emailProfessionista: "mediastrategiessrl@gmail.com",
                nomeAnimale: nomeAnimale,
                nomeProfessionista: nomeProfessionista,
                dataVisita: dataVisitaFormattata,
                noteAggiuntive: "Prenotazione effettuata autonomamente tramite l'applicazione."
            };

            await supabase.functions.invoke('send-booking-email', { body: datiEmail });
        } catch (emailErr) {
            console.warn("Errore invio email, ma appuntamento confermato:", emailErr);
        }

        statusMessage.textContent = isPersonalVisit
            ? "Visita personale inserita correttamente!"
            : "Appuntamento confermato! Ti abbiamo inviato una mail di riepilogo.";
           
        statusMessage.className = "status-message success";
        statusMessage.hidden = false;

        setTimeout(() => {
            window.location.href = "dashboard-proprietario.html";
        }, 2500);

    } catch (err) {
        console.error("Errore salvataggio appuntamento:", err);
        statusMessage.textContent = "Errore di sistema durante la prenotazione. Riprova.";
        statusMessage.className = "status-message error";
        statusMessage.hidden = false;
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = 'Conferma prenotazione';
    }
});

initPrenota();