// ==========================================
// 1. IMPORT CENTRALIZZATI
// ==========================================
import { supabase } from '../utils/supabaseClient.js';
import { logError } from '../utils/logger.js';

// ==========================================
// 2. VARIABILI DI STATO E DOM
// ==========================================
const urlParams = new URLSearchParams(window.location.search);
const petId = urlParams.get('petId'); // ID dell'animale dall'URL (stesso nome usato in scheda-paziente.js)
let currentVetId = null;

// Elementi DOM - Header & Tabs
const btnIndietro = document.getElementById('btnIndietro');
const btnNuovaRapida = document.getElementById('btnNuovaRapida');
const animaleSubtitle = document.getElementById('animaleSubtitle');
const tabStorico = document.getElementById('tabStorico');
const tabCrea = document.getElementById('tabCrea');
const sezioneStorico = document.getElementById('sezioneStorico');
const sezioneCrea = document.getElementById('sezioneCrea');

// Elementi DOM - Storico
const storicoLista = document.getElementById('storicoLista');
const storicoVuoto = document.getElementById('storicoVuoto');

// Elementi DOM - Form
const formVaccino = document.getElementById('formVaccino');
const selVaccino = document.getElementById('selVaccino');
const campoVaccinoAltro = document.getElementById('campoVaccinoAltro');
const inputVaccinoAltro = document.getElementById('inputVaccinoAltro');
const inputDataSomm = document.getElementById('inputDataSomm');
const inputDataRichiamo = document.getElementById('inputDataRichiamo');
const inputNote = document.getElementById('inputNote');
const formStatus = document.getElementById('formStatus');
const btnSalva = document.getElementById('btnSalva');

// Valore usato sia nella lista sia nei controlli, per evitare la stringa
// magica duplicata in più punti del file
const VALORE_ALTRO = 'Altro...';

// Valore scritto/letto in medical_records.motivo per riconoscere le righe
// che sono vaccinazioni (e non altri tipi di visita)
const MOTIVO_VACCINO = 'Vaccinazione';

// Lista vaccini preimpostati
const LISTA_VACCINI = [
    'Polivalente (CEP/CPV)',
    'Antirabbica',
    'Leishmaniosi',
    'Filaria (Iniezione)',
    'Bordetella (Tosse dei canili)',
    'Leucemia Felina (FeLV)',
    'Trivalente Felina (RCP)',
    VALORE_ALTRO
];

// ==========================================
// 3. INIZIALIZZAZIONE PAGINA
// ==========================================
async function init() {
    if (!petId) {
        animaleSubtitle.textContent = 'Errore: Animale non specificato';
        return;
    }

    try {
        // Recupera l'utente loggato (Veterinario)
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            currentVetId = user.id;
        } else {
            window.location.href = 'login.html';
            return;
        }

        // Popola la select dei vaccini
        popolaSelectVaccini();

        // Imposta la data di oggi come default per la somministrazione
        inputDataSomm.value = new Date().toISOString().split('T')[0];

        // Recupera i dati dell'animale per l'header
        const { data: pet } = await supabase.from('pets').select('nome').eq('id', petId).single();
        if (pet) {
            animaleSubtitle.textContent = `Storico di ${pet.nome}`;
        }

        // Carica lo storico
        await caricaStorico();

    } catch (error) {
        console.error('Errore inizializzazione:', error);
        logError({ source: 'vaccini', action: 'init', errorMessage: error.message, context: { petId } });
    }
}

// ==========================================
// 4. LOGICA TABS E NAVIGAZIONE
// ==========================================
if (btnIndietro) {
    btnIndietro.addEventListener('click', () => {
        // Torna alla scheda del paziente passando l'ID corretto
        window.location.href = `scheda-paziente.html?petId=${petId}`;
    });
}

function switchTab(showStorico) {
    if (showStorico) {
        tabStorico.classList.add('tab--attivo');
        tabStorico.setAttribute('aria-selected', 'true');
        tabCrea.classList.remove('tab--attivo');
        tabCrea.setAttribute('aria-selected', 'false');
        sezioneStorico.hidden = false;
        sezioneCrea.hidden = true;
    } else {
        tabCrea.classList.add('tab--attivo');
        tabCrea.setAttribute('aria-selected', 'true');
        tabStorico.classList.remove('tab--attivo');
        tabStorico.setAttribute('aria-selected', 'false');
        sezioneCrea.hidden = false;
        sezioneStorico.hidden = true;
    }
}

