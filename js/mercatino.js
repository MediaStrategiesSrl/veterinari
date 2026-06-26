import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const marketGrid = document.getElementById("marketGrid");
const categoryPills = document.querySelectorAll(".cat-pill");
const searchInput = document.getElementById("searchInput");
const categoryFiltersContainer = document.getElementById("categoryFilters");

let allItems = []; // Salveremo qui tutti gli oggetti per poterli filtrare lato client

// ==========================================
// INIZIALIZZAZIONE
// ==========================================
async function initMercatino() {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            window.location.href = "login.html";
            return;
        }

        await fetchMarketItems();
        setupFilters();

    } catch (error) {
        console.error("Errore di inizializzazione:", error);
    }
}

// ==========================================
// RECUPERO DATI DA SUPABASE
// ==========================================
async function fetchMarketItems() {
    try {
        marketGrid.innerHTML = '<div style="grid-column: span 2; text-align: center; color: #888;">Caricamento oggetti...</div>';

        // Recuperiamo solo gli oggetti disponibili
        const { data, error } = await supabase
            .from('marketplace_items')
            .select('*')
            .eq('status', 'active')
            .order('created_at', { ascending: false });

        if (error) throw error;

        allItems = data || [];
        //Generiamo prima i bottoni delle categorie
        renderCategories(allItems);
        // Poi renderizziamo gli oggetti
        renderItems(allItems);

    } catch (error) {
        console.error("Errore nel recupero degli oggetti:", error);
        marketGrid.innerHTML = '<div style="grid-column: span 2; text-align: center; color: #D32F2F;">Errore nel caricamento del mercatino.</div>';
    }
}

function renderCategories(items) {
    categoryFiltersContainer.innerHTML = ""; // Svuota il contenitore

    // 1. Crea e aggiungi sempre il bottone "Tutto" (di default attivo)
    const btnTutto = document.createElement("button");
    btnTutto.className = "cat-pill active";
    btnTutto.setAttribute("data-cat", "Tutto");
    btnTutto.textContent = "Tutto";
    categoryFiltersContainer.appendChild(btnTutto);

    // 2. Estrai le categorie uniche dagli oggetti usando un Set
    // (items.map prende solo le categorie, Set rimuove i doppioni)
    const categorieUniche = [...new Set(items.map(item => item.category))];

    // 3. Crea un bottone per ogni categoria trovata nel DB
    categorieUniche.forEach(categoria => {
        if (!categoria) return; // Ignora se la categoria è vuota o null

        const btn = document.createElement("button");
        btn.className = "cat-pill";
        btn.setAttribute("data-cat", categoria);
        btn.textContent = categoria;
        categoryFiltersContainer.appendChild(btn);
    });

    setupFilters(); // Riapplica gli event listener ai nuovi bottoni
}

// ==========================================
// RENDERIZZAZIONE DEGLI OGGETTI (UI)
// ==========================================
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
        if (item.immagine_url) {
            // Se l'URL dell'immagine è su Supabase Storage, estraiamo l'URL pubblico
            if (item.immagine_url.startsWith('http')) {
                imgUrl = item.immagine_url;
            } else {
                const { data } = supabase.storage.from('storage_veterinari').getPublicUrl(item.immagine_url);
                imgUrl = data.publicUrl;
            }
        }

        // Mock distanza casuale per replicare il mockup (in un'app reale si calcola via lat/long)
        const mockDistance = (Math.random() * 10 + 0.5).toFixed(1);
        const cittaDisplay = item.city ? item.city : "Distanza non nota";

        const card = document.createElement("div");
        card.className = "market-item-card";
        card.innerHTML = `
            <img src="${imgUrl}" alt="${item.title}" class="market-item-img" onerror="this.onerror=null; this.src='https://via.placeholder.com/300x200/E2E8F0/94A3B8?text=No+Immagine';">
            <div class="market-item-content">
                <div class="market-item-title">${item.title}</div>
                <div class="market-item-location">${cittaDisplay} · ${mockDistance} km</div>
                <div class="market-item-price">GRATIS</div>
            </div>
        `;

        // Click sulla card per vedere i dettagli dell'oggetto
        card.addEventListener("click", () => {
            alert(`Apertura dettagli di: ${item.title}`);
            // window.location.href = `dettaglio-oggetto.html?id=${item.id}`;
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
    searchInput.addEventListener("input", applyFilters);
}

function applyFilters() {
    const activeCategory = document.querySelector(".cat-pill.active").getAttribute("data-cat");
    const searchText = searchInput.value.toLowerCase().trim();

    const filteredItems = allItems.filter(item => {
        // Check Categoria
        const matchCategory = activeCategory === "Tutto" || item.categoria === activeCategory;
        
        // Check Testo
        const matchText = item.title.toLowerCase().includes(searchText) || 
                          (item.description && item.description.toLowerCase().includes(searchText));

        return matchCategory && matchText;
    });

    renderItems(filteredItems);
}

// Avvio
initMercatino();