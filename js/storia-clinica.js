import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Elementi DOM
const backBtn = document.getElementById("backBtn");
const headerSubtitle = document.getElementById("headerSubtitle");
const timelineContainer = document.getElementById("timelineContainer");

let currentUser = null;

async function initPage() {
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        // Se non c'è una sessione attiva, lo rimandiamo al login
        if (authError || !user) {
            window.location.href = "index.html";
            return;
        }
        
        // Salviamo l'utente nella variabile globale così la riga del controllo della GUARD funzionerà!
        currentUser = user;

        // 3. Legge il petId dall'URL
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

        // ==========================================
        // NUOVO: CONTROLLO DI SICUREZZA (GUARD)
        // ==========================================
        const { data: accessData, error: accessError } = await supabase
            .from('veterinarian_patients')
            .select('status')
            .eq('pet_id', petId)
            .eq('veterinarian_id', currentUser.id)
            .single();

        // Se c'è un errore, se non c'è il dato, o se lo status NON è "active", blocca tutto!
        if (accessError || !accessData || accessData.status !== 'active') {
            alert("Accesso negato: non sei autorizzato a visualizzare o modificare questo paziente (Accesso revocato).");
            window.location.href = "/pages/veterinario/pazienti.html";
            return;
        }

        // 4. Disegna a schermo
        renderDati(records);

    } catch (err) {
        console.error("Errore caricamento:", err);
        timelineContainer.innerHTML = `<div style="color: red; text-align: center;">Errore nel caricamento dei dati.</div>`;
    }
}

function renderDati(records) {
    timelineContainer.innerHTML = "";
    
    // Se non c'è nulla, mostriamo un avviso vuoto
    if (!records || records.length === 0) {
        timelineContainer.innerHTML = `<div style="color: #94A3B8; text-align: center;">Nessun dato clinico registrato.</div>`;
        return;
    }

    records.forEach((record, index) => {

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
}

// Inizializza la pagina
initPage();