tabStorico.addEventListener('click', () => switchTab(true));
tabCrea.addEventListener('click', () => switchTab(false));
btnNuovaRapida.addEventListener('click', () => switchTab(false));

// Mostra/Nascondi campo "Altro"
selVaccino.addEventListener('change', (e) => {
    if (e.target.value === VALORE_ALTRO) {
        campoVaccinoAltro.hidden = false;
        inputVaccinoAltro.required = true;
    } else {
        campoVaccinoAltro.hidden = true;
        inputVaccinoAltro.required = false;
        inputVaccinoAltro.value = '';
    }
});

// ==========================================
// 5. CARICAMENTO E RENDER STORICO
// ==========================================
async function caricaStorico() {
    storicoLista.innerHTML = '<div class="skeleton">Caricamento…</div>';
    storicoVuoto.hidden = true;

    try {
        // NB: medical_records non ha una relazione diretta con profiles:
        // vet_id punta a veterinarians(user_id), e solo veterinarians ha a
        // sua volta una FK verso profiles(id). Per far risalire nome e
        // cognome del veterinario bisogna quindi imbustare la relazione a
        // due livelli (medical_records -> veterinarians -> profiles),
        // altrimenti PostgREST non trova alcuna relazione con "profiles"
        // e la query fallisce.
        const { data: vaccini, error } = await supabase
            .from('medical_records')
            .select('id, data_visita, diagnosi, prossimo_richiamo, note_interne, vet:veterinarians(profiles(nome, cognome))')
            .eq('pet_id', petId)
            .eq('motivo', MOTIVO_VACCINO)
            .order('data_visita', { ascending: false });

        if (error) throw error;

        if (!vaccini || vaccini.length === 0) {
            storicoLista.innerHTML = '';
            storicoVuoto.hidden = false;
            return;
        }

        renderStorico(vaccini);

    } catch (error) {
        storicoLista.innerHTML = '<div class="stato-vuoto"><p>Errore di caricamento</p></div>';
        logError({ source: 'vaccini', action: 'caricaStorico', errorMessage: error.message, context: { petId } });
    }
}

function formattaData(valore) {
    return new Date(valore).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
}

function renderStorico(vaccini) {
    storicoLista.innerHTML = '';
    const oggi = new Date();
    oggi.setHours(0, 0, 0, 0);

    vaccini.forEach(v => {
        let statusClass = '';
        let badgeClass = 'storico-item__badge--nessuno';
        let badgeTesto = 'Nessun richiamo';

        if (v.prossimo_richiamo) {
            const dataRichiamo = new Date(v.prossimo_richiamo);
            dataRichiamo.setHours(0, 0, 0, 0);
            const diffGiorni = Math.ceil((dataRichiamo - oggi) / (1000 * 60 * 60 * 24));

            if (diffGiorni < 0) {
                statusClass = 'storico-item--scaduto';
                badgeClass = 'storico-item__badge--scaduto';
                badgeTesto = 'Scaduto';
            } else if (diffGiorni <= 30) {
                statusClass = 'storico-item--imminente';
                badgeClass = 'storico-item__badge--imminente';
                badgeTesto = diffGiorni === 0 ? 'Oggi' : diffGiorni === 1 ? 'Domani' : `Tra ${diffGiorni} gg`;
            } else {
                statusClass = 'storico-item--ok';
                badgeClass = 'storico-item__badge--ok';
                badgeTesto = 'Richiamo attivo';
            }
        }

        const dataVisitaFormattata = formattaData(v.data_visita);
        const dataRichiamoFormattata = v.prossimo_richiamo ? formattaData(v.prossimo_richiamo) : null;
        const vetNome = v.vet?.profiles?.nome || '';
        const vetCognome = v.vet?.profiles?.cognome || '';
        
        // Controllo se ha già il bollino allegato (icona visiva)
        const haBollino = v.attachment_url ? `<span class="bollino-icon">📎 Bollino</span>` : '';
        
        // Novità: Controllo se c'è effettivamente qualcosa da stampare nelle note
        const haNote = haBollino !== '' || v.note_interne;

        const html = `
            <div class="storico-item ${statusClass}" style="cursor: pointer;" onclick="window.location.href='dettaglio-vaccino.html?petId=${petId}&recordId=${v.id}'">
                <div class="storico-item__marker">
                    <div class="storico-item__dot"></div>
                    <div class="storico-item__linea"></div>
                </div>
                <div class="storico-item__corpo">
                    <div class="storico-item__intestazione">
                        <div>
                            <h3 class="storico-item__titolo">${escapeHtml(v.diagnosi)}</h3>
                            <div class="storico-item__data">Somministrato: ${dataVisitaFormattata}</div>
                        </div>
                        <div class="storico-item__badge ${badgeClass}">${badgeTesto}</div>
                    </div>
                    ${dataRichiamoFormattata ? `<div class="storico-item__data" style="margin-top: 4px;">📅 Richiamo: ${dataRichiamoFormattata}</div>` : ''}
                    
                    ${haNote ? `
                    <div class="storico-item__note">
                        ${haBollino}
                        ${v.note_interne ? escapeHtml(v.note_interne) : ''}
                    </div>
                    ` : ''}
                    
                    ${(vetNome || vetCognome) ? `<div class="storico-item__vet">Med. Vet: Dott. ${escapeHtml(vetNome)} ${escapeHtml(vetCognome)}</div>` : ''}
                </div>
            </div>
        `;
        storicoLista.insertAdjacentHTML('beforeend', html);
    });
}

