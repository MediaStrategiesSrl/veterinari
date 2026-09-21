// ==========================================
// UTILITY CONDIVISE: ANTI-SOVRAPPOSIZIONE ORARI
// ==========================================
// Una stessa persona (provider_id) può avere più righe in
// provider_locations, con ruoli diversi (veterinario, professionista, ecc.)
// o più sedi dello stesso ruolo. Queste utility impediscono di salvare
// orari che si sovrappongono tra due sedi diverse dello stesso provider,
// perché fisicamente non può essere disponibile in due posti insieme.
//
// Usato da: disponibilita.js (veterinario) e disponibilita-pro.js (professionista).

export const GIORNI_SETTIMANA = ["lunedi", "martedi", "mercoledi", "giovedi", "venerdi", "sabato", "domenica"];

export function timeToMinutes(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
}

// Due fasce si sovrappongono solo se si intersecano davvero.
// Fasce "back-to-back" (fine di una = inizio dell'altra) NON sono un conflitto.
export function slotsOverlap(slotA, slotB) {
    const startA = timeToMinutes(slotA.inizio);
    const endA = timeToMinutes(slotA.fine);
    const startB = timeToMinutes(slotB.inizio);
    const endB = timeToMinutes(slotB.fine);
    return startA < endB && startB < endA;
}

/**
 * Confronta `nuoviOrari` (quelli che si stanno per salvare per `currentLocationId`)
 * con gli orari già salvati in `altreSedi`.
 * `altreSedi` è un array di { id, nome_struttura, orari_disponibilita }
 * e deve includere TUTTE le sedi del provider, indipendentemente dal ruolo.
 *
 * Ritorna il primo conflitto trovato { giorno, sedeNome } oppure null.
 */
export function findScheduleConflict(currentLocationId, nuoviOrari, altreSedi) {
    for (const sede of altreSedi || []) {
        if (sede.id === currentLocationId) continue;

        const orariSede = (typeof sede.orari_disponibilita === 'object' && sede.orari_disponibilita !== null)
            ? sede.orari_disponibilita
            : {};

        for (const giorno of GIORNI_SETTIMANA) {
            const fasceNuove = nuoviOrari[giorno] || [];
            const fasceEsistenti = orariSede[giorno] || [];

            for (const slotNuovo of fasceNuove) {
                for (const slotEsistente of fasceEsistenti) {
                    if (slotsOverlap(slotNuovo, slotEsistente)) {
                        return { giorno, sedeNome: sede.nome_struttura };
                    }
                }
            }
        }
    }
    return null;
}

export function clearConflictHighlight(container) {
    if (!container) return;
    container.querySelectorAll('.day-card').forEach(card => {
        card.style.border = '';
    });
}

export function highlightConflictDay(container, giorno) {
    if (!container) return;
    const card = container.querySelector(`.day-card[data-day="${giorno}"]`);
    if (card) {
        card.style.border = '2px solid #e53935';
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

// Recupera TUTTE le sedi di un provider (qualsiasi ruolo), il minimo
// indispensabile per poter controllare le sovrapposizioni.
export function fetchAllProviderLocations(supabase, providerId) {
    return supabase
        .from('provider_locations')
        .select('id, nome_struttura, orari_disponibilita')
        .eq('provider_id', providerId);
}