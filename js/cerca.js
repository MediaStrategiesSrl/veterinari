import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const categoriesContainer = document.getElementById("categoriesContainer");
const professionalsList = document.getElementById("professionalsList");
const locationBadge = document.getElementById("locationBadge");

// ==========================================
// 1. INIZIALIZZAZIONE MAPPA E GPS
// ==========================================
function initMap(lat, lng, cityName) {
    locationBadge.innerHTML = `<i class="fa-solid fa-location-dot" style="color:#F39C12; margin-right:5px;"></i> ${cityName}`;

    const map = L.map('realMap', {
        zoomControl: false // Niente tasti + e - per mantenere il design pulito
    }).setView([lat, lng], 14);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    L.circleMarker([lat, lng], {
        radius: 8,
        fillColor: "#3498db",
        color: "#fff",
        weight: 3,
        opacity: 1,
        fillOpacity: 1
    }).addTo(map);
}

// Chiedi la posizione al browser/telefono
if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            initMap(lat, lng, "Posizione attuale");
        },
        (error) => {
            console.warn("GPS negato. Uso Milano.");
            initMap(45.4642, 9.1900, "Entro 5 km · Milano");
        }
    );
} else {
    initMap(45.4642, 9.1900, "Milano");
}

// ==========================================
// 2. CARICAMENTO DATI DINAMICI (SU MISURA PER IL TUO DB)
// ==========================================
async function loadSearchData() {
    try {
        // SCARICA I DATI DALLA TUA TABELLA
        const { data: professionisti, error } = await supabase
            .from('professionals') 
            .select(`
                user_id,
                tipo_professione,
                tariffa_oraria,
                latitudine,
                longitudine,
                profiles (nome, avatar_url) 
            `); 
            /*'profiles (nome, avatar_url)' per prendere i dati anagrafici 
               sfruttando la FK*/

        if (error) throw error;

        // --- A. CREAZIONE DINAMICA DELLE CATEGORIE (I BOTTONI) ---
        categoriesContainer.innerHTML = '';
        if (professionisti && professionisti.length > 0) {
            
            // Estrae un array senza duplicati dei "tipo_professione" trovati
            const categorieUniche = [...new Set(professionisti.map(p => p.tipo_professione))];
            
            categorieUniche.forEach((categoriaTesto, index) => {
                const pill = document.createElement('div');
                pill.className = `category-pill ${index === 0 ? 'active' : ''}`;
                pill.textContent = categoriaTesto;
                
                pill.addEventListener('click', () => {
                    document.querySelectorAll('.category-pill').forEach(p => p.classList.remove('active'));
                    pill.classList.add('active');
                    // In futuro qui aggiungerai il filtro per ricaricare la lista sotto
                });
                categoriesContainer.appendChild(pill);
            });
        } else {
            categoriesContainer.innerHTML = '<div class="category-pill">Nessuna categoria</div>';
        }


        // --- B. LISTA PROFESSIONISTI ---
        professionalsList.innerHTML = '';
        
        if (professionisti && professionisti.length > 0) {
            professionisti.forEach(pro => {
                
                // Estrae nome e foto dalla tabella 'users' unita
                const nomePro = pro.profiles?.nome || 'Professionista Anonimo';
                const avatarUrl = pro.profiles?.avatar_url || 'https://via.placeholder.com/150/E2E8F0/E2E8F0';
                
                // Formatta la tua tariffa oraria
                const prezzo = pro.tariffa_oraria ? `da €${pro.tariffa_oraria}` : 'Prezzo su richiesta';

                // Distanza simulata (in futuro userai pro.latitudine e pro.longitudine rispetto al GPS!)
                const randomDistance = (Math.random() * 5 + 0.5).toFixed(1);

                const proHTML = `
                    <a href="#" class="pro-card">
                        <img src="${avatarUrl}" alt="${nomePro}" class="pro-avatar">
                        <div class="pro-info">
                            <div class="pro-name">${nomePro}</div>
                            <div class="pro-details">
                                ${randomDistance} km <i class="fa-solid fa-star"></i> 4.9 · ${prezzo}
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
                    Nessun professionista registrato nel sistema.
                </div>
            `;
        }

    } catch (error) {
        console.error("Errore nel caricamento Cerca:", error);
        professionalsList.innerHTML = `<div style="text-align:center; padding: 2rem;">Errore di connessione al database.</div>`;
    }
}

loadSearchData();