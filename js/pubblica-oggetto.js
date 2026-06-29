import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
    // 1. Controllo utente loggato
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        window.location.href = "login.html";
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

        if (profileError) throw profileError;

        // Precompiliamo i campi HTML bloccati
        if (profile) {
            document.getElementById("itemCity").value = profile.city || "Non specificata";
            document.getElementById("itemAddress").value = profile.address || "Non specificato";
        }
    } catch (error) {
        console.error("Errore nel recupero del profilo:", error);
        // Se c'è un errore, compiliamo con un testo di fallback
        document.getElementById("itemCity").value = "Non specificata";
        document.getElementById("itemAddress").value = "Non specificato";
    }

    // 3. Caricamento categorie dal DB per la tendina
    await loadCategories();
}

async function loadCategories() {
    try {
        const { data, error } = await supabase
            .from('marketplace_categories')
            .select('id, name')
            .order('name');

        if (error) throw error;

        // Svuota la select e inserisci la prima voce disabilitata
        categorySelect.innerHTML = '<option value="" disabled selected>Scegli una categoria</option>';

        // Popola la select con i dati reali del DB
        data.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat.id; // L'ID (UUID) verrà salvato nel DB
            option.textContent = cat.name; // Il nome visibile all'utente
            categorySelect.appendChild(option);
        });

    } catch (error) {
        console.error("Errore recupero categorie:", error);
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
// GEOCODING: TRASFORMA L'INDIRIZZO DEL PROFILO IN COORDINATE
// ==========================================
async function getCoordinatesFromAddress(locationString) {
    try {
        // Se non c'è una città valida, non cerchiamo nulla
        if (!locationString || locationString.includes("Non specificata")) {
            return { lat: null, lon: null };
        }

        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(locationString)}`);
        const data = await response.json();

        if (data && data.length > 0) {
            return {
                lat: parseFloat(data[0].lat),
                lon: parseFloat(data[0].lon)
            };
        } else {
            console.warn("Coordinate non trovate per questo indirizzo.");
            return { lat: null, lon: null };
        }
    } catch (error) {
        console.error("Errore Geocoding:", error);
        return { lat: null, lon: null };
    }
}

// ==========================================
// SUBMIT DEL FORM (SALVATAGGIO)
// ==========================================
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Acquisizione posizione...';

    try {
        const title = document.getElementById("itemTitle").value;
        const category_id = document.getElementById("itemCategory").value;
        const description = document.getElementById("itemDescription").value;
        const city = document.getElementById("itemCity").value;
        const address = document.getElementById("itemAddress").value;
        const file = imageInput.files[0];

        // Prepariamo la stringa di ricerca (es. "Via Roma 10, Milano" o solo "Milano se manca la via")
        const searchLocation = (address && address !== "Non specificato") ? `${address}, ${city}` : city;
        
        // Calcoliamo le coordinate partendo dal testo
        const coords = await getCoordinatesFromAddress(searchLocation);

        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Pubblicazione in corso...';

        let imageUrl = null;

        // 1. Se c'è un'immagine, la carichiamo nel bucket Storage
        if (file) {
            const fileExt = file.name.split('.').pop();
            const fileName = `${Math.random()}.${fileExt}`;
            const filePath = `mercatino/${currentUser.id}/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('storage_veterinari')
                .upload(filePath, file);

            if (uploadError) throw uploadError;
            imageUrl = filePath;
        }

        // 2. Inseriamo il record nella tabella marketplace_items
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

        if (insertError) throw insertError;

        // 3. Successo! Torniamo al mercatino
        alert("Oggetto pubblicato con successo!");
        window.location.href = "mercatino.html";

    } catch (error) {
        console.error("Errore durante la pubblicazione:", error);
        alert("Si è verificato un errore durante la pubblicazione. Controlla la console per i dettagli.");
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Pubblica annuncio';
    }
});

// Avvia tutto
initForm();