// 1. IMPORT CENTRALIZZATI
// ==========================================
// Assicurati che i percorsi puntino alla cartella corretta (es. ../utils/)
import { supabase } from '../utils/supabaseClient.js';
import { logError } from '../utils/logger.js';

let currentUser = null;

// DOM Elements
const dateCarousel = document.getElementById("dateCarousel");
const currentMonthYear = document.getElementById("currentMonthYear");
const appointmentsCount = document.getElementById("appointmentsCount");
const appointmentsList = document.getElementById("appointmentsList");

// Formattatori Date Italiani
const formatterGiornoNum = new Intl.DateTimeFormat('it-IT', { day: 'numeric' });
const formatterGiornoLettera = new Intl.DateTimeFormat('it-IT', { weekday: 'short' });
const formatterGiornoSettimanaCompleto = new Intl.DateTimeFormat('it-IT', { weekday: 'long' });
const formatterMeseCompleto = new Intl.DateTimeFormat('it-IT', { month: 'long' });
const formatterMeseAnno = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' });

function cap(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

// Variabili di Stato - Selettore Data (Giorno / Settimana / Mese)
let currentViewMode = 'week'; // 'day' | 'week' | 'month'
let viewAnchorDate = startOfDay(new Date()); // riferimento per vista Giorno/Settimana
let calendarMonthDate = startOfMonth(new Date()); // riferimento (1° del mese) per vista Mese
let selectedDate = startOfDay(new Date()); // giorno di cui stiamo mostrando gli appuntamenti

let viewSwitcherEl, datePrevBtn, dateNextBtn, dateNavLabelEl;

async function initAgenda() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        window.location.href = "index.html"; // Adatta alla tua pagina di login
        return;
    }
    currentUser = user;

    initDateSelector();
}

// ==========================================
// SELETTORE DATA - Giorno / Settimana / Mese
// ==========================================

// --- Utility date ---
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
function isSameDay(d1, d2) {
    return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
}
function formatWeekLabel(start) {
    const end = addDays(start, 6);
    const startNum = formatterGiornoNum.format(start);
    const endNum = formatterGiornoNum.format(end);
    if (start.getMonth() === end.getMonth()) {
        return `${startNum} - ${endNum} ${cap(formatterMeseCompleto.format(end))}`;
    }
    return `${startNum} ${cap(formatterMeseCompleto.format(start)).slice(0, 3)} - ${endNum} ${cap(formatterMeseCompleto.format(end)).slice(0, 3)}`;
}

