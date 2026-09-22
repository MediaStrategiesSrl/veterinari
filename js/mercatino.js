// ==========================================
// 1. IMPORT CENTRALIZZATI
// ==========================================
import { supabase } from '../utils/supabaseClient.js';
import { logError } from '../utils/logger.js';
import { canUsePlatform } from "../utils/permission.js";
import { mostraBannerSponsor } from '../utils/bannerSponsor.js';

// ==========================================
// ELEMENTI DOM E VARIABILI GLOBALI
// ==========================================
const marketGrid = document.getElementById("marketGrid");
const categoryFiltersContainer = document.getElementById("categoryFilters");
const searchInput = document.getElementById("searchInput");
// Contenitore per il banner sponsor di sezione "mercatino" - va aggiunto
// nell'HTML (es. subito sopra marketGrid, sotto i filtri categoria):
//   <div id="bannerSponsor" hidden></div>
const bannerSponsorEl = document.getElementById("bannerSponsor");

let currentUser = null; // Aggiunto per tracciare chi sta guardando il mercatino
let allItems = []; // Salveremo qui tutti gli oggetti per poterli filtrare lato client
let allCategories = []; // Salveremo qui le categorie del DB
let userLocation = null; // Posizione dell'utente
const FALLBACK_IMG = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMDAgMjAwIiB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCI+CiAgPHJlY3Qgd2lkdGg9IjMwMCIgaGVpZ2h0PSIyMDAiIGZpbGw9IiNFMkU4RjAiLz4KICA8cmVjdCB4PSI5MCIgeT0iNjAiIHdpZHRoPSIxMjAiIGhlaWdodD0iOTAiIHJ4PSIxMCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjOTRBM0I4IiBzdHJva2Utd2lkdGg9IjYiLz4KICA8Y2lyY2xlIGN4PSIxMTYiIGN5PSI4NiIgcj0iOSIgZmlsbD0iIzk0QTNCOCIvPgogIDxwb2x5bGluZSBwb2ludHM9Ijk2LDEzOCAxMzIsMTAyIDE1NiwxMjIgMTc2LDk4IDIwNCwxMzgiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzk0QTNCOCIgc3Ryb2tlLXdpZHRoPSI2IiBzdHJva2UtbGluZWpvaW49InJvdW5kIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz4KPC9zdmc+";

// ==========================================
// INIZIALIZZAZIONE
// ==========================================
async function initMercatino() {
    // IL CONTROLLO SPOSTATO QUI DENTRO
    if(!(await canUsePlatform())){
        alert("Per utilizzare Veterinari.it devi accettare le comunicazioni email.");
        window.location.href = "../../index.html"; // Redirezione per bloccare l'utente
        return;
    }

    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        if (authError) throw Object.assign(new Error(authError.message), { code: authError.code || 'AUTH_CHECK_ERROR' });

        if (!user) {
            window.location.href = "../../index.html";
            return;
        }

        currentUser = user; // Salviamo l'utente loggato

        // Banner sponsor sezione "mercatino": una riga, fire-and-forget.
        // mostraBannerSponsor si occupa da sola di utente/città/errori,
        // quindi non serve più una funzione locale dedicata.
        mostraBannerSponsor(bannerSponsorEl, 'mercatino');

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

        // Recuperiamo non solo AVAILABLE, ma anche quelli in corso di cessione
        const { data, error } = await supabase
            .from('marketplace_listings')
            .select(`
                *,
                category:marketplace_categories(name),
                photos:marketplace_listing_photos(photo_url, position)
            `)
            .in('status', ['AVAILABLE', 'RESERVED', 'DELIVERED']) // Escludiamo DRAFT e ARCHIVED
            .order('published_at', { ascending: false });

        if (error) throw Object.assign(new Error(error.message), { code: error.code || 'DB_ITEMS_FETCH_ERROR' });

        // LOGICA DI VISIBILITA'
        // Mostriamo l'oggetto a tutti se è AVAILABLE. 
        // Se è RESERVED o DELIVERED, lo mostriamo SOLO a chi lo ha creato.
        allItems = (data || []).filter(item => {
            if (item.status === 'AVAILABLE') return true;
            return item.owner_user_id === currentUser.id;
        });

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
    let imgUrl = FALLBACK_IMG; // era: "../../assets/default-item.png"
    
    if (item.photos && item.photos.length > 0) {
        const fotoOrdinate = [...item.photos].sort((a, b) => (a.position || 0) - (b.position || 0));
        imgUrl = fotoOrdinate[0].photo_url;
    } else if (item.image_url) {
        imgUrl = item.image_url;
    }

        const cittaDisplay = item.city ? item.city : "Città ignota";
        let distanceDisplay = "";

        // Calcolo distanza
        if (userLocation && item.latitude && item.longitude) {
            const distance = getDistanceFromLatLonInKm(
                userLocation.lat, 
                userLocation.lon, 
                item.latitude, 
                item.longitude
            );
            distanceDisplay = ` · ${distance.toFixed(1)} km`;
        }

        // Adattamento visivo per il proprietario se l'oggetto è in trattativa
        let statoHtml = `<div class="market-item-price" style="color: #059669; font-weight: 800;">GRATIS</div>`;
        let opacity = "1";

        if (item.status === 'RESERVED') {
            statoHtml = `<div class="market-item-price" style="color: #D97706; font-weight: 800; font-size: 0.85rem;"><i class="fa-solid fa-handshake"></i> IN TRATTATIVA</div>`;
        } else if (item.status === 'DELIVERED') {
            statoHtml = `<div class="market-item-price" style="color: #2563EB; font-weight: 800; font-size: 0.85rem;"><i class="fa-solid fa-box"></i> IN CONSEGNA</div>`;
            opacity = "0.7";
        }

        // Creazione Card
        const card = document.createElement("a");
        card.className = "market-item-card";
        card.href = `dettaglio-annuncio.html?id=${item.id}`;
        
        card.style.textDecoration = "none";
        card.style.color = "inherit";
        card.style.display = "block";
        card.style.opacity = opacity;

  card.innerHTML = `
    <img src="${imgUrl}" alt="${item.title}" class="market-item-img" onerror="this.onerror=null; this.src='${FALLBACK_IMG}';">
    <div class="market-item-content">
        <div class="market-item-title">${item.title}</div>
        <div class="market-item-location">${cittaDisplay} ${distanceDisplay}</div>
        ${statoHtml}
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