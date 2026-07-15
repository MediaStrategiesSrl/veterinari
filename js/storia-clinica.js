// ==========================================
// 1. IMPORT CENTRALIZZATI E SETUP
// ==========================================
// Assicurati che i percorsi (es. ../utils/) puntino alla tua struttura reale
import { supabase } from '../utils/supabaseClient.js';
import { logError } from '../utils/logger.js';

// Elementi DOM
const backBtn = document.getElementById("backBtn");
const headerSubtitle = document.getElementById("headerSubtitle");
const timelineContainer = document.getElementById("timelineContainer");

let currentUser = null;

// ==========================================
// 2. INIZIALIZZAZIONE E CONTROLLO ACCESSI
// ==========================================
async function initPage() {
    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        // Se c'è un errore di sistema auth o non c'è sessione
        if (authError) throw Object.assign(new Error(authError.message), { code: authError.code || 'AUTH_SYS_ERROR' });
        if (!user) {
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
        // 3. INFO HEADER ED ESTRAZIONE PROPRIETARIO
        // ==========================================
        const { data: pet, error: petError } = await supabase
            .from('pets')
            .select('nome, owner_id')
            .eq('id', petId)
            .single();

        if (petError) throw Object.assign(new Error(petError.message), { code: petError.code || 'DB_FETCH_PET_ERROR' });
        
        if (!pet) {
            alert("Paziente non trovato!");
            window.location.href = "index.html";
            return;
        }

        // ==========================================
        // 4. LA GUARDIA A DOPPIA PORTA (SICUREZZA)
        // ==========================================
        const isOwner = (pet.owner_id === currentUser.id);
        let isAuthorizedVet = false;

        // Se NON è il proprietario, controlliamo se è un veterinario autorizzato
        if (!isOwner) {
            const { data: accessData, error: accessError } = await supabase
                .from('veterinarian_patients')
                .select('status')
                .eq('pet_id', petId)
                .eq('veterinarian_id', currentUser.id)
                .maybeSingle(); // Usiamo maybeSingle perché il record potrebbe legittimamente non esistere

            if (accessError) throw Object.assign(new Error(accessError.message), { code: accessError.code || 'DB_CHECK_ACCESS_ERROR' });

            if (accessData && accessData.status === 'active') {
                isAuthorizedVet = true;
            }
        }

        // Blocco totale se non sei né il padrone né il veterinario!
        if (!isOwner && !isAuthorizedVet) {
            alert("Accesso negato: non sei autorizzato a visualizzare questa cartella clinica.");
            window.location.href = "index.html";
            return; // Nessun log di errore richiesto qui, è una violazione logica bloccata correttamente
        }

        // ==========================================
        // 5. FRECCIA INDIETRO DINAMICA E HEADER
        // ==========================================
        if (isOwner) {
            // Torna al profilo del proprietario
            if (backBtn) backBtn.href = `pages/proprietario/profilo-animale.html?petId=${petId}`;
        } else {
            // Torna alla scheda paziente del veterinario
            if (backBtn) backBtn.href = `pages/veterinario/scheda-paziente.html?petId=${petId}`;
        }

        // Data odierna per l'header
        const mesi = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
        const oggi = new Date();
        const stringaData = `${oggi.getDate()} ${mesi[oggi.getMonth()]}`;
        if (headerSubtitle) headerSubtitle.textContent = `${pet.nome} · aggiornata il ${stringaData}`;

        // ==========================================
        // 6. SCARICA I DATI MEDICI (Visite e Referti)
        // ==========================================
        const { data: records, error: recordsError } = await supabase
            .from('medical_records')
            .select(`
                id, data_visita, diagnosi, terapia, motivo, attachment_url,
                veterinarians ( profiles ( nome ) )
            `)
            .eq('pet_id', petId)
            .order('data_visita', { ascending: false });

        if (recordsError) throw Object.assign(new Error(recordsError.message), { code: recordsError.code || 'DB_FETCH_RECORDS_ERROR' });

        // ==========================================
        // 7. GESTIONE INTERFACCIA 
        // ==========================================
        if (isOwner) {
            // Assicurati che l'ID del bottone "Nuova Visita" corrisponda al tuo HTML
            const btnNuovaVisita = document.getElementById("btnNuovaVisita"); 
            if (btnNuovaVisita) btnNuovaVisita.style.display = "none";
        }

        // Disegna la timeline a schermo
        renderDati(records);

    } catch (err) {
        console.error("Errore caricamento timeline clinica:", err);
        
        // TRIGGER LOG ERROR
        await logError({
            source: 'storia_clinica',
            action: 'init_page',
            errorMessage: err.message || "Errore di sistema nel caricamento della cartella clinica",
            errorCode: err.code || 'UNKNOWN_SYS_ERROR',
            context: { userId: currentUser?.id }
        });

        if (timelineContainer) {
            timelineContainer.innerHTML = `
                <div style="text-align: center; padding: 20px; background: #FEF2F2; border-radius: 12px; border: 1px dashed #EF4444; margin-top: 20px;">
                    <p style="color: #DC2626; margin: 0; font-weight: bold;">Errore di sistema.</p>
                    <p style="color: #EF4444; margin-top: 5px; font-size: 0.9rem;">Impossibile caricare la cartella clinica. I tecnici sono stati avvisati.</p>
                </div>
            `;
        }
    }
}

// ==========================================
// 8. RENDERIZZAZIONE DELLA TIMELINE
// ==========================================
function renderDati(records) {
    if (!timelineContainer) return;
    timelineContainer.innerHTML = "";
    
    // Se non c'è nulla, mostriamo un avviso vuoto
    if (!records || records.length === 0) {
        timelineContainer.innerHTML = `
            <div style="text-align: center; padding: 30px 15px;">
                <p style="color: #94A3B8; margin: 0; font-size: 0.95rem;">Nessun dato clinico registrato.</p>
            </div>
        `;
        return;
    }

    records.forEach((record, index) => {
        // FORMATO DATA (es: "19 MAG 2026")
        const dateObj = new Date(record.data_visita);
        const dataFormattata = dateObj.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();

        // NOME MEDICO (estraendolo dal JOIN in modo sicuro)
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
            refertoHTML = `<a href="${record.attachment_url}" target="_blank" class="referto-link" style="display: inline-block; margin-top: 10px; padding: 8px 12px; background: #F1F5F9; color: #3B82F6; border-radius: 8px; text-decoration: none; font-size: 0.85rem; font-weight: bold;"><i class="fa-solid fa-file-pdf"></i> Vedi allegato</a>`;
        }

        // COSTRUZIONE ELEMENTO HTML (Mantenendo le classi CSS del tuo design)
        const div = document.createElement("div");
        div.className = "timeline-item";
        div.innerHTML = `
            <div class="timeline-dot ${dotColor}"></div>
            <div class="timeline-content">
                <div class="timeline-meta" style="font-size: 0.75rem; color: #64748B; font-weight: bold; margin-bottom: 5px;">${dataFormattata} · ${nomeMedico}</div>
                <h4 style="margin: 0 0 5px 0; color: #1E293B; font-size: 1.05rem;">${titolo}</h4>
                <p style="margin: 0; color: #475569; font-size: 0.9rem; line-height: 1.4;">${descrizione}</p>
                ${refertoHTML}
            </div>
        `;

        timelineContainer.appendChild(div);
    });
}

// Avvia l'inizializzazione della pagina
initPage();