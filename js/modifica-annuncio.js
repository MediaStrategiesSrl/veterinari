// ==========================================
// 1. IMPORT CENTRALIZZATI
// ==========================================
import { supabase } from '../utils/supabaseClient.js';
import { logError } from '../utils/logger.js';
import { verificaCampi } from './mercatino-moderation.js';

const urlParams = new URLSearchParams(window.location.search);
const listingId = urlParams.get('id');

let currentUser = null;
let currentListing = null;
let newFilesToUpload = []; // Array per contenere i nuovi file selezionati

// Elementi DOM
const loadingState = document.getElementById('loadingState');
const editForm = document.getElementById('editForm');
const editTitle = document.getElementById('editTitle');
const editDescription = document.getElementById('editDescription');
const editPickupNotes = document.getElementById('editPickupNotes');
const backBtn = document.getElementById('backBtn');
const btnSalva = document.getElementById('btnSalva');
const formMessage = document.getElementById('formMessage');

// Elementi Foto
const editPhotosInput = document.getElementById('editPhotos');
const existingPhotosContainer = document.getElementById('existingPhotosContainer');
const newPhotosPreview = document.getElementById('newPhotosPreview');

// ==========================================
// 2. INIZIALIZZAZIONE E CONTROLLI DI SICUREZZA
// ==========================================
async function initPagina() {
    if (!listingId) {
        alert("Nessun annuncio specificato.");
        window.location.href = "mercatino.html";
        return;
    }

    // Tasto indietro dinamico
    backBtn.href = `dettaglio-annuncio.html?id=${listingId}`;

    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            window.location.href = "../../index.html";
            return;
        }
        currentUser = user;

        await caricaDatiAnnuncio();

    } catch (error) {
        console.error("Errore inizializzazione modifica:", error);
        mostraErroreCritico(error.message);
        
        await logError({
            source: 'mercatino_modifica', action: 'init_page',
            errorMessage: error.message, errorCode: error.code || 'INIT_ERROR',
            context: { listing_id: listingId }
        });
    }
}

async function caricaDatiAnnuncio() {
    const { data, error } = await supabase
        .from('marketplace_listings')
        .select(`*, marketplace_listing_photos(photo_url, position)`)
        .eq('id', listingId)
        .maybeSingle();

    if (error) throw Object.assign(new Error(error.message), { code: error.code || 'DB_FETCH_ERROR' });

    if (!data) throw new Error("Annuncio non trovato.");

    // SECURITY GUARD: Solo il proprietario può modificare
    if (data.owner_user_id !== currentUser.id) {
        throw new Error("Accesso negato. Non sei il proprietario di questo annuncio.");
    }

    // SECURITY GUARD: Nessuna modifica se in trattativa o chiuso
    if (data.status !== 'AVAILABLE') {
        throw new Error("Questo annuncio non è modificabile nel suo stato attuale (es. In Trattativa).");
    }

    currentListing = data;
    popolaForm();
}

function popolaForm() {
    editTitle.value = currentListing.title || "";
    editDescription.value = currentListing.description || "";
    editPickupNotes.value = currentListing.pickup_notes || "";

    // Mostra foto esistenti
    const fotoEsistenti = currentListing.marketplace_listing_photos || [];
    if (fotoEsistenti.length > 0) {
        existingPhotosContainer.innerHTML = fotoEsistenti.sort((a,b) => a.position - b.position).map(f => `
            <div class="photo-wrapper">
                <img src="${f.photo_url}" class="photo-thumb" style="border-color: #94A3B8;">
            </div>
        `).join('');
    } else {
        existingPhotosContainer.innerHTML = '<span style="font-size:0.8rem; color:#94A3B8;">Nessuna foto presente.</span>';
    }

    loadingState.hidden = true;
    editForm.hidden = false;
}

function mostraErroreCritico(msg) {
    loadingState.innerHTML = `
        <div style="text-align:center; color:#DC2626; padding: 2rem;">
            <i class="fa-solid fa-triangle-exclamation" style="font-size:2rem; margin-bottom:10px;"></i><br>
            <b>Attenzione</b><br>${msg}
            <br><br><a href="dettaglio-annuncio.html?id=${listingId}" style="color:#1E293B; text-decoration:underline;">Torna all'annuncio</a>
        </div>
    `;
}

