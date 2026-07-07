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
        
        currentUser = user;

        // Legge il petId dall'URL
        const urlParams = new URLSearchParams(window.location.search);
        const petId = urlParams.get('petId');
        if (!petId) {
            alert("Paziente non trovato!");
            window.location.href = "index.html"; 
            return;
        }

        // ==========================================
        // 1. INFO HEADER ED ESTRAZIONE PROPRIETARIO
        // ==========================================
        // Tiriamo giù il nome del cane e soprattutto CHI È IL PROPRIETARIO (owner_id)
        const { data: pet, error: petError } = await supabase
            .from('pets')
            .select('nome, owner_id')
            .eq('id', petId)
            .single();

        if (petError || !pet) {
            alert("Paziente non trovato!");
            window.location.href = "index.html";
            return;
        }

        // ==========================================
        // 2. LA GUARDIA A DOPPIA PORTA
        // ==========================================
        const isOwner = (pet.owner_id === currentUser.id);
        let isAuthorizedVet = false;

        // Se NON è il proprietario, controlliamo se è un veterinario autorizzato
        if (!isOwner) {
            const { data: accessData } = await supabase
                .from('veterinarian_patients')
                .select('status')
                .eq('pet_id', petId)
                .eq('veterinarian_id', currentUser.id)
                .single();

            if (accessData && accessData.status === 'active') {
                isAuthorizedVet = true;
            }
        }

        // Blocco totale se non sei né il padrone né il veterinario!
        if (!isOwner && !isAuthorizedVet) {
            alert("Accesso negato: non sei autorizzato a visualizzare questa cartella.");
            window.location.href = "index.html";
            return;
        }

        // ==========================================
        // 3. FRECCIA INDIETRO DINAMICA
        // ==========================================
        if (isOwner) {
            // Torna alla dashboard o profilo del proprietario (aggiusta il percorso se serve)
            backBtn.href = `pages/proprietario/profilo-animale.html?petId=${petId}`;
        } else {
            // Torna alla scheda paziente del veterinario
            backBtn.href = `pages/veterinario/scheda-paziente.html?petId=${petId}`;
        }

        // Data odierna per l'header
        const mesi = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
        const oggi = new Date();
        const stringaData = `${oggi.getDate()} ${mesi[oggi.getMonth()]}`;
        headerSubtitle.textContent = `${pet.nome} · aggiornata il ${stringaData}`;

        // ==========================================
        // 4. SCARICA I DATI MEDICI (Visite e Referti)
        // ==========================================
        const { data: records, error } = await supabase
            .from('medical_records')
            .select(`
                id, data_visita, diagnosi, terapia, motivo, attachment_url,
                veterinarians ( profiles ( nome ) )
            `)
            .eq('pet_id', petId)
            .order('data_visita', { ascending: false });

        if (error) throw error;

        // ==========================================
        // 5. GESTIONE INTERFACCIA (NASCONDI BOTTONI AL PROPRIETARIO)
        // ==========================================
        if (isOwner) {
            // Se in futuro aggiungerai un bottone "Nuova Visita" per i veterinari in questa pagina, 
            // potrai nasconderlo al proprietario scrivendo il suo id qui:
            const btnNuovaVisita = document.getElementById("inserisci_id_tuo_bottone");
            if (btnNuovaVisita) btnNuovaVisita.style.display = "none";
        }

        // Disegna la timeline a schermo
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