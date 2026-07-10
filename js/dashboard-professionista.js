import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Elementi DOM
const profGreeting = document.getElementById('profGreeting');
const profSubtitle = document.getElementById('profSubtitle');
const profAvatar = document.getElementById('profAvatar');
const todayAppointmentsContainer = document.getElementById('todayAppointmentsContainer');
const btnApriAgenda = document.getElementById('btnApriAgenda');

if (btnApriAgenda) {
    btnApriAgenda.addEventListener('click', () => window.location.href = 'agenda-pro.html'); // Aggiornato al nuovo file
}

// Funzione principale
async function loadProfessionalDashboard() {
    try {
        // 1. Controllo Autenticazione
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            window.location.href = "../../index.html";
            return;
        }

        // 2. Carica Dati Base (Solo nome, cognome e avatar da profiles)
        const { data: profile, error: profError } = await supabase
            .from('profiles')
            .select('nome, cognome, avatar_url') 
            .eq('id', user.id)
            .single();

        if (profError) throw profError;

        // 3. Carica Qualifica (Da professionals)
        const { data: proData, error: proError } = await supabase
            .from('professionals')
            .select('tipo_professione')
            .eq('user_id', user.id)
            .maybeSingle();
            
        if (proError) console.warn("Dati professionista non trovati", proError);

        // Aggiorna Hero Card
        profGreeting.innerHTML = `Buongiorno,<br>${profile.nome}!`;
        if (profile.avatar_url) {
            const { data } = supabase.storage.from('avatars').getPublicUrl(profile.avatar_url);
            profAvatar.src = data.publicUrl;
        }

        // 4. Recupera Appuntamenti di OGGI
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        
        const endOfToday = new Date();
        endOfToday.setHours(23, 59, 59, 999);

        // ATTENZIONE: Assicurati che 'costo' sia il nome giusto e che 'luogo' esista nel DB. 
        // Se non esistono, toglili da questo .select()!
        const { data: appuntamenti, error: aptError } = await supabase
            .from('appointments')
            .select(`
                id, data_inizio, data_fine, stato, costo,
                pets ( nome )
            `)
            .eq('provider_id', user.id)
            .gte('data_inizio', startOfToday.toISOString())
            .lte('data_inizio', endOfToday.toISOString())
            .order('data_inizio', { ascending: true });

        if (aptError) throw aptError;

        // 5. Aggiorna Sottotitolo
        const numAppuntamenti = appuntamenti ? appuntamenti.length : 0;
        // Se proData.tipo_professione esiste lo usa, altrimenti default "professionista"
        const qualifica = proData?.tipo_professione ? proData.tipo_professione.toLowerCase() : 'professionista';
        profSubtitle.textContent = `Hai ${numAppuntamenti} servizi prenotati oggi come ${qualifica}.`;

        // 6. Renderizza la lista degli appuntamenti
        renderAppointments(appuntamenti);

    } catch (error) {
        console.error("Errore caricamento dashboard:", error);
        todayAppointmentsContainer.innerHTML = `<p style="color:#EF4444; padding: 20px;">Errore nel caricamento dei dati.</p>`;
    }
}

// Funzione per disegnare le card degli appuntamenti
function renderAppointments(appuntamenti) {
    if (!appuntamenti || appuntamenti.length === 0) {
        todayAppointmentsContainer.innerHTML = `
            <div class="apt-card border-blue" style="text-align: center; color: #64748B;">
                Non hai appuntamenti in programma per oggi. Goditi il riposo!
            </div>
        `;
        return;
    }

    let html = '';
    
    appuntamenti.forEach((apt, index) => {
        // Formattazione Orari (es. 10:00 - 11:00)
        const dateInizio = new Date(apt.data_inizio);
        const dateFine = new Date(apt.data_fine);
        const timeString = `${formatTime(dateInizio)} - ${formatTime(dateFine)}`;
        
        // Estrai nome animale
        const petName = apt.pets?.nome || 'Animale Sconosciuto';
        
        // Imposta valori predefiniti per i campi non presenti nella query base
        const servizioNome = "Servizio";
        const luogo = "In sede/Domicilio";
        const costo = apt.costo || 0;
        
        // Alterniamo colore bordo (dispari arancio, pari blu)
        const borderClass = index % 2 === 0 ? 'border-orange' : 'border-blue';

        // Creazione HTML Card
        html += `
            <div class="apt-card ${borderClass}">
                <div class="apt-time">${timeString}</div>
                <div class="apt-title">${petName} &middot; ${servizioNome}</div>
                <div class="apt-details">
                    ${luogo} &middot; €${costo} &middot; ${apt.stato || 'CONFERMATO'}
                </div>
            </div>
        `;
    });

    todayAppointmentsContainer.innerHTML = html;
}

// Helper per formattare l'orario in HH:MM
function formatTime(dateObj) {
    return dateObj.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

// Avvia il caricamento
loadProfessionalDashboard();