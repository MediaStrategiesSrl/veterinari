// ==========================================
// MODERAZIONE CONTENUTI - Mercatino dell'usato
// ==========================================
// Punto 5 del PDF: blocca riferimenti a prezzi/pagamenti/scambi.
// Usato da: nuovo-annuncio.js (titolo/descrizione), dettaglio-annuncio.js
// (messaggio "Mi interessa"), richiesta.js (messaggi di chat).
//
// NOTA IMPORTANTE: questo è un filtro testuale semplice (case-insensitive,
// per sottostringa). Un utente in mala fede può aggirarlo (es. scrivendo
// "s c a m b i o" o usando sinonimi non elencati). Per questo lo stato
// PENDING_REVIEW esiste nel modello dati: consigliamo di affiancare a
// questo filtro automatico una moderazione manuale a campione, non di
// fidarsi solo del filtro lato client.

export const TERMINI_VIETATI = [
    'vendita', 'vendo', 'in vendita',
    'prezzo', 'prezzi',
    'euro', '€',
    'pagamento', 'pagare',
    'bonifico',
    'paypal',
    'postepay',
    'rimborso', 'rimborso spese',
    'scambio', 'scambio con',
    'permuta',
    'in cambio',
    'conguaglio',
    'offerta',
    'asta'
];

export const MESSAGGIO_BLOCCO =
    "Nel Mercatino dell'usato di Veterinari.it gli oggetti possono essere soltanto regalati. " +
    "Non sono consentiti prezzi, pagamenti, rimborsi, scambi o richieste di beni e servizi in cambio.";

/**
 * Restituisce l'elenco dei termini vietati trovati nel testo (vuoto se nessuno).
 */
export function trovaTerminiVietati(testo) {
    if (!testo) return [];
    const normalizzato = testo.toLowerCase();
    return TERMINI_VIETATI.filter(termine => normalizzato.includes(termine.toLowerCase()));
}

/**
 * True se il testo contiene almeno un termine vietato.
 */
export function contieneTerminiVietati(testo) {
    return trovaTerminiVietati(testo).length > 0;
}

/**
 * Verifica uno o più campi di testo insieme (es. titolo + descrizione).
 * Restituisce { bloccato: boolean, termini: string[] }.
 */
export function verificaCampi(...campi) {
    const testoUnito = campi.filter(Boolean).join(' ');
    const termini = trovaTerminiVietati(testoUnito);
    return { bloccato: termini.length > 0, termini };
}

// ==========================================
// Rilevamento dati personali (punto 9 del PDF)
// Usato in chat per mostrare l'avviso privacy.
// ==========================================
const PATTERN_TELEFONO = /(\+39\s?)?3\d{2}[\s.-]?\d{3}[\s.-]?\d{3,4}/;
const PATTERN_EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const PAROLE_INDIRIZZO = ['via ', 'viale ', 'piazza ', 'corso ', 'indirizzo', 'civico'];

export function contieneDatiPersonali(testo) {
    if (!testo) return false;
    const normalizzato = testo.toLowerCase();
    if (PATTERN_TELEFONO.test(testo)) return true;
    if (PATTERN_EMAIL.test(testo)) return true;
    if (PAROLE_INDIRIZZO.some(p => normalizzato.includes(p))) return true;
    return false;
}

export const AVVISO_DATI_PERSONALI =
    "Stai condividendo un dato personale con un altro utente. Comunica solo le informazioni necessarie e, " +
    "quando possibile, concorda il ritiro in un luogo pubblico.";