import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const marketGrid = document.getElementById("marketGrid");
const categoryFiltersContainer = document.getElementById("categoryFilters");
const searchInput = document.getElementById("searchInput");

let allItems = []; // Salveremo qui tutti gli oggetti per poterli filtrare lato client
let allCategories = []; // Salveremo qui le categorie del DB

// ==========================================
// INIZIALIZZAZIONE
// ==========================================
async function initMercatino() {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            window.location.href = "index.html";
            return;
        }

        // 1. Chiediamo la posizione dell'utente
        userLocation = await getUserLocation();

        // 2. Recuperiamo categorie e oggetti
        await fetchCategories();
        await fetchMarketItems();

    } catch (error) {
        console.error("Errore di inizializzazione:", error);
    }
}

// ==========================================
// RECUPERO DATI DA SUPABASE
// ==========================================

// Nuova funzione per estrarre la lista ufficiale delle categorie
async function fetchCategories() {
    try {
        const { data, error } = await supabase
            .from('marketplace_categories')
            .select('id, name')
            .order('name'); // Mette in ordine alfabetico

        if (error) throw error;
        
        allCategories = data || [];
        renderCategories(allCategories);

    } catch (error) {
        console.error("Errore nel recupero delle categorie:", error);
    }
}

async function fetchMarketItems() {
    try {
        marketGrid.innerHTML = '<div style="grid-column: span 2; text-align: center; color: #888;">Caricamento oggetti...</div>';

        // Recuperiamo gli oggetti e facciamo una JOIN per ottenere il nome della categoria
        // "category:marketplace_categories(name)" rinomina il risultato in "category"
        const { data, error } = await supabase
            .from('marketplace_items')
            .select(`
                *,
                category:marketplace_categories(name)
            `)
            .eq('status', 'active')
            .order('created_at', { ascending: false });

        if (error) throw error;

        allItems = data || [];
        renderItems(allItems);

    } catch (error) {
        console.error("Errore nel recupero degli oggetti:", error);
        marketGrid.innerHTML = '<div style="grid-column: span 2; text-align: center; color: #D32F2F;">Errore nel caricamento del mercatino.</div>';
    }
}

// ==========================================
// RENDERIZZAZIONE UI
// ==========================================
function renderCategories(categories) {
    categoryFiltersContainer.innerHTML = ""; // Svuota il contenitore

    // 1. Crea e aggiungi sempre il bottone "Tutto" (di default attivo)
    const btnTutto = document.createElement("button");
    btnTutto.className = "cat-pill active";
    btnTutto.setAttribute("data-cat", "Tutto");
    btnTutto.textContent = "Tutto";
    categoryFiltersContainer.appendChild(btnTutto);

    // 2. Crea un bottone per ogni categoria reale presente nel Database
    categories.forEach(cat => {
        const btn = document.createElement("button");
        btn.className = "cat-pill";
        btn.setAttribute("data-cat", cat.name); // Usiamo il nome della categoria
        btn.textContent = cat.name;
        categoryFiltersContainer.appendChild(btn);
    });

    setupFilters(); // Riapplica gli event listener ai nuovi bottoni
}

function renderItems(items) {
    marketGrid.innerHTML = "";

    if (items.length === 0) {
        marketGrid.innerHTML = `
            <div style="grid-column: span 2; text-align: center; color: #64748b; padding: 2rem;">
                Nessun oggetto trovato per questa ricerca.
            </div>
        `;
        return;
    }

    items.forEach(item => {
        // Gestione immagine (fallback se non c'è)
        let imgUrl = "assets/default-item.png";
        if (item.image_url) {
            if (item.image_url.startsWith('http')) {
                imgUrl = item.image_url;
            } else {
                const { data } = supabase.storage.from('storage_veterinari').getPublicUrl(item.image_url);
                imgUrl = data.publicUrl;
            }
        }

        // Mock distanza casuale per replicare il mockup
      const cittaDisplay = item.city ? item.city : "Città ignota";
        let distanceDisplay = "";

        // CALCOLO REALE DELLA DISTANZA
        // Controlliamo se abbiamo il GPS dell'utente e se l'oggetto ha le coordinate nel DB
        if (userLocation && item.latitude && item.longitude) {
            const distance = getDistanceFromLatLonInKm(
                userLocation.lat, 
                userLocation.lon, 
                item.latitude, 
                item.longitude
            );
            distanceDisplay = ` · ${distance.toFixed(1)} km`;
        }

        const card = document.createElement("div");
        card.className = "market-item-card";
        card.innerHTML = `
            <img src="${imgUrl}" alt="${item.title}" class="market-item-img" onerror="this.onerror=null; this.src='https://via.placeholder.com/300x200/E2E8F0/94A3B8?text=No+Immagine';">
            <div class="market-item-content">
                <div class="market-item-title">${item.title}</div>
                <div class="market-item-location">${cittaDisplay} · ${distanceDisplay}</div>
                <div class="market-item-price">GRATIS</div>
            </div>
        `;

        // Click sulla card per vedere i dettagli
        card.addEventListener("click", () => {
            // window.location.href = `dettaglio-oggetto.html?id=${item.id}`;
            console.log(`Apertura dettagli di: ${item.title}`);
        });

        marketGrid.appendChild(card);
    });
}

