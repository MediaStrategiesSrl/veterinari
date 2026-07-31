// ==========================================
// 1. IMPORT CENTRALIZZATI
// ==========================================
import { supabase } from '../utils/supabaseClient.js';
import { logError } from '../utils/logger.js';

// ==========================================
// 2. VARIABILI DI STATO E DOM
// ==========================================
const urlParams = new URLSearchParams(window.location.search);
const petId = urlParams.get('petId'); 
const recordId = urlParams.get('recordId'); 
let currentVetId = null;
let currentVaccineName = "Vaccino";

// DOM Elements
const btnIndietro = document.getElementById('btnIndietro');
const animaleSubtitle = document.getElementById('animaleSubtitle');
const infoVaccino = document.getElementById('infoVaccino');

const bollinoPreviewContainer = document.getElementById('bollinoPreviewContainer');
const bollinoImage = document.getElementById('bollinoImage');
const bollinoUploadContainer = document.getElementById('bollinoUploadContainer');
const inputBollino = document.getElementById('inputBollino');
const btnSostituisci = document.getElementById('btnSostituisci');
const uploadStatus = document.getElementById('uploadStatus');

// ==========================================
// 3. INIZIALIZZAZIONE PAGINA
// ==========================================
async function init() {
    if (!petId || !recordId) {
        animaleSubtitle.textContent = 'Errore: Parametri mancanti';
        return;
    }

    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return window.location.href = 'login.html';
        currentVetId = user.id;

        // Recupera i dati del paziente per il sottotitolo
        const { data: pet } = await supabase.from('pets').select('nome').eq('id', petId).single();
        if (pet) animaleSubtitle.textContent = `Paziente: ${pet.nome}`;

        await caricaDettaglioVaccino();

    } catch (error) {
        console.error('Errore inizializzazione:', error);
        logError({ source: 'dettaglio_vaccino', action: 'init', errorMessage: error.message });
    }
}

// Navigazione Indietro
if (btnIndietro) {
    btnIndietro.addEventListener('click', () => {
        window.location.href = `vaccini.html?petId=${petId}`;
    });
}

// ==========================================
// 4. RECUPERO DATI E RENDER VISIVO
// ==========================================
async function caricaDettaglioVaccino() {
    try {
        const { data: record, error } = await supabase
            .from('medical_records')
            .select('*')
            .eq('id', recordId)
            .single();

        if (error) throw error;
        
        currentVaccineName = record.diagnosi; // Es. "Polivalente (CEP/CPV)"

        // Renderizza info testuali
        const dataSomm = new Date(record.data_visita).toLocaleDateString('it-IT');
        const dataRich = record.prossimo_richiamo ? new Date(record.prossimo_richiamo).toLocaleDateString('it-IT') : 'Non previsto';

        infoVaccino.innerHTML = `
            <h2>${escapeHtml(record.diagnosi)}</h2>
            <p><strong>Somministrato il:</strong> ${dataSomm}</p>
            <p><strong>Prossimo richiamo:</strong> ${dataRich}</p>
            ${record.note_interne ? `<hr style="border:0; border-top:1px solid #D1D5DB; margin: 12px 0;"><p><strong>Note:</strong><br>${escapeHtml(record.note_interne)}</p>` : ''}
        `;

        // Gestione Bollino
        if (record.attachment_url) {
            mostraPreview(record.attachment_url);
        } else {
            mostraUpload();
        }

    } catch (error) {
        infoVaccino.innerHTML = `<p style="color:red;">Errore caricamento dati</p>`;
        logError({ source: 'dettaglio_vaccino', action: 'caricaDettaglio', errorMessage: error.message });
    }
}

// ==========================================
// 5. UPLOAD DEL BOLLINO SU SUPABASE
// ==========================================
inputBollino.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    mostraMessaggio('Caricamento bollino in corso...', false);
    
    // Creiamo la cartella: bollini_vaccini/pet_id/diagnosi_recordId.estensione
    const fileExt = file.name.split('.').pop();
    const safeDiagnosi = currentVaccineName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    const filePath = `bollini_vaccini/${petId}/${safeDiagnosi}_${recordId}.${fileExt}`;

    try {
        // 1. Carica il file nello storage
        const { error: uploadError, data: uploadData } = await supabase.storage
            .from('storage_veterinari')
            .upload(filePath, file, { upsert: true }); // Upsert permette di sovrascrivere

        if (uploadError) throw uploadError;

        // 2. Aggiorna l'URL nel database (medical_records)
        const { error: dbError } = await supabase
            .from('medical_records')
            .update({ attachment_url: filePath })
            .eq('id', recordId);

        if (dbError) throw dbError;

        mostraMessaggio('Bollino caricato con successo!', true);
        mostraPreview(filePath);

    } catch (error) {
        mostraMessaggio('Errore durante il caricamento del bollino.', false, true);
        logError({ source: 'dettaglio_vaccino', action: 'uploadBollino', errorMessage: error.message, context: { filePath } });
    }
});

btnSostituisci.addEventListener('click', () => {
    // Simula il click sull'input file nascosto
    inputBollino.click();
});

// ==========================================
// 6. UTILITIES E UI
// ==========================================
function mostraPreview(filePath) {
    bollinoUploadContainer.hidden = true;
    bollinoPreviewContainer.hidden = false;
    
    // Ottieni URL pubblico
    const { data } = supabase.storage.from('storage_veterinari').getPublicUrl(filePath);
    bollinoImage.src = data.publicUrl;
}

function mostraUpload() {
    bollinoPreviewContainer.hidden = true;
    bollinoUploadContainer.hidden = false;
}

function mostraMessaggio(testo, isSuccesso, isErrore = false) {
    uploadStatus.textContent = testo;
    uploadStatus.hidden = false;
    
    if (isSuccesso) {
        uploadStatus.className = 'status-message status-message--successo';
        setTimeout(() => uploadStatus.hidden = true, 3000); // Nascondi dopo 3 sec
    } else if (isErrore) {
        uploadStatus.className = 'status-message status-message--errore';
    } else {
        uploadStatus.className = 'status-message'; // Loading generico
        uploadStatus.style.background = '#F3F4F6';
        uploadStatus.style.color = '#6B7280';
    }
}

function escapeHtml(str) {
    if (typeof str !== 'string') return str;
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

init();