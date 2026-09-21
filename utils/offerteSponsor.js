// ==========================================
// OFFERTE SPONSOR (pacchetti fissi di visualizzazioni)
// ==========================================

export const OFFERTE_SPONSOR = [
    { value: 'offerta_12500', views: 12500, prezzo: 250, costoBase: 0.02 },
    { value: 'offerta_25000', views: 25000, prezzoPieno: 500, prezzo: 475, costoBase: 0.019, scontoPercentuale: 5 },
    { value: 'offerta_50000', views: 50000, prezzo: 900, costoBase: 0.018 }
];

// Offerta selezionata di default all'apertura del form.
export const OFFERTA_DEFAULT = 'offerta_25000';

export function trovaOfferta(value) {
    return OFFERTE_SPONSOR.find(o => o.value === value) || null;
}

export function formattaEuro(valore) {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(valore || 0);
}