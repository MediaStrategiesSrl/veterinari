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

        // --- GESTIONE PROFILO E AVATAR ---
        if (!profile) {
            console.warn("⚠️ Nessun profilo trovato nel DB per questo utente.");
            profGreeting.innerHTML = `Buongiorno,<br>Professionista!`;
        } else {
            const nomeUtente = profile.nome || "Professionista";
            profGreeting.innerHTML = `Buongiorno,<br>${nomeUtente}!`;

            // Logica Avatar (con fallback dinamico e anti-cache)
            let finalAvatarUrl = "";
            const fallbackUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(nomeUtente)}&background=E0F2FE&color=0284C7`;

            if (profile.avatar_url) {
                if (profile.avatar_url.startsWith('http://') || profile.avatar_url.startsWith('https://')) {
                    finalAvatarUrl = profile.avatar_url;
                } else {
                    // FIX: Il bucket è 'storage_veterinari', non 'avatars'
                    const { data } = supabase.storage.from('storage_veterinari').getPublicUrl(profile.avatar_url);
                    // Aggiungiamo il timestamp per forzare il refresh visivo ed evitare la cache
                    finalAvatarUrl = `${data.publicUrl}?t=${new Date().getTime()}`;
                }
            } else {
                finalAvatarUrl = fallbackUrl;
            }

            // Iniezione sicura
            if (profAvatar) {
                profAvatar.onerror = null;
                profAvatar.src = finalAvatarUrl;
                
                // Fallback in caso di immagine rotta
                profAvatar.onerror = () => {
                    console.warn("Impossibile caricare l'avatar. Uso il fallback.");
                    profAvatar.onerror = null;
                    profAvatar.src = fallbackUrl;
                };
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
            .eq('ruolo_provider', 'professionista') 
            .gte('data_inizio', startOfToday.toISOString())
            .lte('data_inizio', endOfToday.toISOString())
            .order('data_inizio', { ascending: true });

        if (aptError) throw Object.assign(new Error(aptError.message), { code: aptError.code || 'DB_APPOINTMENTS_FETCH_ERROR' });

        // ==========================================
        // 5. AGGIORNA SOTTOTITOLO CON LAVORO EFFETTIVO
        // ==========================================
        const numAppuntamenti = appuntamenti ? appuntamenti.length : 0;
        
        const parolaServizio = numAppuntamenti === 1 ? 'servizio prenotato' : 'servizi prenotati';
        let qualifica = "professionista"; 
        
        if (proData && proData.tipo_professione) {
            const tipoPulito = proData.tipo_professione.trim().toLowerCase();
            if (tipoPulito !== "" && tipoPulito !== "altro") {
                qualifica = tipoPulito;
            }
        }
        
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
        const dateInizio = new Date(apt.data_inizio);
        const dateFine = new Date(apt.data_fine);
        const timeString = `${formatTime(dateInizio)} - ${formatTime(dateFine)}`;
        
        const petName = apt.pets?.nome || 'Animale Sconosciuto';
        const servizioNome = "Servizio";
        const luogo = "In sede/Domicilio";
        const costo = apt.costo || 0;
        
        const borderClass = index % 2 === 0 ? 'border-orange' : 'border-blue';

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