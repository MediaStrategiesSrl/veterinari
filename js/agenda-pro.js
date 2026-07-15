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
const formatterMeseAnno = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' });

async function initAgenda() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        window.location.href = "index.html"; // Adatta alla tua pagina di login
        return;
    }
    currentUser = user;

    costruisciCaroselloDate();
}

function costruisciCaroselloDate() {
    dateCarousel.innerHTML = "";
    const oggi = new Date();
    
    for (let i = -7; i <= 21; i++) {
        const d = new Date(oggi);
        d.setDate(oggi.getDate() + i);
        
        const li = document.createElement("li");
        li.className = "date-pill";
        if (i === 0) li.classList.add("active");
        
        const giornoTesto = formatterGiornoLettera.format(d);
        const giornoCapitalized = giornoTesto.charAt(0).toUpperCase() + giornoTesto.slice(1);
        li.textContent = `${giornoCapitalized} ${formatterGiornoNum.format(d)}`;
        li.dataset.date = d.toISOString();

        li.addEventListener("click", () => {
            document.querySelectorAll(".date-pill").forEach(el => el.classList.remove("active"));
            li.classList.add("active");
            li.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            
            caricaAppuntamentiPerData(new Date(li.dataset.date));
        });

        dateCarousel.appendChild(li);
    }

    setTimeout(() => {
        const todayPill = dateCarousel.querySelector(".date-pill.active");
        if(todayPill) todayPill.scrollIntoView({ inline: 'center' });
    }, 100);

    caricaAppuntamentiPerData(oggi);
}

async function caricaAppuntamentiPerData(dateObj) {
    currentMonthYear.textContent = formatterMeseAnno.format(dateObj);
    appointmentsList.innerHTML = `<div style="text-align: center; padding: 20px; color: #64748B;"><i class="fa-solid fa-spinner fa-spin"></i> Caricamento...</div>`;
    appointmentsCount.textContent = "...";

    const startOfDay = new Date(dateObj);
    startOfDay.setHours(0, 0, 0, 0);
    
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
            .gte('data_inizio', startOfDay.toISOString())
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
                start_boundary: startOfDay.toISOString(),
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