// ==========================================
// 1. IMPORT CENTRALIZZATI
// ==========================================
import { supabase } from '../utils/supabaseClient.js';
import { logError } from '../utils/logger.js';

const sheetContainer = document.getElementById('sheetContainer');
const btnBack = document.getElementById('btnBack');
const btnPrint = document.getElementById('btnPrint');

const urlParams = new URLSearchParams(window.location.search);
const recordId = urlParams.get('id'); // ID della riga in medical_records

let currentPetId = null; // Variabile globale per salvare il pet_id per il tasto "Indietro"

// ==========================================
// 2. NAVIGAZIONE / STAMPA
// ==========================================
if (btnBack) {
    btnBack.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
            // FIX: Ora passiamo il petId corretto nell'URL per non far crashare la scheda paziente
            if (currentPetId) {
                window.location.href = `scheda-paziente.html?petId=${currentPetId}`;
            } else {
                // Fallback di sicurezza se i dati non hanno fatto in tempo a caricarsi
                window.history.back();
            }
        } catch (error) {
            console.error("Errore durante la navigazione indietro:", error);
            await logError({
                source: 'prescrizione',
                action: 'navigate_back',
                errorMessage: error.message || "Errore imprevisto durante il redirect",
                errorCode: error.code || 'NAV_REDIRECT_ERROR'
            });
        }
    });
}

if (btnPrint) {
    btnPrint.addEventListener('click', async () => {
        try {
            window.print();
        } catch (error) {
            console.error("Errore durante la stampa:", error);
            await logError({
                source: 'prescrizione',
                action: 'print_sheet',
                errorMessage: error.message || "Errore imprevisto durante la stampa",
                errorCode: error.code || 'PRINT_SYS_ERROR'
            });
        }
    });
}

// ==========================================
// 3. INIZIALIZZAZIONE PAGINA
// ==========================================
async function init() {
    if (!recordId) {
        renderEmptyState("Prescrizione non trovata: nessun ID indicato nell'URL.");
        return;
    }

    try {
        // 1. Recupera la visita
        const { data: record, error: recordError } = await supabase
            .from('medical_records')
            .select('id, pet_id, vet_id, data_visita, terapia')
            .eq('id', recordId)
            .single();

        if (recordError) throw Object.assign(new Error(recordError.message), { code: recordError.code || 'DB_FETCH_RECORD_ERROR' });

        // SALVIAMO IL PET_ID PER IL TASTO INDIETRO!
        currentPetId = record.pet_id;

        if (!record.terapia || !record.terapia.trim()) {
            renderEmptyState("Questa visita non contiene una terapia da stampare come prescrizione.");
            return;
        }

        // 2. Recupera in parallelo i dati connessi
        const [
            { data: pet, error: petError },
            { data: vetProfile, error: vetProfileError },
            { data: vetDati, error: vetDatiError }
        ] = await Promise.all([
            supabase.from('pets').select('nome, specie, razza, microchip, owner_id').eq('id', record.pet_id).single(),
            supabase.from('profiles').select('nome, cognome, indirizzo, data_nascita').eq('id', record.vet_id).single(),
            supabase.from('veterinarians').select('numero_ordine, firma_url').eq('user_id', record.vet_id).single()
        ]);

        if (petError) throw Object.assign(new Error(petError.message), { code: petError.code || 'DB_FETCH_PET_ERROR' });
        if (vetProfileError) throw Object.assign(new Error(vetProfileError.message), { code: vetProfileError.code || 'DB_FETCH_VET_PROFILE_ERROR' });
        if (vetDatiError) throw Object.assign(new Error(vetDatiError.message), { code: vetDatiError.code || 'DB_FETCH_VET_DATI_ERROR' });

        // 3. Recupera il proprietario
        const { data: proprietario, error: proprietarioError } = await supabase
            .from('profiles')
            .select('nome, cognome')
            .eq('id', pet.owner_id)
            .single();

        if (proprietarioError) throw Object.assign(new Error(proprietarioError.message), { code: proprietarioError.code || 'DB_FETCH_OWNER_ERROR' });

        renderSheet({ record, pet, proprietario, vetProfile, vetDati });

    } catch (error) {
        console.error("Errore caricamento prescrizione:", error);
        renderEmptyState("Errore durante il caricamento della prescrizione. Riprova più tardi.");
        await logError({
            source: 'prescrizione',
            action: 'init_page',
            errorMessage: error.message || "Errore imprevisto",
            errorCode: error.code || 'UNKNOWN_SYS_ERROR',
            context: { recordId }
        });
    }
}

