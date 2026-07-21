// ==========================================
// 1. IMPORT CENTRALIZZATI
// ==========================================
import { supabase } from '../utils/supabaseClient.js';
import { logError } from '../utils/logger.js';
import { verificaCampi, MESSAGGIO_BLOCCO } from './mercatino-moderation.js';

let currentUser = null;
let fileSelezionati = [];

// Elementi DOM
const form = document.getElementById("annuncioForm");
const pageStatusMsg = document.getElementById("pageStatusMsg");
const btnPubblica = document.getElementById("btnPubblica");

const fotoInput = document.getElementById("fotoInput");
const fotoPreview = document.getElementById("fotoPreview");

const titolo = document.getElementById("titolo");
const categoria = document.getElementById("categoria");
const specie = document.getElementById("specie");
const taglia = document.getElementById("taglia");
const condizioni = document.getElementById("condizioni");
const descrizione = document.getElementById("descrizione");
const cap = document.getElementById("cap");
const comune = document.getElementById("comune");
const provincia = document.getElementById("provincia");
const regione = document.getElementById("regione");
const noteRitiro = document.getElementById("noteRitiro");
const scadenza = document.getElementById("scadenza");

const checkDichiarazioni = [
    "dichPossesso", "dichCedibile", "dichVeritiera",
    "dichNoDenaro", "dichNoScambio", "dichNoVietati"
].map(id => document.getElementById(id));

function mostraErrore(msg) {
    pageStatusMsg.textContent = msg;
    pageStatusMsg.hidden = false;
    pageStatusMsg.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function nascondiErrore() {
    pageStatusMsg.hidden = true;
    pageStatusMsg.textContent = '';
}

// ==========================================
// INIZIALIZZAZIONE
// ==========================================
async function initPagina() {
    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) throw Object.assign(new Error(authError.message), { code: authError.code || 'AUTH_CHECK_ERROR' });

        if (!user) {
            window.location.href = "../../index.html";
            return;
        }
        currentUser = user;

        await Promise.all([caricaCategorie(), precompilaLocalita()]);

    } catch (error) {
        console.error("Errore inizializzazione nuovo annuncio:", error);
        mostraErrore("Errore nel caricamento della pagina. Riprova più tardi.");
        await logError({
            source: 'mercatino_nuovo_annuncio', action: 'init_page',
            errorMessage: error.message, errorCode: error.code || 'UNKNOWN_SYS_ERROR',
            context: { user_id: currentUser ? currentUser.id : 'sconosciuto' }
        });
    }
}

async function caricaCategorie() {
    const { data, error } = await supabase
        .from('marketplace_categories')
        .select('id, name')
        .order('name');

    if (error) {
        categoria.innerHTML = `<option value="" disabled selected>Errore caricamento categorie</option>`;
        return;
    }

    categoria.innerHTML = `<option value="" disabled selected>Seleziona una categoria...</option>`;
    (data || []).forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat.id;
        opt.textContent = cat.name;
        categoria.appendChild(opt);
    });
}

// Precompila CAP/Comune dal profilo, se disponibili
async function precompilaLocalita() {
    const { data: profile } = await supabase
        .from('profiles')
        .select('cap, citta')
        .eq('id', currentUser.id)
        .maybeSingle();

    if (profile) {
        if (profile.cap) cap.value = profile.cap;
        if (profile.citta) comune.value = profile.citta;
    }
}

// ==========================================
// GESTIONE FOTO
// ==========================================
fotoInput.addEventListener('change', () => {
    fileSelezionati = Array.from(fotoInput.files || []);
    renderAnteprimaFoto();
});

function renderAnteprimaFoto() {
    fotoPreview.innerHTML = '';
    fileSelezionati.forEach((file, index) => {
        const url = URL.createObjectURL(file);
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'position:relative; width:70px; height:70px;';
        wrapper.innerHTML = `
            <img src="${url}" style="width:100%; height:100%; object-fit:cover; border-radius:10px; border:1px solid #E2E8F0;">
            <button type="button" data-index="${index}" style="position:absolute; top:-6px; right:-6px; background:#EF4444; color:#fff; border:none; width:20px; height:20px; border-radius:50%; font-size:0.7rem; cursor:pointer; line-height:1;">
                <i class="fa-solid fa-xmark"></i>
            </button>
        `;
        wrapper.querySelector('button').addEventListener('click', () => {
            fileSelezionati.splice(index, 1);
            renderAnteprimaFoto();
        });
        fotoPreview.appendChild(wrapper);
    });
}

