// ==========================================
// 1. IMPORT CENTRALIZZATI
// ==========================================
// Assicurati che i percorsi (../utils/) puntino alla tua struttura reale
import { supabase } from '../utils/supabaseClient.js';
import { logError } from '../utils/logger.js';

let currentUser = null;

// Elementi del DOM
const form = document.getElementById("pubblicaForm");
const categorySelect = document.getElementById("itemCategory");
const imageInput = document.getElementById("itemImage");
const imagePreview = document.getElementById("imagePreview");
const submitBtn = document.getElementById("submitBtn");

// ==========================================
// INIZIALIZZAZIONE E RECUPERO PROFILO
// ==========================================
async function initForm() {
    try {
        // 1. Controllo utente loggato
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        if (authError) throw Object.assign(new Error(authError.message), { code: authError.code || 'AUTH_SYS_ERROR' });
        
        if (!user) {
            window.location.href = "../../index.html";
            return;
        }
        currentUser = user;

        // 2. RECUPERO DATI DAL PROFILO UTENTE
        try {
            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('city, address')
                .eq('id', currentUser.id)
                .single();

            if (profileError) throw Object.assign(new Error(profileError.message), { code: profileError.code || 'DB_FETCH_PROFILE_ERROR' });

            // Precompiliamo i campi HTML bloccati
            if (profile) {
                document.getElementById("itemCity").value = profile.city || "Non specificata";
                document.getElementById("itemAddress").value = profile.address || "Non specificato";
            }
        } catch (error) {
            console.error("Errore nel recupero del profilo:", error);
            
            // Log non bloccante per l'utente, ma utile per noi
            await logError({
                source: 'pubblica_annuncio',
                action: 'fetch_user_profile',
                errorMessage: error.message || "Impossibile recuperare città e indirizzo per precompilare il form",
                errorCode: error.code || 'UNKNOWN_DB_ERROR',
                context: { userId: currentUser.id }
            });

            // Fallback visivo
            document.getElementById("itemCity").value = "Non specificata";
            document.getElementById("itemAddress").value = "Non specificato";
        }

        // 3. Caricamento categorie dal DB per la tendina
        await loadCategories();

    } catch (error) {
        console.error("Errore critico in initForm:", error);
        await logError({
            source: 'pubblica_annuncio',
            action: 'init_form',
            errorMessage: error.message || "Errore inizializzazione modulo pubblicazione",
            errorCode: error.code || 'UNKNOWN_SYS_ERROR',
            context: {}
        });
    }
}

async function loadCategories() {
    try {
        const { data, error } = await supabase
            .from('marketplace_categories')
            .select('id, name')
            .order('name');

        if (error) throw Object.assign(new Error(error.message), { code: error.code || 'DB_FETCH_CATEGORIES_ERROR' });

        categorySelect.innerHTML = '<option value="" disabled selected>Scegli una categoria</option>';

        data.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat.id; 
            option.textContent = cat.name; 
            categorySelect.appendChild(option);
        });

    } catch (error) {
        console.error("Errore recupero categorie:", error);
        
        await logError({
            source: 'pubblica_annuncio',
            action: 'load_categories',
            errorMessage: error.message || "Impossibile caricare le categorie del mercatino",
            errorCode: error.code || 'UNKNOWN_DB_ERROR',
            context: {}
        });

        categorySelect.innerHTML = '<option value="" disabled selected>Errore di caricamento</option>';
    }
}

// ==========================================
// GESTIONE ANTEPRIMA IMMAGINE
// ==========================================
imageInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            imagePreview.src = e.target.result;
            imagePreview.style.display = 'block';
        }
        reader.readAsDataURL(file);
    }
});

// ==========================================
// GEOCODING: TRASFORMA L'INDIRIZZO IN COORDINATE
// ==========================================
async function getCoordinatesFromAddress(locationString) {
    try {
        if (!locationString || locationString.includes("Non specificata")) {
            return { lat: null, lon: null };
        }

        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(locationString)}`);
        
        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        
        const data = await response.json();

        if (data && data.length > 0) {
            return {
                lat: parseFloat(data[0].lat),
                lon: parseFloat(data[0].lon)
            };
        } else {
            return { lat: null, lon: null };
        }
    } catch (error) {
        console.error("Errore Geocoding API Esterna:", error);
        
        // Log per tracciare se Nominatim ci blocca (rate limit)
        await logError({
            source: 'pubblica_annuncio',
            action: 'geocoding_api',
            errorMessage: error.message || "Fallimento chiamata API Nominatim OpenStreetMap",
            errorCode: 'EXTERNAL_API_ERROR',
            context: { query: locationString }
        });
        
        return { lat: null, lon: null };
    }
}

// ==========================================
// SUBMIT DEL FORM (SALVATAGGIO)
// ==========================================
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // ERRORE LOGICO: Validazione di base (Nessun log DB)
    const title = document.getElementById("itemTitle").value.trim();
    const category_id = document.getElementById("itemCategory").value;
    
    if (!title || !category_id) {
        alert("Compila tutti i campi obbligatori.");
        return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Acquisizione posizione...';

    try {
        const description = document.getElementById("itemDescription").value.trim();
        const city = document.getElementById("itemCity").value;
        const address = document.getElementById("itemAddress").value;
        const file = imageInput.files[0];

        const searchLocation = (address && address !== "Non specificato") ? `${address}, ${city}` : city;
        const coords = await getCoordinatesFromAddress(searchLocation);

        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Pubblicazione in corso...';

        let imageUrl = null;

        // 1. Upload Immagine
        if (file) {
            const fileExt = file.name.split('.').pop();
            const fileName = `${Math.random()}.${fileExt}`;
            const filePath = `mercatino/${currentUser.id}/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('storage_veterinari')
                .upload(filePath, file);

            if (uploadError) throw Object.assign(new Error(uploadError.message), { code: uploadError.code || 'STORAGE_UPLOAD_ERROR' });
            imageUrl = filePath;
        }

        // 2. Inserimento Record
        const { error: insertError } = await supabase
            .from('marketplace_items')
            .insert([
                {
                    seller_id: currentUser.id,
                    title: title,
                    category_id: category_id,
                    description: description,
                    city: city,
                    address: address,
                    price: 0, 
                    status: 'active',
                    image_url: imageUrl,
                    latitude: coords.lat,   
                    longitude: coords.lon   
                }
            ]);

        if (insertError) throw Object.assign(new Error(insertError.message), { code: insertError.code || 'DB_INSERT_ITEM_ERROR' });

        // 3. Successo
        alert("Oggetto pubblicato con successo!");
        window.location.href = "mercatino.html";

    } catch (error) {
        console.error("Errore durante la pubblicazione:", error);
        
        await logError({
            source: 'pubblica_annuncio',
            action: 'submit_form',
            errorMessage: error.message || "Errore fatale durante l'upload dell'immagine o l'insert nel DB",
            errorCode: error.code || 'UNKNOWN_DB_ERROR',
            context: { userId: currentUser.id, title }
        });

        alert("Si è verificato un errore di sistema durante la pubblicazione. I tecnici sono stati avvisati.");
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Pubblica annuncio';
    }
});

// Avvia tutto
initForm();