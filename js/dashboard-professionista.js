// 1. IMPORT CENTRALIZZATI
// ==========================================
import { supabase } from '../utils/supabaseClient.js';
import { logError } from '../utils/logger.js';

// Elementi DOM
const profGreeting = document.getElementById('profGreeting');
const profSubtitle = document.getElementById('profSubtitle');
const profAvatar = document.getElementById('profAvatar');
const todayAppointmentsContainer = document.getElementById('todayAppointmentsContainer');
const btnApriAgenda = document.getElementById('btnApriAgenda');

if (btnApriAgenda) {
    btnApriAgenda.addEventListener('click', () => window.location.href = 'agenda-pro.html');
}

// Funzione principale
async function loadProfessionalDashboard() {
    let currentUserId = null;

    try {
        // 1. Controllo Autenticazione
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        if (authError || !user) {
            if (authError) {
                await logError({
                    source: 'frontend_dashboard_pro',
                    action: 'auth_check',
                    errorMessage: authError.message || "Errore durante la validazione del token utente",
                    errorCode: authError.code || 'AUTH_VALIDATION_ERROR',
                    context: { userAgent: navigator.userAgent }
                });
            }
            window.location.href = "../../index.html";
            return;
        }

        currentUserId = user.id;

        // 2. Carica Dati Base (Solo nome, cognome e avatar da profiles)
        const { data: profile, error: profError } = await supabase
            .from('profiles')
            .select('nome, cognome, avatar_url') 
            .eq('id', user.id)
            .maybeSingle();

        if (profError) throw Object.assign(new Error(profError.message), { code: profError.code || 'DB_PROFILE_FETCH_ERROR' });

        // --- FIX APPLICATO QUI: Controllo se il profilo esiste ---
        if (!profile) {
            console.warn("⚠️ Nessun profilo trovato nel DB per questo utente.");
            profGreeting.innerHTML = `Buongiorno,<br>Professionista!`;
            // Opzionale: decommenta la riga sotto se vuoi forzare l'utente a compilare il profilo
            // window.location.href = 'completa-profilo.html';
        } else {
            // Aggiorna Hero Card con i dati reali
            profGreeting.innerHTML = `Buongiorno,<br>${profile.nome}!`;
            if (profile.avatar_url) {
                const { data } = supabase.storage.from('avatars').getPublicUrl(profile.avatar_url);
                profAvatar.src = data.publicUrl;
            }
        }
        // ---------------------------------------------------------

        // 3. Carica Qualifica (Da professionals)
        const { data: proData, error: proError } = await supabase
            .from('professionals')
            .select('tipo_professione')
            .eq('user_id', user.id)
            .maybeSingle();
            
        if (proError) console.warn("Dati professionista non trovati", proError);

        // 4. Recupera Appuntamenti di OGGI
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        
        const endOfToday = new Date();
        endOfToday.setHours(23, 59, 59, 999);

        const { data: appuntamenti, error: aptError } = await supabase
            .from('appointments')
            .select(`
                id, data_inizio, data_fine, stato, costo,
                pets ( nome )
            `)
            .eq('provider_id', user.id)
            .eq('ruolo_provider', 'professionista') // <-- FIX: questa dashboard è quella del ruolo "professionista",
                                                      //     senza questo filtro comparivano anche gli appuntamenti
                                                      //     presi sullo stesso account nel ruolo "veterinario".
            .gte('data_inizio', startOfToday.toISOString())
            .lte('data_inizio', endOfToday.toISOString())
            .order('data_inizio', { ascending: true });

        if (aptError) throw Object.assign(new Error(aptError.message), { code: aptError.code || 'DB_APPOINTMENTS_FETCH_ERROR' });

        // ==========================================
        // 5. AGGIORNA SOTTOTITOLO CON LAVORO EFFETTIVO
        // ==========================================
        const numAppuntamenti = appuntamenti ? appuntamenti.length : 0;
        
        // Testo fedele al mockup: "servizi prenotati oggi"
        const parolaServizio = numAppuntamenti === 1 ? 'servizio prenotato' : 'servizi prenotati';
        
        let qualifica = "professionista"; // Fallback di base
        
        if (proData && proData.tipo_professione) {
            const tipoPulito = proData.tipo_professione.trim().toLowerCase();
            
            // Se il DB restituisce un valore valido e diverso da "altro", lo usiamo
            if (tipoPulito !== "" && tipoPulito !== "altro") {
                qualifica = tipoPulito;
            }
        }
        
        // Output finale esatto
        profSubtitle.textContent = `Hai ${numAppuntamenti} ${parolaServizio} oggi come ${qualifica}.`;
        // ==========================================

        // 6. Renderizza la lista degli appuntamenti
        renderAppointments(appuntamenti);

    } catch (error) {
        console.error("Errore caricamento dashboard:", error);
        
        await logError({
            source: 'frontend_dashboard_pro',
            action: 'load_dashboard_data',
            errorMessage: error.message || "Fallimento durante il recupero dei dati della dashboard",
            errorCode: error.code || 'DASHBOARD_DATA_ERROR',
            stackTrace: error.stack,
            context: {
                user_id: currentUserId || 'sconosciuto',
                target_date: new Date().toISOString()
            }
        });

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