// ==========================================
// 1. IMPORT CENTRALIZZATI E SETUP
// ==========================================
import { supabase } from '../utils/supabaseClient.js';

// Elementi DOM - Header & Statistiche Generali
const periodoTesto = document.getElementById('periodoTesto');
const statVisualizzazioni = document.getElementById('statVisualizzazioni');
const statCtr = document.getElementById('statCtr');

// Elementi DOM - Grafici e Liste
const chartBars = document.getElementById('chartBars');
const listaCitta = document.getElementById('listaCitta');

// Mappa giorni settimana (L, M, M, G, V, S, D)
const GIORNI_SETTIMANA = ['D', 'L', 'M', 'M', 'G', 'V', 'S']; 

// ==========================================
// 2. INIZIALIZZAZIONE PAGINA
// ==========================================
async function init() {
    try {
        // 1. Controllo Autenticazione
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            window.location.href = 'login.html';
            return;
        }

        // 2. Controllo Ruolo Sponsor
        const { data: sponsor, error: sponsorError } = await supabase
            .from('sponsors')
            .select('user_id')
            .eq('user_id', user.id)
            .single();

        if (sponsorError || !sponsor) {
            alert("Accesso negato. Non risulti registrato come Sponsor.");
            window.location.href = 'index.html';
            return;
        }

        // Imposta il periodo (Es. 1-10 giugno 2026)
        impostaTestoData();

        // 3. Carica i dati dal Database
        await caricaDatiStatistiche(sponsor.user_id);

    } catch (error) {
        console.error("Errore durante l'inizializzazione delle statistiche:", error);
        mostraErroreUI();
    }
}

// ==========================================
// 3. RECUPERO DATI E CALCOLI
// ==========================================
async function caricaDatiStatistiche(sponsorId) {
    try {
        // Definiamo il range temporale (es. ultimi 10 giorni)
        const oggi = new Date();
        const dataInizio = new Date();
        dataInizio.setDate(oggi.getDate() - 9); // Oggi + ultimi 9 giorni = 10 giorni
        
        // Recuperiamo TUTTI gli eventi (impression e click) delle campagne di questo sponsor
        // tramite la relazione: campaign_events -> sponsor_campaigns
        const { data: eventi, error } = await supabase
            .from('campaign_events')
            .select(`
                event_type, 
                viewer_city, 
                created_at,
                sponsor_campaigns!inner(sponsor_id)
            `)
            .eq('sponsor_campaigns.sponsor_id', sponsorId)
            .gte('created_at', dataInizio.toISOString());

        if (error) throw error;

        elaboraDati(eventi, dataInizio);

    } catch (error) {
        console.error("Errore recupero statistiche dal DB:", error);
        mostraErroreUI();
    }
}

function elaboraDati(eventi, dataInizio) {
    if (!eventi || eventi.length === 0) {
        renderStatoVuoto();
        return;
    }

    let visualizzazioni = 0;
    let click = 0;
    const mappaCitta = {};
    const mappaGiorni = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 0: 0 }; // 0 = Domenica, 1 = Lunedì...

    eventi.forEach(evento => {
        // Conteggio Base
        if (evento.event_type === 'impression') visualizzazioni++;
        if (evento.event_type === 'click') click++;

        // Raggruppamento per Città (Solo impression)
        // La geolocalizzazione è dedotta dalla città di residenza dell'utente (viewer_city)
        if (evento.event_type === 'impression') {
            const citta = evento.viewer_city || 'Sconosciuta';
            mappaCitta[citta] = (mappaCitta[citta] || 0) + 1;
        }

        // Raggruppamento per Giorno (Solo impression per il grafico)
        if (evento.event_type === 'impression') {
            const giornoSettimana = new Date(evento.created_at).getDay();
            mappaGiorni[giornoSettimana]++;
        }
    });

    // Calcolo CTR
    const ctr = visualizzazioni > 0 ? (click / visualizzazioni) * 100 : 0;

    // Renderizza UI
    aggiornaKpiGenerali(visualizzazioni, ctr);
    renderGrafico(mappaGiorni);
    renderListaCitta(mappaCitta, visualizzazioni);
}

// ==========================================
// 4. RENDER INTERFACCIA GRAFICA (UI)
// ==========================================
function aggiornaKpiGenerali(visualizzazioni, ctr) {
    // Formattazione italiana (es. 12.480)
    statVisualizzazioni.textContent = new Intl.NumberFormat('it-IT').format(visualizzazioni);
    
    // Formattazione percentuale (es. 5,0%)
    statCtr.textContent = `${ctr.toFixed(1).replace('.', ',')}%`;
}