// ==========================================
// 6. CREAZIONE NUOVO VACCINO
// ==========================================
function popolaSelectVaccini() {
    LISTA_VACCINI.forEach(v => {
        const option = document.createElement('option');
        option.value = v;
        option.textContent = v;
        selVaccino.appendChild(option);
    });
}

function validaForm() {
    const nomeVaccino = selVaccino.value === VALORE_ALTRO ? inputVaccinoAltro.value.trim() : selVaccino.value;
    if (!nomeVaccino) {
        return { errore: 'Seleziona o inserisci un nome per il vaccino.' };
    }
    if (!inputDataSomm.value) {
        return { errore: 'Inserisci la data di somministrazione.' };
    }
    return { nomeVaccino };
}

formVaccino.addEventListener('submit', async (e) => {
    e.preventDefault();
    formStatus.hidden = true;

    const { errore, nomeVaccino } = validaForm();
    if (errore) {
        mostraMessaggio(errore, false);
        return;
    }

    btnSalva.disabled = true;
    btnSalva.textContent = 'Salvataggio in corso...';

    try {
        // Inseriamo il record usando 'medical_records'
        // 'diagnosi' viene usato per memorizzare il nome del vaccino
        const { error } = await supabase.from('medical_records').insert({
            pet_id: petId,
            vet_id: currentVetId,
            motivo: MOTIVO_VACCINO,
            diagnosi: nomeVaccino,
            data_visita: inputDataSomm.value,
            prossimo_richiamo: inputDataRichiamo.value || null,
            note_interne: inputNote.value.trim() || null
        });

        if (error) throw error;

        mostraMessaggio('Vaccinazione registrata con successo!', true);

        // Reset form
        formVaccino.reset();
        campoVaccinoAltro.hidden = true;
        inputDataSomm.value = new Date().toISOString().split('T')[0];

        // Ricarica lo storico e torna al tab
        await caricaStorico();
        setTimeout(() => {
            switchTab(true);
            formStatus.hidden = true;
        }, 1500);

    } catch (error) {
        // Se il vet_id non corrisponde a nessun veterinario registrato,
        // il vincolo medical_records_vet_id_fkey fa fallire l'insert
        // (codice Postgres 23503): messaggio dedicato invece del generico.
        if (error.code === '23503' && /vet_id/.test(error.message || '')) {
            mostraMessaggio('Il tuo account non risulta registrato come veterinario: impossibile salvare la visita.', false);
        } else {
            mostraMessaggio('Errore durante il salvataggio. Riprova.', false);
        }
        logError({ source: 'vaccini', action: 'salva_vaccino', errorMessage: error.message, context: { petId, currentVetId } });
    } finally {
        btnSalva.disabled = false;
        btnSalva.textContent = 'Salva vaccinazione';
    }
});

// ==========================================
// 7. UTILITIES
// ==========================================
function mostraMessaggio(testo, isSuccesso) {
    formStatus.textContent = testo;
    formStatus.className = `status-message status-message--${isSuccesso ? 'successo' : 'errore'}`;
    formStatus.hidden = false;
}

function escapeHtml(str) {
    if (typeof str !== 'string') return str;
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Avvio
init();