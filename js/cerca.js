import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const categoriesContainer = document.getElementById("categoriesContainer");
const professionalsList = document.getElementById("professionalsList");
const locationBadge = document.getElementById("locationBadge");

// GESTIONE FILTRO DISTANZA
const btnApriFiltri = document.getElementById('btnApriFiltri');
const modalFiltri = document.getElementById('modalFiltri');
const closeFiltri = document.getElementById('closeFiltri');
const distanceRange = document.getElementById('distanceRange');
const distanceValue = document.getElementById('distanceValue');
const applyFiltri = document.getElementById('applyFiltri');

// Variabili globali
let leafletMap = null;
let userLat = 45.4642; 
let userLng = 9.1900;
let allProfessionals = []; // Salveremo qui i dati per poterli filtrare senza ricaricare il DB
let markersLayer = null; // Il "raccoglitore" per i segnalini della mappa

// Formula per calcolare la distanza in Km
function calcolaDistanza(lat1, lon1, lat2, lon2) {
    const R = 6371; 
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return (R * c).toFixed(1); 
}

// ==========================================
// 1. INIZIALIZZAZIONE MAPPA E GPS
// ==========================================
function initMap(lat, lng, cityName) {
    userLat = lat;
    userLng = lng;
    locationBadge.innerHTML = `<i class="fa-solid fa-location-dot" style="color:#F39C12; margin-right:5px;"></i> ${cityName}`;

    leafletMap = L.map('realMap', { zoomControl: false }).setView([lat, lng], 13);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap'
    }).addTo(leafletMap);

    // Inizializza il raccoglitore vuoto dei segnalini e lo aggiunge alla mappa
    markersLayer = L.layerGroup().addTo(leafletMap);

    // Puntino blu dell'utente (Fisso)
    L.circleMarker([lat, lng], {
        radius: 8, fillColor: "#3498db", color: "#fff",
        weight: 3, opacity: 1, fillOpacity: 1
    }).addTo(leafletMap).bindPopup("Tu sei qui");
}

if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
        (position) => {
            initMap(position.coords.latitude, position.coords.longitude, "Posizione attuale");
            loadSearchData(); 
        },
        (error) => {
            initMap(45.4642, 9.1900, "Milano");
            loadSearchData();
        }
    );
} else {
    initMap(45.4642, 9.1900, "Milano");
    loadSearchData();
}

// ==========================================
// 2. RECUPERO DATI E GENERAZIONE FILTRI
// ==========================================
async function loadSearchData() {
    try {
        // 1. ORA CERCHIAMO NELLA TABELLA CORRETTA: veterinarians
        const { data, error } = await supabase
            .from('veterinarians') 
            .select(`
                user_id,
                latitudine,
                longitudine,
                profiles (nome, avatar_url) 
            `); 

        if (error) throw error;
        
        // 2. Adattiamo i dati: siccome sono tutti veterinari, aggiungiamo la categoria a mano
        allProfessionals = (data || []).map(vet => ({
            ...vet,
            tipo_professione: 'Veterinario',
            tariffa_oraria: null // Non c'è nel tuo DB, scriverà "Prezzo su richiesta"
        }));

        // --- A. CREAZIONE DINAMICA DELLE CATEGORIE (I BOTTONI) ---
        categoriesContainer.innerHTML = '';
        if (allProfessionals.length > 0) {
            
            // Aggiungiamo "Tutti" all'inizio dell'array delle categorie
            const categorieUniche = ['Tutti', ...new Set(allProfessionals.map(p => p.tipo_professione))];
            
            categorieUniche.forEach((categoriaTesto, index) => {
                const pill = document.createElement('div');
                pill.className = `category-pill ${index === 0 ? 'active' : ''}`;
                pill.textContent = categoriaTesto;
                
                pill.addEventListener('click', () => {
                    // Colora il bottone selezionato
                    document.querySelectorAll('.category-pill').forEach(p => p.classList.remove('active'));
                    pill.classList.add('active');
                    
                    // Applica il filtro!
                    if (categoriaTesto === 'Tutti') {
                        renderProfessionals(allProfessionals);
                    } else {
                        const filtrati = allProfessionals.filter(p => p.tipo_professione === categoriaTesto);
                        renderProfessionals(filtrati);
                    }
                });
                categoriesContainer.appendChild(pill);
            });
        } else {
            categoriesContainer.innerHTML = '<div class="category-pill">Nessuna categoria</div>';
        }

        // --- B. MOSTRA TUTTI ALL'AVVIO ---
        renderProfessionals(allProfessionals);

    } catch (error) {
        console.error("Errore nel caricamento Cerca:", error);
        professionalsList.innerHTML = `<div style="text-align:center; padding: 2rem; color:red;">Errore di connessione al DB.</div>`;
    }
}

