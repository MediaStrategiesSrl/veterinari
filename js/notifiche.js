// ==========================================
// 1. IMPORT CENTRALIZZATI
// ==========================================
import { supabase } from '../utils/supabaseClient.js';
import { logError } from '../utils/logger.js';

let currentUser = null;
let valoreAttuale = false; // ultimo valore confermato salvato sul DB (per rollback in caso di errore)

// Elementi DOM
const switchWrapper = document.getElementById('switchWrapper');
const avvisoDisattivate = document.getElementById('avvisoDisattivate');
const statusMessage = document.getElementById('statusMessage');

// ==========================================
// INIZIALIZZAZIONE PAGINA
// ==========================================
async function init() {
    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) throw Object.assign(new Error(authError.message), { code: authError.code || 'AUTH_SYS_ERROR' });

        if (!user) {
            window.location.href = "../../index.html";
            return;
        }
        currentUser = user;

        const { data: profilo, error: profiloError } = await supabase
            .from('profiles')
            .select('email_notifications_enabled')
            .eq('id', user.id)
            .single();

        if (profiloError) throw Object.assign(new Error(profiloError.message), { code: profiloError.code || 'DB_FETCH_PROFILE_ERROR' });

        valoreAttuale = profilo?.email_notifications_enabled === true;
        renderSwitch(valoreAttuale);

    } catch (error) {
        console.error("Errore caricamento preferenze notifiche:", error);
        switchWrapper.innerHTML = `<span style="font-size:0.72rem; color:#DC2626;">Errore</span>`;
        await logError({
            source: 'notifiche_preferenze',
            action: 'init_page',
            errorMessage: error.message || "Errore durante il caricamento delle preferenze notifiche",
            errorCode: error.code || 'UNKNOWN_SYS_ERROR',
            context: {}
        });
    }
}

// Sostituisce lo skeleton di caricamento con l'interruttore reale, già impostato sul valore salvato
function renderSwitch(valore) {
    switchWrapper.innerHTML = `
        <input type="checkbox" id="toggleEmail" ${valore ? 'checked' : ''}>
        <label class="switch-track" for="toggleEmail"></label>
    `;
    document.getElementById('toggleEmail').addEventListener('change', onToggleChange);
    aggiornaAvviso(valore);
}

function aggiornaAvviso(valore) {
    avvisoDisattivate.classList.toggle('visibile', !valore);
}

// ==========================================
// SALVATAGGIO PREFERENZA (istantaneo al cambio dell'interruttore)
// ==========================================
async function onToggleChange(e) {
    const nuovoValore = e.target.checked;

    // Chi disattiva perde l'accesso a prenotazioni/appuntamenti (stesso vincolo
    // del checkbox in registrazione, gestito da canUsePlatform() in permissions.js):
    // chiediamo conferma esplicita prima di procedere.
    if (!nuovoValore) {
        const confermato = confirm("Se disattivi le comunicazioni email non potrai più prenotare visite o appuntamenti. Vuoi continuare?");
        if (!confermato) {
            e.target.checked = true; // ripristina lo stato precedente senza toccare il DB
            return;
        }
    }

    e.target.disabled = true;
    statusMessage.hidden = true;

    try {
        const { error } = await supabase
            .from('profiles')
            .update({ email_notifications_enabled: nuovoValore })
            .eq('id', currentUser.id);

        if (error) throw Object.assign(new Error(error.message), { code: error.code || 'DB_UPDATE_PROFILE_ERROR' });

        valoreAttuale = nuovoValore;
        aggiornaAvviso(nuovoValore);

        statusMessage.textContent = nuovoValore
            ? "Comunicazioni email attivate."
            : "Comunicazioni email disattivate.";
        statusMessage.className = "status-message success";
        statusMessage.hidden = false;

    } catch (error) {
        console.error("Errore salvataggio preferenza notifiche:", error);
        e.target.checked = valoreAttuale; // rollback visivo allo stato realmente salvato sul DB

        statusMessage.textContent = "Errore durante il salvataggio. Riprova.";
        statusMessage.className = "status-message error";
        statusMessage.hidden = false;

        await logError({
            source: 'notifiche_preferenze',
            action: 'update_preference',
            errorMessage: error.message || "Impossibile aggiornare email_notifications_enabled",
            errorCode: error.code || 'UNKNOWN_DB_ERROR',
            context: { nuovoValore }
        });
    } finally {
        e.target.disabled = false;
    }
}

init();