// ==========================================
// LOGICA DI FILTRAGGIO E RICERCA
// ==========================================
function setupFilters() {
    // Filtro per Categoria (Pills)
    const categoryPills = document.querySelectorAll(".cat-pill");
    categoryPills.forEach(pill => {
        pill.addEventListener("click", (e) => {
            // Rimuovi classe active da tutte e aggiungila a quella cliccata
            categoryPills.forEach(p => p.classList.remove("active"));
            e.target.classList.add("active");

            applyFilters();
        });
    });

    // Filtro per Testo (Barra di ricerca)
    // Usiamo input per filtrare in tempo reale mentre si digita
    searchInput.addEventListener("input", applyFilters);
}

function applyFilters() {
    const activeCategory = document.querySelector(".cat-pill.active").getAttribute("data-cat");
    const searchText = searchInput.value.toLowerCase().trim();

    const filteredItems = allItems.filter(item => {
        // Estraiamo il nome della categoria dalla relazione JOIN
        const itemCategoryName = item.category ? item.category.name : "";

        // Check Categoria
        const matchCategory = activeCategory === "Tutto" || itemCategoryName === activeCategory;
        
        // Check Testo
        const matchText = item.title.toLowerCase().includes(searchText) || 
                          (item.description && item.description.toLowerCase().includes(searchText));

        return matchCategory && matchText;
    });

    renderItems(filteredItems);
}

// ==========================================
// SCORRIMENTO CATEGORIE (FRECCE)
// ==========================================
function setupCategoryScroll() {
    const scrollLeftBtn = document.getElementById('scrollLeftBtn');
    const scrollRightBtn = document.getElementById('scrollRightBtn');
    const categoryContainer = document.getElementById('categoryFilters');

    if (scrollLeftBtn && scrollRightBtn && categoryContainer) {
        // Scorre a sinistra di 150px
        scrollLeftBtn.addEventListener('click', () => {
            categoryContainer.scrollBy({ left: -150, behavior: 'smooth' });
        });

        // Scorre a destra di 150px
        scrollRightBtn.addEventListener('click', () => {
            categoryContainer.scrollBy({ left: 150, behavior: 'smooth' });
        });
    }
}

// ==========================================
// GEOLOCALIZZAZIONE E CALCOLO DISTANZA
// ==========================================

// Variabile globale per salvare la posizione dell'utente
let userLocation = null;

// Richiede la posizione attuale del dispositivo
async function getUserLocation() {
    return new Promise((resolve) => {
        if ("geolocation" in navigator) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    resolve({
                        lat: position.coords.latitude,
                        lon: position.coords.longitude
                    });
                },
                (error) => {
                    console.warn("Geolocalizzazione negata o non disponibile:", error);
                    resolve(null); // Procediamo senza posizione se l'utente nega il permesso
                },
                { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
            );
        } else {
            console.warn("Geolocalizzazione non supportata dal browser.");
            resolve(null);
        }
    });
}

// Formula di Haversine per calcolare la distanza in km tra due coordinate
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    const R = 6371; // Raggio della Terra in km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; 
}

// Chiamiamo la funzione subito per attivare gli event listener
setupCategoryScroll();

// Avvio
initMercatino();