// ==========================================
// 4. RENDER DEL FOGLIO (Adattato al nuovo CSS)
// ==========================================
function renderSheet({ record, pet, proprietario, vetProfile, vetDati }) {
    const nomeVetCompleto = `Dott. ${vetProfile.nome} ${vetProfile.cognome}`.trim();
    const nomeProprietarioCompleto = `${proprietario.nome} ${proprietario.cognome}`.trim();
    const dataNascitaVet = formattaData(vetProfile.data_nascita);
    const dataVisita = formattaData(record.data_visita);

    sheetContainer.innerHTML = `
        <div class="prescription-sheet">
            <div class="sheet-header">
                <div class="vet-name">${nomeVetCompleto}</div>
                ${vetProfile.indirizzo ? `<div class="vet-address">${vetProfile.indirizzo}</div>` : ''}
                <div class="vet-meta">
                    ${dataNascitaVet ? `Nato/a il ${dataNascitaVet} · ` : ''}Ordine n. ${vetDati.numero_ordine}
                </div>
            </div>

            <div class="sheet-divider"></div>

            <div class="sheet-row">
                <div>
                    <div class="sheet-label">Paziente</div>
                    <div class="sheet-value">${pet.nome}</div>
                    ${pet.microchip ? `<div class="sheet-microchip">Microchip: ${pet.microchip}</div>` : ''}
                </div>
                <div>
                    <div class="sheet-label">Specie / Razza</div>
                    <div class="sheet-value">${pet.specie}${pet.razza ? ` · ${pet.razza}` : ''}</div>
                </div>
                <div>
                    <div class="sheet-label">Proprietario</div>
                    <div class="sheet-value">${nomeProprietarioCompleto}</div>
                </div>
                <div>
                    <div class="sheet-label">Data visita</div>
                    <div class="sheet-value">${dataVisita || '—'}</div>
                </div>
            </div>

            <div class="sheet-divider"></div>

            <div class="sheet-body">
                <div class="sheet-label">Terapia prescritta</div>
                <div class="therapy-text">${escapeHtml(record.terapia)}</div>
            </div>

            <div class="sheet-signature">
                ${renderFirma(vetDati.firma_url, nomeVetCompleto)}
                <div class="signature-line"></div>
                <div class="signature-name">${nomeVetCompleto}</div>
            </div>
        </div>
    `;
}

// ==========================================
// 5. UTILITIES E FIRMA
// ==========================================
function renderFirma(firmaUrl, nomeVetCompleto) {
    if (!firmaUrl) {
        return `<div class="signature-placeholder">Firma non disponibile</div>`;
    }
    try {
        const percorsoFirma = firmaUrl.includes('/') ? firmaUrl : `firme_vet/${firmaUrl}`;
        const { data } = supabase.storage.from('storage_veterinari').getPublicUrl(percorsoFirma);
        return `<img src="${data.publicUrl}" alt="Firma di ${nomeVetCompleto}" class="signature-image">`;
    } catch (error) {
        return `<div class="signature-placeholder">Errore caricamento firma</div>`;
    }
}

function formattaData(dataStr) {
    if (!dataStr) return null;
    return new Date(dataStr).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
}

function escapeHtml(str) {
    if (typeof str !== 'string') return str;
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function renderEmptyState(messaggio) {
    sheetContainer.innerHTML = `
        <div class="prescription-sheet">
            <div class="empty-state">
                <i class="fa-regular fa-file-lines" style="font-size: 2rem; color: var(--ink-soft);"></i>
                <h4 style="color: var(--ink);">${messaggio}</h4>
            </div>
        </div>
    `;
}

init();