// 1. Apri la modale
if (btnApriFiltri) {
    btnApriFiltri.addEventListener('click', (e) => {
        e.preventDefault();
        modalFiltri.classList.add('show');
    });
}

// 2. Chiudi la modale (con la X o cliccando fuori)
if (closeFiltri) {
    closeFiltri.addEventListener('click', () => modalFiltri.classList.remove('show'));
}
window.addEventListener('click', (e) => {
    if (e.target === modalFiltri) modalFiltri.classList.remove('show');
});

// 3. Aggiorna il numerino dei KM in tempo reale mentre trascini lo slider
if (distanceRange) {
    distanceRange.addEventListener('input', (e) => {
        distanceValue.textContent = e.target.value;
    });
}

// 4. Bottone Applica Filtro
if (applyFiltri) {
    applyFiltri.addEventListener('click', () => {
        const kmScelti = distanceRange.value;
        modalFiltri.classList.remove('show');
        
        // Qui aggiorneremo il badge della mappa
        const badgeMappa = document.querySelector('.leaflet-bottom .leaflet-control') || document.querySelector('.map-badge'); // Adatta in base a come hai strutturato il badge sulla mappa
        if(badgeMappa) badgeMappa.textContent = `Entro ${kmScelti} km`;

        // Filtriamo l'array globale allProfessionals tenendo solo quelli entro il limite
        const professionistiFiltrati = allProfessionals.filter(pro => {
            // Se il prof non ha le coordinate nel DB, per sicurezza lo escludiamo
            if (!pro.latitudine || !pro.longitudine) return false;
            
            // Calcola la distanza
            const distanzaVera = parseFloat(calcolaDistanza(userLat, userLng, pro.latitudine, pro.longitudine));
            
            // Tieni il professionista solo se la sua distanza è MINORE o UGUALE a kmScelti
            return distanzaVera <= kmScelti;
        });

        // Dopo aver filtrato l'array, ordiniamo i sopravvissuti dal più vicino al più lontano!
        professionistiFiltrati.sort((a, b) => {
            const distA = parseFloat(calcolaDistanza(userLat, userLng, a.latitudine, a.longitudine));
            const distB = parseFloat(calcolaDistanza(userLat, userLng, b.latitudine, b.longitudine));
            return distA - distB;
        });

        // Manda in pasto al tuo render la lista accorciata e ordinata
        renderProfessionals(professionistiFiltrati);
    });
}

// ==========================================
// 3. FUNZIONE DI RENDER (AGGIORNA LISTA E MAPPA)
// ==========================================
function renderProfessionals(listaDaMostrare) {
    professionalsList.innerHTML = '';
    markersLayer.clearLayers(); // Pulisce i segnalini vecchi dalla mappa!

    if (listaDaMostrare.length > 0) {
        listaDaMostrare.forEach(pro => {
            const nomePro = pro.profiles?.nome || 'Professionista Anonimo';
            const avatarUrl = pro.profiles?.avatar_url || 'https://via.placeholder.com/150/E2E8F0/E2E8F0';
            const prezzo = pro.tariffa_oraria ? `da €${pro.tariffa_oraria}` : 'Prezzo su richiesta';

            let distanzaTesto = "Distanza n.d.";
            if (pro.latitudine && pro.longitudine) {
                const km = calcolaDistanza(userLat, userLng, pro.latitudine, pro.longitudine);
                distanzaTesto = `${km} km`;

                localStorage.setItem(`dist_${pro.user_id}`, km);

                // Aggiunge il segnalino al raccoglitore dinamico
                L.marker([pro.latitudine, pro.longitudine])
                    .addTo(markersLayer)
                    .bindPopup(`<strong>${nomePro}</strong><br>${pro.tipo_professione}`);
            }

     const proHTML = `
    <a href="dettaglio-professionista.html?id=${pro.user_id}" class="pro-card">
        <img src="${avatarUrl}" alt="${nomePro}" class="pro-avatar">
        <div class="pro-info">
            <div class="pro-name">${nomePro}</div>
            
            <div class="pro-details">
                ${distanzaTesto} &middot; ${prezzo}
            </div>
            
            <div style="font-size: 0.75rem; color: #F39C12; margin-top: 2px;">
                ${pro.tipo_professione}
            </div>
        </div>
        <i class="fa-solid fa-chevron-right chevron-icon"></i>
    </a>
`;
            professionalsList.insertAdjacentHTML('beforeend', proHTML);
        });
    } else {
        professionalsList.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: #64748b;">
                Nessun professionista in questa categoria.
            </div>
        `;
    }
}