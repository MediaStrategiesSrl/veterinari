import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Elementi DOM
const backBtn = document.getElementById("backBtn");
const headerSubtitle = document.getElementById("headerSubtitle");
const timelineContainer = document.getElementById("timelineContainer");
const countVisite = document.getElementById("countVisite");
const countReferti = document.getElementById("countReferti");

async function initPage() {
    try {
        // 1. Legge il petId dall'URL
        const urlParams = new URLSearchParams(window.location.search);
        const petId = urlParams.get('petId');

        if (!petId) {
            alert("Paziente non trovato!");
            window.location.href = "pazienti.html";
            return;
        }

        // Imposta la freccia indietro
        backBtn.href = `scheda-paziente.html?petId=${petId}`;

        // 2. Info dell'header (Nome cane e Data odierna)
        const { data: pet } = await supabase.from('pets').select('nome').eq('id', petId).single();
        if (pet) {
            const mesi = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
            const oggi = new Date();
            const stringaData = `${oggi.getDate()} ${mesi[oggi.getMonth()]}`;
            headerSubtitle.textContent = `${pet.nome} · aggiornata il ${stringaData}`;
        }

        // 3. Scarica i dati medici (Visite e Referti) unendo i profili dei veterinari
        const { data: records, error } = await supabase
            .from('medical_records')
            .select(`
                id,
                data_visita,
                diagnosi,
                terapia,
                motivo,
                attachment_url,
                veterinarians (
                    profiles ( nome )
                )
            `)
            .eq('pet_id', petId)
            .order('data_visita', { ascending: false }); // Dal più recente

        if (error) throw error;

        // 4. Disegna a schermo
        renderDati(records);

    } catch (err) {
        console.error("Errore caricamento:", err);
        timelineContainer.innerHTML = `<div style="color: red; text-align: center;">Errore nel caricamento dei dati.</div>`;
    }
}

function renderDati(records) {
    timelineContainer.innerHTML = "";
    
    let totaleVisite = 0;
    let totaleReferti = 0;

    // Se non c'è nulla, mostriamo un avviso vuoto
    if (!records || records.length === 0) {
        timelineContainer.innerHTML = `<div style="color: #94A3B8; text-align: center;">Nessun dato clinico registrato.</div>`;
        countVisite.textContent = "0 registrazioni";
        countReferti.textContent = "0 documenti";
        return;
    }

    records.forEach((record, index) => {
        totaleVisite++;
        if (record.attachment_url) totaleReferti++;

        // FORMATO DATA (es: "19 MAG 2026")
        const dateObj = new Date(record.data_visita);
        const dataFormattata = dateObj.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();

        // NOME MEDICO (estraendolo dal JOIN)
        let nomeMedico = "MEDICO";
        if (record.veterinarians?.profiles?.nome) {
            nomeMedico = record.veterinarians.profiles.nome.toUpperCase();
        }

        // ALTERNA I COLORI DEI PALLINI (Arancione, Blu, Arancione...)
        const dotColor = (index % 2 === 0) ? "dot-orange" : "dot-blue";

        // CONTENUTO TESTUALE
        let titolo = record.motivo || "Visita veterinaria";
        if (record.diagnosi === "Referto medico allegato") titolo = "Referto medico";

        let descrizione = record.diagnosi || "Nessun dettaglio aggiuntivo.";
        if (record.terapia) descrizione += ` Prescritta terapia: ${record.terapia}`;

        // BOTTONE ALLEGATO (Se presente)
        let refertoHTML = "";
        if (record.attachment_url) {
            refertoHTML = `<a href="${record.attachment_url}" target="_blank" class="referto-link"><i class="fa-solid fa-file-pdf"></i> Vedi allegato</a>`;
        }

        // COSTRUZIONE ELEMENTO HTML
        const div = document.createElement("div");
        div.className = "timeline-item";
        div.innerHTML = `
            <div class="timeline-dot ${dotColor}"></div>
            <div class="timeline-content">
                <div class="timeline-meta">${dataFormattata} · ${nomeMedico}</div>
                <h4>${titolo}</h4>
                <p>${descrizione}</p>
                ${refertoHTML}
            </div>
        `;

        timelineContainer.appendChild(div);
    });

    // Aggiorna i testi nei box in alto
    countVisite.textContent = `${totaleVisite} registrazion${totaleVisite === 1 ? 'e' : 'i'}`;
    countReferti.textContent = `${totaleReferti} document${totaleReferti === 1 ? 'o' : 'i'}`;
}

// Inizializza la pagina
initPage();