// ==========================================
// SUBMIT
// ==========================================
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    nascondiErrore();

    // 1. Almeno una foto
    if (fileSelezionati.length === 0) {
        mostraErrore("Aggiungi almeno una fotografia dell'oggetto.");
        return;
    }

    // 2. Tutte le dichiarazioni devono essere spuntate
    const tutteAccettate = checkDichiarazioni.every(c => c.checked);
    if (!tutteAccettate) {
        mostraErrore("Devi confermare tutte le dichiarazioni prima di pubblicare.");
        return;
    }

    // 3. CAP valido
    if (!/^\d{5}$/.test(cap.value.trim())) {
        mostraErrore("Inserisci un CAP valido di 5 cifre.");
        return;
    }

    // 4. Filtro contenuti vietati
    const { bloccato } = verificaCampi(titolo.value, descrizione.value, noteRitiro.value);
    if (bloccato) {
        mostraErrore(MESSAGGIO_BLOCCO);
        return;
    }

    btnPubblica.disabled = true;
    btnPubblica.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Pubblicazione in corso...';

    try {
        // Preparazione valori in base allo schema (gestione dei NULL)
        const valCategoria = categoria.value ? categoria.value : null;
        const valTaglia = taglia.value.trim() || null;
        const valSpecie = specie.value.trim() || null;
        const valRegione = regione.value.trim() || null;
        const valNote = noteRitiro.value.trim() || null;
        const valScadenza = scadenza.value ? scadenza.value : null;

        // 5. Crea l'annuncio
        const { data: nuovoAnnuncio, error: insertError } = await supabase
            .from('marketplace_listings')
            .insert({
                owner_user_id: currentUser.id,
                title: titolo.value.trim(),
                description: descrizione.value.trim(),
                category_id: valCategoria,
                condition: condizioni.value,
                species: valSpecie,
                size: valTaglia,
                postal_code: cap.value.trim(),
                city: comune.value.trim(),
                province: provincia.value.trim().toUpperCase(),
                region: valRegione,
                pickup_notes: valNote,
                expiry_date: valScadenza,
                status: 'AVAILABLE', // Rispetta il constraint dello schema
                published_at: new Date().toISOString()
            })
            .select('id')
            .single();

        if (insertError) throw Object.assign(new Error(insertError.message), { code: insertError.code || 'DB_INSERT_LISTING_ERROR' });

        const listingId = nuovoAnnuncio.id;

        // 6. Carica le foto nello storage e registra i path
        btnPubblica.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Caricamento foto...';

        for (let i = 0; i < fileSelezionati.length; i++) {
            const file = fileSelezionati[i];
            const ext = file.name.split('.').pop();
            const nomeFile = `${Date.now()}_${i}_${Math.random().toString(36).substring(7)}.${ext}`;
            const path = `mercatino/${listingId}/${nomeFile}`;

            const { error: uploadError } = await supabase.storage
                .from('storage_veterinari')
                .upload(path, file, { upsert: true });

            if (uploadError) throw Object.assign(new Error(uploadError.message), { code: uploadError.code || 'STORAGE_UPLOAD_ERROR' });

            const { data: { publicUrl } } = supabase.storage.from('storage_veterinari').getPublicUrl(path);

            const { error: photoInsertError } = await supabase
                .from('marketplace_listing_photos')
                .insert({ listing_id: listingId, photo_url: publicUrl, position: i });

            if (photoInsertError) throw Object.assign(new Error(photoInsertError.message), { code: photoInsertError.code || 'DB_INSERT_PHOTO_ERROR' });
        }

        // 7. Registra le dichiarazioni accettate
        btnPubblica.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Finalizzazione...';

        const { error: declError } = await supabase
            .from('marketplace_listing_declarations')
            .insert({
                listing_id: listingId,
                possiede_oggetto: true,
                oggetto_cedibile: true,
                descrizione_veritiera: true,
                no_denaro: true,
                no_scambio: true,
                no_oggetti_vietati: true
            });

        if (declError) throw Object.assign(new Error(declError.message), { code: declError.code || 'DB_INSERT_DECLARATIONS_ERROR' });

        window.location.href = `dettaglio-annuncio.html?id=${listingId}`;

    } catch (error) {
        console.error("Errore pubblicazione annuncio:", error);
        mostraErrore("Errore durante la pubblicazione. Riprova.");
        await logError({
            source: 'mercatino_nuovo_annuncio', action: 'publish_listing',
            errorMessage: error.message, errorCode: error.code || 'PUBLISH_ERROR',
            context: { user_id: currentUser.id }
        });
        btnPubblica.disabled = false;
        btnPubblica.innerHTML = 'Pubblica annuncio';
    }
});

initPagina();