function initDateSelector() {
    injectDateSelectorStyles();
    buildDateToolbar();
    renderDateView();
    caricaAppuntamentiPerData(selectedDate); // Mostra subito gli appuntamenti di oggi, come in origine
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
            margin-bottom: 12px;
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
        .date-nav-arrow:hover { border-color: #F58220; color: #F58220; background: #FFF3E9; }
        .date-nav-label {
            font-size: 0.9rem;
            font-weight: 600;
            color: #1E293B;
            min-width: 100px;
            text-align: center;
        }
        .day-view-pill {
            display: inline-flex !important;
            align-items: center;
            gap: 8px;
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
        .calendar-day-cell:hover:not(.empty) { border-color: #F58220; color: #F58220; }
        .calendar-day-cell.empty { border: none; background: transparent; cursor: default; }
        .calendar-day-cell.today { border-color: #F58220; color: #F58220; font-weight: 700; }
        .calendar-day-cell.active { background: #F58220; border-color: #F58220; color: #fff; }
        @media (max-width: 420px) {
            .date-view-toolbar { flex-direction: column; align-items: stretch; }
            .date-nav { justify-content: space-between; }
        }
    `;
    document.head.appendChild(style);
}

// Costruisce la toolbar (switch vista + frecce) una sola volta, prima di #dateCarousel
function buildDateToolbar() {
    if (document.getElementById('dateViewToolbar')) return;

    const toolbar = document.createElement('div');
    toolbar.className = 'date-view-toolbar';
    toolbar.id = 'dateViewToolbar';
    toolbar.innerHTML = `
        <div class="view-switcher" id="viewSwitcher">
            <button type="button" class="view-switch-btn" data-view="day" title="Vista giornaliera">1</button>
            <button type="button" class="view-switch-btn active" data-view="week" title="Vista settimanale">7</button>
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

    dateCarousel.parentNode.insertBefore(toolbar, dateCarousel);

    viewSwitcherEl = document.getElementById('viewSwitcher');
    datePrevBtn = document.getElementById('datePrevBtn');
    dateNextBtn = document.getElementById('dateNextBtn');
    dateNavLabelEl = document.getElementById('dateNavLabel');

    viewSwitcherEl.querySelectorAll('.view-switch-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.dataset.view === currentViewMode) return;
            currentViewMode = btn.dataset.view;

            viewSwitcherEl.querySelectorAll('.view-switch-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Ogni cambio vista riparte da oggi (la selezione dell'appuntamento resta invariata)
            viewAnchorDate = startOfDay(new Date());
            calendarMonthDate = startOfMonth(new Date());

            renderDateView();
        });
    });

    datePrevBtn.addEventListener('click', () => shiftView(-1));
    dateNextBtn.addEventListener('click', () => shiftView(1));
}

// A differenza della pagina di prenotazione, qui NON limitiamo la navigazione al passato:
// un professionista deve poter consultare anche gli appuntamenti già svolti.
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
    dateCarousel.innerHTML = "";

    if (currentViewMode === 'day') renderDayView();
    else if (currentViewMode === 'week') renderWeekView();
    else renderMonthView();

    updateNavLabel();
}

function updateNavLabel() {
    if (currentViewMode === 'month') {
        dateNavLabelEl.textContent = cap(formatterMeseAnno.format(calendarMonthDate));
    } else if (currentViewMode === 'day') {
        dateNavLabelEl.textContent = `${cap(formatterGiornoSettimanaCompleto.format(viewAnchorDate))} ${formatterGiornoNum.format(viewAnchorDate)} ${cap(formatterMeseCompleto.format(viewAnchorDate))}`;
    } else {
        dateNavLabelEl.textContent = formatWeekLabel(viewAnchorDate);
    }
}

function selectDate(dateObj, el, allEls) {
    selectedDate = startOfDay(dateObj);
    allEls.forEach(p => p.classList.remove('active'));
    el.classList.add('active');
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    caricaAppuntamentiPerData(dateObj);
}

// Vista Giorno (pulsantino "1")
function renderDayView() {
    const d = viewAnchorDate;

    const li = document.createElement('li');
    li.className = 'date-pill day-view-pill';
    if (isSameDay(d, selectedDate)) li.classList.add('active');
    li.innerHTML = `<i class="fa-solid fa-calendar-day"></i> ${cap(formatterGiornoSettimanaCompleto.format(d))} ${formatterGiornoNum.format(d)} ${cap(formatterMeseCompleto.format(d))}`;
    li.dataset.date = d.toISOString();

    li.addEventListener('click', () => selectDate(new Date(li.dataset.date), li, [li]));

    dateCarousel.appendChild(li);
}

// Vista Settimana (pulsantino "7") - stesso stile pill originale, ma navigabile nel tempo
function renderWeekView() {
    const pills = [];
    for (let i = 0; i < 7; i++) {
        const d = addDays(viewAnchorDate, i);

        const li = document.createElement("li");
        li.className = "date-pill";
        if (isSameDay(d, selectedDate)) li.classList.add('active');

        const giornoTesto = cap(formatterGiornoLettera.format(d));
        li.textContent = `${giornoTesto} ${formatterGiornoNum.format(d)}`;
        li.dataset.date = d.toISOString();

        pills.push(li);
        dateCarousel.appendChild(li);
    }

    pills.forEach(li => {
        li.addEventListener("click", () => selectDate(new Date(li.dataset.date), li, pills));
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

    const oggi = new Date();
    const cells = [];

    for (let day = 1; day <= daysInMonth; day++) {
        const d = new Date(year, month, day);

        const cell = document.createElement('div');
        cell.className = 'calendar-day-cell';
        if (isSameDay(d, oggi)) cell.classList.add('today');
        if (isSameDay(d, selectedDate)) cell.classList.add('active');
        cell.textContent = day;
        cell.dataset.date = d.toISOString();

        cells.push(cell);
        grid.appendChild(cell);
    }

    cells.forEach(cell => {
        cell.addEventListener('click', () => selectDate(new Date(cell.dataset.date), cell, cells));
    });

    wrapper.appendChild(grid);
    dateCarousel.appendChild(wrapper);
}

// ==========================================
// Caricamento e rendering appuntamenti (Invariato)
// ==========================================

async function caricaAppuntamentiPerData(dateObj) {
    currentMonthYear.textContent = formatterMeseAnno.format(dateObj);
    appointmentsList.innerHTML = `<div style="text-align: center; padding: 20px; color: #64748B;"><i class="fa-solid fa-spinner fa-spin"></i> Caricamento...</div>`;
    appointmentsCount.textContent = "...";

    const startOfDayQuery = new Date(dateObj);
    startOfDayQuery.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(dateObj);
    endOfDay.setHours(23, 59, 59, 999);

    try {
        // Query identica (senza "luogo" per evitare l'errore di Supabase)
        const { data: appts, error } = await supabase
            .from('appointments')
            .select(`
                id,
                data_inizio,
                data_fine,
                stato,
                costo,
                pets ( nome )
            `)
            .eq('provider_id', currentUser.id)
            .eq('ruolo_provider', 'professionista') // <-- FILTRA PER PROFESSIONISTA
            .gte('data_inizio', startOfDayQuery.toISOString())
            .lte('data_inizio', endOfDay.toISOString())
            .order('data_inizio', { ascending: true });

        if (error) throw error;

        renderizzaAppuntamenti(appts || []);

    } catch (error) {
        console.error("Errore recupero agenda professionista:", error);

        await logError({
            source: 'frontend_agenda',
            action: 'fetch_appointments',
            errorMessage: error.message || "Impossibile recuperare gli appuntamenti dal database",
            errorCode: error.code || 'SUPABASE_QUERY_ERROR',
            stackTrace: error.stack,
            context: {
                target_date: dateObj.toISOString(),
                start_boundary: startOfDayQuery.toISOString(),
                end_boundary: endOfDay.toISOString(),
                provider_id: currentUser.id
            }
        });

        appointmentsList.innerHTML = `<div style="color:red; text-align:center; padding: 20px;">Errore caricamento. Controlla la console.</div>`;
        appointmentsCount.textContent = "Errore";
    }
}

function renderizzaAppuntamenti(appts) {
    appointmentsList.innerHTML = "";
    appointmentsCount.textContent = appts.length === 1 ? "1 appuntamento" : `${appts.length} appuntamenti`;

    if (appts.length === 0) {
        appointmentsList.innerHTML = `
            <div style="background: #fff; border-radius: 16px; padding: 30px; text-align: center; border: 1px dashed #CBD5E1;">
                <p style="color: #64748B; margin: 0;">Nessun appuntamento per questa data.</p>
            </div>
        `;
        return;
    }

    appts.forEach((app, index) => {
        const start = new Date(app.data_inizio).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
        const end = new Date(app.data_fine).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
        
        const nomeAnimale = app.pets ? app.pets.nome : "Animale sconosciuto";
        const stato = app.stato ? app.stato.toUpperCase() : "PROGRAMMATO";
        const costoStr = app.costo ? ` · costo €${app.costo}` : "";

        // Testi adattati per il Professionista
        const tipoServizio = "Servizio"; 
        const indirizzo = "In sede / Domicilio";

        const borderClass = (index % 2 === 1) ? 'border-blue' : 'border-orange';

        const card = document.createElement("div");
        card.className = `appt-card ${borderClass}`;
        
        card.innerHTML = `
            <div class="appt-time">${start} - ${end}</div>
            <div class="appt-title">${nomeAnimale} · ${tipoServizio}</div>
            <div class="appt-details">${indirizzo}${costoStr} · STATO: ${stato}</div>
        `;

        appointmentsList.appendChild(card);
    });
}

initAgenda();