// ==========================================
// 3. GESTIONE SELEZIONE NUOVE FOTO
// ==========================================
editPhotosInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    
    // Aggiungiamo i file all'array globale
    files.forEach(f => newFilesToUpload.push(f));
    
    // Aggiorniamo l'anteprima visiva
    aggiornaAnteprimaNuoveFoto();
    
    // Resettiamo l'input per permettere di selezionare altre foto
    editPhotosInput.value = ""; 
});

function aggiornaAnteprimaNuoveFoto() {
    newPhotosPreview.innerHTML = "";
    newFilesToUpload.forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'photo-wrapper';
            wrapper.innerHTML = `
                <img src="${e.target.result}" class="photo-thumb" style="border-color: #F58220;">
                <button type="button" class="photo-remove-btn" data-index="${index}"><i class="fa-solid fa-xmark"></i></button>
            `;
            
            // Bottone per rimuovere la foto dalla selezione
            wrapper.querySelector('.photo-remove-btn').addEventListener('click', function() {
                const idx = parseInt(this.getAttribute('data-index'));
                newFilesToUpload.splice(idx, 1);
                aggiornaAnteprimaNuoveFoto(); // Ridisegna tutto
            });
            
            newPhotosPreview.appendChild(wrapper);
        };
        reader.readAsDataURL(file);
    });
}

// ==========================================
// 4. SALVATAGGIO MODIFICHE (TESTO + FOTO)
// ==========================================
editForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const title = editTitle.value.trim();
    const desc = editDescription.value.trim();
    const notes = editPickupNotes.value.trim();

    // Filtro anti-scam / moderation
    const checkTesto = verificaCampi(`${title} ${desc}`);
    if (checkTesto.bloccato) {
        showMessage(MESSAGGIO_BLOCCO, "#DC2626");
        return;
    }

    btnSalva.disabled = true;
    btnSalva.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvataggio...';
    formMessage.hidden = true;

    try {
        // 1. UPDATE TESTO NEL DATABASE
        const { error: updateError } = await supabase
            .from('marketplace_listings')
            .update({
                title: title,
                description: desc,
                pickup_notes: notes || null,
                updated_at: new Date().toISOString()
            })
            .eq('id', listingId);

        if (updateError) throw updateError;

        // 2. UPLOAD NUOVE FOTO (SE PRESENTI)
        if (newFilesToUpload.length > 0) {
            btnSalva.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Caricamento nuove foto...';
            
            // Calcoliamo da quale posizione (position) partire per non sovrascrivere l'ordinamento
            let startingPosition = (currentListing.marketplace_listing_photos || []).length;

            for (const file of newFilesToUpload) {
                const fileExt = file.name.split('.').pop();
                const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
                const filePath = `listings/${listingId}/${fileName}`;

                // Upload su Storage
                const { error: uploadError } = await supabase.storage
                    .from('storage_veterinari')
                    .upload(filePath, file);

                if (uploadError) throw uploadError;

                // Genera public URL
                const { data: { publicUrl } } = supabase.storage
                    .from('storage_veterinari')
                    .getPublicUrl(filePath);

                // Inserisce record in marketplace_listing_photos
                await supabase.from('marketplace_listing_photos').insert({
                    listing_id: listingId,
                    photo_url: publicUrl,
                    position: startingPosition
                });

                startingPosition++;
            }
        }

        showMessage("Annuncio aggiornato con successo!", "#059669");
        
        // Redirect alla pagina di dettaglio dopo 1.5 secondi
        setTimeout(() => {
            window.location.href = `dettaglio-annuncio.html?id=${listingId}`;
        }, 1500);

    } catch (error) {
        console.error("Errore aggiornamento:", error);
        showMessage("Si è verificato un errore durante il salvataggio.", "#DC2626");
        btnSalva.disabled = false;
        btnSalva.innerHTML = 'Salva modifiche';
        
        await logError({
            source: 'mercatino_modifica', action: 'update_listing',
            errorMessage: error.message, errorCode: error.code || 'UPDATE_ERROR',
            context: { listing_id: listingId }
        });
    }
});

function showMessage(text, color) {
    formMessage.textContent = text;
    formMessage.style.color = color;
    formMessage.hidden = false;
}

initPagina();