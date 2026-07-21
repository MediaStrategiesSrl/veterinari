// ==========================================
// 1. IMPORT CENTRALIZZATI
// ==========================================
import { supabase } from '../utils/supabaseClient.js';
import { logError } from '../utils/logger.js';

// ==========================================
// ELEMENTI DOM E VARIABILI GLOBALI
// ==========================================
const marketGrid = document.getElementById("marketGrid");
const categoryFiltersContainer = document.getElementById("categoryFilters");
const searchInput = document.getElementById("searchInput");

let allItems = []; // Salveremo qui tutti gli oggetti per poterli filtrare lato client
let allCategories = []; // Salveremo qui le categorie del DB
let userLocation = null; // Posizione dell'utente

// ==========================================
// INIZIALIZZAZIONE
// ==========================================
async function initMercatino() {
    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        if (authError) throw Object.assign(new Error(authError.message), { code: authError.code || 'AUTH_CHECK_ERROR' });

        if (!user) {
            window.location.href = "../../index.html";
            return;
        }

        // 1. Chiediamo la posizione dell'utente
        userLocation = await getUserLocation();

        // 2. Recuperiamo categorie e oggetti
        await fetchCategories();
        await fetchMarketItems();

    } catch (error) {
        console.error("Errore critico di inizializzazione:", error);
        
        await logError({
            source: 'mercatino',
            action: 'init_mercatino',
            errorMessage: error.message || "Errore imprevisto durante l'avvio del mercatino",
            errorCode: error.code || 'UNKNOWN_SYS_ERROR',
            context: {}
        });
    }
}

// ==========================================
// RECUPERO DATI DA SUPABASE
// ==========================================
async function fetchCategories() {
    try {
        const { data, error } = await supabase
            .from('marketplace_categories')
            .select('id, name')
            .order('name'); 

        if (error) throw Object.assign(new Error(error.message), { code: error.code || 'DB_CATEGORIES_FETCH_ERROR' });
        
        allCategories = data || [];
        renderCategories(allCategories);

    } catch (error) {
        console.error("Errore nel recupero delle categorie:", error);
        
        await logError({
            source: 'mercatino',
            action: 'fetch_categories',
            errorMessage: error.message || "Impossibile caricare le categorie dal database",
            errorCode: error.code || 'UNKNOWN_DB_ERROR',
            context: {}
        });
    }
}

async function fetchMarketItems() {
    try {
        marketGrid.innerHTML = '<div style="grid-column: span 2; text-align: center; color: #888;">Caricamento oggetti...</div>';

        // Recuperiamo dalla tabella corretta: marketplace_listings con JOIN su foto e categoria
        const { data, error } = await supabase
            .from('marketplace_listings')
            .select(`
                *,
                category:marketplace_categories(name),
                photos:marketplace_listing_photos(photo_url, position)
            `)
            .eq('status', 'AVAILABLE') // Stato corretto del DB
            .order('published_at', { ascending: false });

        if (error) throw Object.assign(new Error(error.message), { code: error.code || 'DB_ITEMS_FETCH_ERROR' });

        allItems = data || [];
        renderItems(allItems);

    } catch (error) {
        console.error("Errore nel recupero degli oggetti:", error);
        
        await logError({
            source: 'mercatino',
            action: 'fetch_market_items',
            errorMessage: error.message || "Impossibile recuperare gli annunci",
            errorCode: error.code || 'UNKNOWN_DB_ERROR',
            context: {}
        });

        marketGrid.innerHTML = '<div style="grid-column: span 2; text-align: center; color: #D32F2F;">Errore nel caricamento del mercatino. Riprova più tardi.</div>';
    }
}

// ==========================================
// RENDERIZZAZIONE UI
// ==========================================
function renderCategories(categories) {
    categoryFiltersContainer.innerHTML = ""; 

    // 1. Bottone "Tutto" 
    const btnTutto = document.createElement("button");
    btnTutto.className = "cat-pill active";
    btnTutto.setAttribute("data-cat", "Tutto");
    btnTutto.textContent = "Tutto";
    categoryFiltersContainer.appendChild(btnTutto);

    // 2. Bottoni categorie reali
    categories.forEach(cat => {
        const btn = document.createElement("button");
        btn.className = "cat-pill";
        btn.setAttribute("data-cat", cat.name);
        btn.textContent = cat.name;
        categoryFiltersContainer.appendChild(btn);
    });

    setupFilters(); 
}

