// ==========================================
// IMPORT CENTRALIZZATI (stesso pattern di dashboard-proprietario.js)
// ==========================================
import { supabase } from '../utils/supabaseClient.js';
import { logError } from '../utils/logger.js';

const agendaContainer = document.getElementById("agendaContainer");
const btnBack = document.getElementById("btnBack");

if (btnBack) {
    btnBack.addEventListener("click", () => {
        window.location.href = "dashboard-proprietario.html";
    });
}

// 1. ASCOLTA SESSIONE (identico a dashboard-proprietario.js)
supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT" || !session) {
        window.location.href = "../../index.html";
    } else if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
        loadAgenda(session.user);
    }
});

async function loadAgenda(user) {
    if (!agendaContainer) return;
    agendaContainer.innerHTML = '<p style="text-align:center; color:#888; font-size:0.9rem;"><i class="fa-solid fa-spinner fa-spin"></i> Caricamento agenda...</p>';

    const oggi = new Date();
    oggi.setHours(0, 0, 0, 0);
    const oggiISO = oggi.toISOString();

    try {
        // --- APPUNTAMENTI (tutti quelli futuri, non solo il primo) ---
        const { data: appuntamenti, error: appError } = await supabase
            .from("appointments")
            .select(`
                id,
                data_inizio,
                stato,
                pets ( nome ),
                provider:profiles!appointments_provider_id_fkey ( nome, cognome )
            `)
            .eq("owner_id", user.id)
            .gte("data_inizio", oggiISO)
            .order("data_inizio", { ascending: true });

        if (appError) throw Object.assign(new Error(appError.message), { code: appError.code || 'DB_AGENDA_FETCH_ERROR' });

        // --- PASSEGGIATE (tutte quelle future) ---
        const { data: partecipazioni, error: walkError } = await supabase
            .from("walk_participants")
            .select(`
                pets ( nome ),
                walks ( id, luogo, titolo, data_passeggiata )
            `)
            .eq("owner_id", user.id);

        if (walkError) throw Object.assign(new Error(walkError.message), { code: walkError.code || 'DB_WALKS_FETCH_ERROR' });

        // --- UNIONE DELLE DUE LISTE E ORDINAMENTO PER DATA ---
        const impegni = [];

        (appuntamenti || []).forEach(apt => {
            impegni.push({
                tipo: "appuntamento",
                data: apt.data_inizio,
                petNome: apt.pets?.nome,
                dottore: apt.provider?.cognome ? `Dott.ssa/Dott. ${apt.provider.cognome}` : "Veterinario",
            });
        });

        (partecipazioni || [])
            .filter(p => p.walks && p.walks.data_passeggiata >= oggiISO)
            .forEach(p => {
                impegni.push({
                    tipo: "passeggiata",
                    data: p.walks.data_passeggiata,
                    petNome: p.pets?.nome,
                    luogo: p.walks.luogo,
                });
            });

        impegni.sort((a, b) => new Date(a.data) - new Date(b.data));

        renderAgenda(impegni);

    } catch (error) {
        console.error("Errore in loadAgenda:", error);
        await logError({
            source: 'frontend_agenda',
            action: 'load_agenda_completa',
            errorMessage: error.message,
            errorCode: error.code || 'UNKNOWN_ERROR',
            stackTrace: error.stack,
            context: { user_id: user?.id }
        });
        if (agendaContainer) {
            agendaContainer.innerHTML = '<p style="text-align:center; color:red; padding:1rem;">Errore nel caricamento dell\'agenda.</p>';
        }
    }
}

function renderAgenda(impegni) {
    if (!agendaContainer) return;

    if (!impegni || impegni.length === 0) {
        agendaContainer.innerHTML = '<p style="text-align:center; color:#888; padding:1rem;">Nessun impegno in programma.</p>';
        return;
    }

    agendaContainer.innerHTML = impegni.map(item => {
        const dataFormattata = formattaData(item.data);
        const petLabel = item.petNome ? ` · ${item.petNome}` : '';

        if (item.tipo === "appuntamento") {
            return `
                <div class="agenda-card">
                    <div class="agenda-icon icon-orange">
                        <i class="fa-solid fa-shield-halved"></i>
                    </div>
                    <div class="agenda-info">
                        <div class="agenda-title">Controllo veterinario${petLabel} <span>&gt;</span></div>
                        <div class="agenda-desc">${dataFormattata} – ${item.dottore}</div>
                    </div>
                </div>
            `;
        }

        return `
            <div class="agenda-card">
                <div class="agenda-icon icon-blue">
                    <i class="fa-solid fa-tree"></i>
                </div>
                <div class="agenda-info">
                    <div class="agenda-title">Passeggiata ${item.luogo}${petLabel} <span>&gt;</span></div>
                    <div class="agenda-desc">${dataFormattata}</div>
                </div>
            </div>
        `;
    }).join('');
}

// ==========================================
// FUNZIONE DI UTILITÀ FORMATTAZIONE DATA (identica a dashboard-proprietario.js)
// ==========================================
function formattaData(isoString) {
    const data = new Date(isoString);
    const opzioniGiorno = { day: 'numeric', month: 'long' };
    const giornoStr = data.toLocaleDateString('it-IT', opzioniGiorno);
    const oreStr = data.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    return `${giornoStr} · ore ${oreStr}`;
}