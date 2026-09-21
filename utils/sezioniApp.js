// ==========================================
// SEZIONI DELL'APP TARGETIZZABILI DAI BANNER SPONSOR
// ==========================================
// Fonte unica di verità per l'elenco delle sezioni, usata sia dal
// pannello sponsor (campagne.js, per far scegliere le sezioni target)
// sia da ogni pagina dell'app che mostra banner (bannerSponsor.js).
//
// Per aggiungere una nuova sezione targetizzabile basta aggiungere
// una voce qui: comparirà automaticamente nel form "Nuova campagna".
export const SEZIONI_APP = [
    { value: 'mercatino', label: 'Mercatino' },
    { value: 'passeggiate', label: 'Passeggiate' },
    { value: 'ricerca_professionisti', label: 'Ricerca professionisti' },
    { value: 'prenotazione', label: 'Pagina di prenotazione' },
    { value: 'home_proprietario', label: 'Home proprietario' },
    // richiedeRuoloProprietario: su queste 2 sezioni il banner viene
    // mostrato solo a chi, oltre al ruolo veterinario/professionista, ha
    // ANCHE il ruolo proprietario (cioè ha almeno un animale registrato) -
    // vedi bannerSponsor.js. Chi ha SOLO il ruolo veterinario/professionista
    // non vede mai il banner su queste due pagine.
    { value: 'dashboard_veterinario', label: 'Dashboard veterinario', richiedeRuoloProprietario: true },
    { value: 'dashboard_professionista', label: 'Dashboard professionista', richiedeRuoloProprietario: true }
];

// Converte un codice sezione (es. 'mercatino') nella label leggibile
// (es. 'Mercatino'). Se il codice non è in elenco, ritorna il codice
// stesso così da non far sparire dati vecchi/non mappati.
export function etichettaSezione(value) {
    const sezione = SEZIONI_APP.find(s => s.value === value);
    return sezione ? sezione.label : value;
}

// Converte un array di codici sezione in una stringa leggibile
// separata da virgole, per le card di riepilogo campagna.
export function etichettaSezioni(values) {
    if (!values || values.length === 0) return 'Nessuna sezione';
    return values.map(etichettaSezione).join(', ');
}