function renderItems(items) {
    marketGrid.innerHTML = "";

    if (items.length === 0) {
        marketGrid.innerHTML = `
            <div style="grid-column: span 2; text-align: center; color: #64748b; padding: 2rem;">
                Nessun oggetto trovato.
            </div>
        `;
        return;
    }

    items.forEach(item => {
        // Estrazione prima foto disponibile dalla tabella relazionata
        let imgUrl = "../../assets/default-item.png";
        
        if (item.photos && item.photos.length > 0) {
            // Ordina le foto per posizione
            const fotoOrdinate = [...item.photos].sort((a, b) => (a.position || 0) - (b.position || 0));
            imgUrl = fotoOrdinate[0].photo_url;
        } else if (item.image_url) {
            imgUrl = item.image_url;
        }

        const cittaDisplay = item.city ? item.city : "Città ignota";
        let distanceDisplay = "";

        // Calcolo distanza (se coordinate presenti)
        if (userLocation && item.latitude && item.longitude) {
            const distance = getDistanceFromLatLonInKm(
                userLocation.lat, 
                userLocation.lon, 
                item.latitude, 
                item.longitude
            );
            distanceDisplay = ` · ${distance.toFixed(1)} km`;
        }

        // Creazione Card
        const card = document.createElement("a");
        card.className = "market-item-card";
        card.href = `dettaglio-annuncio.html?id=${item.id}`;
        
        card.style.textDecoration = "none";
        card.style.color = "inherit";
        card.style.display = "block";

        card.innerHTML = `
            <img src="${imgUrl}" alt="${item.title}" class="market-item-img" onerror="this.onerror=null; this.src='https://via.placeholder.com/300x200/E2E8F0/94A3B8?text=No+Immagine';">
            <div class="market-item-content">
                <div class="market-item-title">${item.title}</div>
                <div class="market-item-location">${cittaDisplay} ${distanceDisplay}</div>
                <div class="market-item-price" style="color: #059669; font-weight: 800;">GRATIS</div>
            </div>
        `;

        marketGrid.appendChild(card);
    });
}

// ==========================================
// LOGICA DI FILTRAGGIO E RICERCA
// ==========================================
function setupFilters() {
    const categoryPills = document.querySelectorAll(".cat-pill");
    categoryPills.forEach(pill => {
        pill.addEventListener("click", (e) => {
            categoryPills.forEach(p => p.classList.remove("active"));
            e.target.classList.add("active");
            applyFilters();
        });
    });

    if (searchInput) {
        searchInput.addEventListener("input", applyFilters);
    }
}

function applyFilters() {
    const activePill = document.querySelector(".cat-pill.active");
    const activeCategory = activePill ? activePill.getAttribute("data-cat") : "Tutto";
    const searchText = searchInput ? searchInput.value.toLowerCase().trim() : "";

    const filteredItems = allItems.filter(item => {
        const itemCategoryName = item.category ? item.category.name : "";

        const matchCategory = activeCategory === "Tutto" || itemCategoryName === activeCategory;
        
        const matchText = item.title.toLowerCase().includes(searchText) || 
                          (item.description && item.description.toLowerCase().includes(searchText));

        return matchCategory && matchText;
    });

    renderItems(filteredItems);
}

// ==========================================
// SCORRIMENTO CATEGORIE
// ==========================================
function setupCategoryScroll() {
    const scrollLeftBtn = document.getElementById('scrollLeftBtn');
    const scrollRightBtn = document.getElementById('scrollRightBtn');
    const categoryContainer = document.getElementById('categoryFilters');

    if (scrollLeftBtn && scrollRightBtn && categoryContainer) {
        scrollLeftBtn.addEventListener('click', () => {
            categoryContainer.scrollBy({ left: -150, behavior: 'smooth' });
        });

        scrollRightBtn.addEventListener('click', () => {
            categoryContainer.scrollBy({ left: 150, behavior: 'smooth' });
        });
    }
}

// ==========================================
// GEOLOCALIZZAZIONE
// ==========================================
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
                    console.warn("Geolocalizzazione non disponibile:", error);
                    resolve(null); 
                },
                { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
            );
        } else {
            resolve(null);
        }
    });
}

function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    const R = 6371; 
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; 
}

// ==========================================
// AVVIO SCRIPT
// ==========================================
setupCategoryScroll();
initMercatino();