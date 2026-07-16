// ==========================================
// 1. IMPORT CENTRALIZZATI
// ==========================================
import { supabase } from '../utils/supabaseClient.js';
import { logError } from '../utils/logger.js';

let currentUser = null;

// Elementi del DOM
const form = document.getElementById("pubblicaForm");
const categorySelect = document.getElementById("itemCategory");
const imageInput = document.getElementById("itemImage");
const imagePreview = document.getElementById("imagePreview");
const submitBtn = document.getElementById("submitBtn");
const cityInput = document.getElementById("itemCity");
const addressInput = document.getElementById("itemAddress");

// ==========================================
// 2. INIZIALIZZAZIONE E RECUPERO PROFILO
// ==========================================
async function initForm() {
    try {
        // Controllo utente loggato
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) throw Object.assign(new Error(authError.message), { code: authError.code || 'AUTH_SYS_ERROR' });
        
        if (!user) {
            window.location.href = "../../index.html";
            return;
        }
        currentUser = user;

        // RECUPERO DATI DAL PROFILO UTENTE
        try {
            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('citta, indirizzo')
                .eq('id', currentUser.id)
                .single();

            if (profileError) throw Object.assign(new Error(profileError.message), { code: profileError.code || 'DB_FETCH_PROFILE_ERROR' });

            // UX DESIGN: Precompiliamo i campi per comodità, MA li lasciamo modificabili
            if (profile) {
                cityInput.value = profile.city || "";
                addressInput.value = profile.address || "";
            }
        } catch (error) {
            console.error("Errore nel recupero del profilo:", error);
            await logError({
                source: 'pubblica_annuncio',
                action: 'fetch_user_profile',
                errorMessage: error.message,
                errorCode: error.code || 'UNKNOWN_DB_ERROR',
                context: { userId: currentUser.id }
            });
        }

        // Caricamento categorie dal DB
        await loadCategories();

    } catch (error) {
        console.error("Errore critico in initForm:", error);
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
        categorySelect.innerHTML = '<option value="" disabled selected>Errore di caricamento</option>';
    }
}

// ==========================================
// 3. GESTIONE ANTEPRIMA IMMAGINE
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
// 4. GEOCODING (NOMINATIM) - CALCOLO SUL TESTO DIGITATO
// ==========================================
async function getCoordinatesFromAddress(locationString) {
    try {
        if (!locationString) return { lat: null, lon: null };

        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(locationString)}`);
        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        
        const data = await response.json();

        if (data && data.length > 0) {
            return {
                lat: parseFloat(data[0].lat),
                lon: parseFloat(data[0].lon)
            };
        }
        return { lat: null, lon: null };
    } catch (error) {
        console.error("Errore Geocoding API:", error);
        return { lat: null, lon: null };
    }
}

// ==========================================
// 5. SUBMIT DEL FORM E SALVATAGGIO
// ==========================================
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const title = document.getElementById("itemTitle").value.trim();
    const category_id = document.getElementById("itemCategory").value;
    const city = cityInput.value.trim();
    const address = addressInput.value.trim();
    
    // VALIDAZIONE
    if (!title || !category_id || !city || !address) {
        alert("Compila tutti i campi obbligatori, inclusi Città e Indirizzo di ritiro.");
        return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Acquisizione posizione...';

    try {
        const description = document.getElementById("itemDescription").value.trim();
        const file = imageInput.files[0];

        // Usiamo esattamente ciò che l'utente ha scritto nel form per geolocalizzare
        const searchLocation = `${address}, ${city}`;
        const coords = await getCoordinatesFromAddress(searchLocation);

        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Pubblicazione in corso...';
        let imageUrl = null;

        // Upload Immagine
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

        // Salvataggio nel DB: L'indirizzo esatto va nel DB, ma lo nasconderemo nel frontend della Home Mercatino
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

        alert("Oggetto pubblicato con successo!");
        window.location.href = "mercatino.html";

    } catch (error) {
        console.error("Errore durante la pubblicazione:", error);
        alert("Si è verificato un errore di sistema durante la pubblicazione. Riprova più tardi.");
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Pubblica annuncio';
    }
});

initForm();