function renderGrafico(mappaGiorni) {
    chartBars.innerHTML = ''; // Svuota lo skeleton

    // Trova il valore massimo per scalare le altezze (max 100%)
    const maxVisualizzazioni = Math.max(...Object.values(mappaGiorni));

    // Riordina partendo da Lunedì (1) fino a Domenica (0)
    const ordineGiorni = [1, 2, 3, 4, 5, 6, 0];
    
    // Palette colori del mockup (Alternanza Azzurro / Arancio)
    const colori = ['#5CAFC8', '#F2AE54', '#5CAFC8', '#F2AE54', '#5CAFC8', '#F2AE54', '#5CAFC8'];

    ordineGiorni.forEach((indiceGiorno, idx) => {
        const valore = mappaGiorni[indiceGiorno];
        const altezzaPercentuale = maxVisualizzazioni > 0 ? (valore / maxVisualizzazioni) * 100 : 0;
        
        // Assicura un'altezza minima visiva anche per giorni con 0 visite
        const altezzaReale = Math.max(altezzaPercentuale, 5); 

        const barHtml = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 120px; gap: 8px;">
                <div style="
                    width: 38px; 
                    background-color: ${colori[idx]}; 
                    height: ${altezzaReale}%; 
                    border-radius: 6px; 
                    transition: height 0.5s ease-out;
                "></div>
                <span style="font-size: 11px; font-weight: 700; color: #9CA3AF;">${GIORNI_SETTIMANA[indiceGiorno]}</span>
            </div>
        `;
        chartBars.insertAdjacentHTML('beforeend', barHtml);
    });
}

function renderListaCitta(mappaCitta, totaleVisualizzazioni) {
    listaCitta.innerHTML = '';

    // Trasforma in array e ordina in modo decrescente
    const arrayCitta = Object.entries(mappaCitta)
        .map(([nome, views]) => ({ nome, views }))
        .sort((a, b) => b.views - a.views);

    if (arrayCitta.length === 0) {
        listaCitta.innerHTML = '<p style="color: #6B7280; text-align: center; font-size: 14px;">Dati geografici non ancora disponibili.</p>';
        return;
    }

    arrayCitta.forEach(citta => {
        const percentuale = Math.round((citta.views / totaleVisualizzazioni) * 100);
        const numeroFormattato = new Intl.NumberFormat('it-IT').format(citta.views);

        const cardHtml = `
            <div style="
                background: #FFFFFF; 
                border-radius: 16px; 
                padding: 16px; 
                margin-bottom: 12px; 
                display: flex; 
                align-items: center; 
                gap: 16px;
                box-shadow: 0 4px 15px rgba(0,0,0,0.03);
            ">
                <div style="
                    width: 48px; 
                    height: 48px; 
                    background: #FEF4EB; 
                    color: #F28B24; 
                    border-radius: 12px; 
                    display: flex; 
                    align-items: center; 
                    justify-content: center;
                    flex-shrink: 0;
                ">
                    <i class="fa-solid fa-location-crosshairs"></i>
                </div>
                <div style="flex: 1;">
                    <h3 style="margin: 0 0 2px 0; font-size: 16px; font-weight: 700; color: #1C2430;">${citta.nome}</h3>
                    <p style="margin: 0; font-size: 13px; color: #6B7280;">${numeroFormattato} visualizzazioni · ${percentuale}%</p>
                </div>
                <i class="fa-solid fa-chevron-right" style="color: #CBD5E1; font-size: 14px;"></i>
            </div>
        `;
        listaCitta.insertAdjacentHTML('beforeend', cardHtml);
    });
}

// ==========================================
// 5. UTILITIES E STATI
// ==========================================
function impostaTestoData() {
    const oggi = new Date();
    const dataInizio = new Date();
    dataInizio.setDate(oggi.getDate() - 9);

    const formatta = (data) => data.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
    
    // Es: "1-10 giugno 2026"
    const meseInizio = dataInizio.toLocaleString('it-IT', { month: 'long' });
    const meseFine = oggi.toLocaleString('it-IT', { month: 'long' });
    
    if (meseInizio === meseFine) {
        periodoTesto.textContent = `${dataInizio.getDate()}-${oggi.getDate()} ${meseFine} ${oggi.getFullYear()}`;
    } else {
        periodoTesto.textContent = `${formatta(dataInizio)} - ${formatta(oggi)}`;
    }
}

function renderStatoVuoto() {
    statVisualizzazioni.textContent = "0";
    statCtr.textContent = "0%";
    chartBars.innerHTML = '<p style="color: #6B7280; text-align: center; width:100%; font-size: 14px; margin: 40px 0;">Nessun dato registrato nel periodo selezionato.</p>';
    listaCitta.innerHTML = '<p style="color: #6B7280; text-align: center; font-size: 14px;">Dati non disponibili.</p>';
}

function mostraErroreUI() {
    statVisualizzazioni.textContent = "Err";
    statCtr.textContent = "Err";
    chartBars.innerHTML = '<p style="color: #EA4335; text-align: center; width:100%; font-size: 14px;">Errore nel caricamento del grafico.</p>';
    listaCitta.innerHTML = '<p style="color: #EA4335; text-align: center; font-size: 14px;">Impossibile recuperare la geolocalizzazione.</p>';
}

// Avvio applicazione
document.addEventListener('DOMContentLoaded', init);