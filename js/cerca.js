// ==========================================
// 1. IMPORT CENTRALIZZATI
// ==========================================
import { supabase } from '../utils/supabaseClient.js';
// Assicurati che logError esista, altrimenti commentalo se non lo usi
// import { logError } from '../utils/logger.js'; 

const categoriesContainer = document.getElementById("categoriesContainer");
const professionalsList = document.getElementById("professionalsList");
const locationBadge = document.getElementById("locationBadge");
const searchInput = document.getElementById("searchInput"); 

// GESTIONE FILTRO DISTANZA
const btnApriFiltri = document.getElementById('btnApriFiltri');
const modalFiltri = document.getElementById('modalFiltri');
const closeFiltri = document.getElementById('closeFiltri');
const distanceRange = document.getElementById('distanceRange');
const distanceValue = document.getElementById('distanceValue');
const applyFiltri = document.getElementById('applyFiltri');
const resetFiltri = document.getElementById('resetFiltri'); // ORA ESISTE NELL'HTML!

// Variabili globali
let leafletMap = null;
let userLat = 45.4642; 
let userLng = 9.1900;
let allLocations = []; 
let markersLayer = null; 

// STATO FILTRO DISTANZA: All'avvio è DISATTIVATO (false)
let isDistanceFilterActive = false;

// Estrazione sicura dei dati profilo
function getProfileData(profileObj, field) {
    if (!profileObj) return null;
    if (Array.isArray(profileObj)) return profileObj[0]?.[field] || null;
    return profileObj[field] || null;
}

// Formula per calcolare la distanza in Km
function calcolaDistanza(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return NaN;
    const R = 6371; 
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return parseFloat((R * c).toFixed(1)); 
}

// ==========================================
// 2. INIZIALIZZAZIONE MAPPA E GPS
// ==========================================
function initMap(lat, lng, cityName) {
    userLat = lat;
    userLng = lng;
    if (locationBadge) {
        locationBadge.innerHTML = `<i class="fa-solid fa-location-dot" style="color:#F39C12; margin-right:5px;"></i> ${cityName}`;
    }

    const mapElement = document.getElementById('realMap');
    if (mapElement && !leafletMap) {
        leafletMap = L.map('realMap', { zoomControl: false }).setView([lat, lng], 13);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; OpenStreetMap'
        }).addTo(leafletMap);
        markersLayer = L.layerGroup().addTo(leafletMap);

        L.circleMarker([lat, lng], {
            radius: 8, fillColor: "#3498db", color: "#fff",
            weight: 3, opacity: 1, fillOpacity: 1
        }).addTo(leafletMap).bindPopup("Tu sei qui");
    }
}

if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
        (position) => {
            initMap(position.coords.latitude, position.coords.longitude, "Posizione attuale");
            loadSearchData(); 
        },
        async (error) => {
            console.warn("GPS disattivato. Fallback su Milano.");
            initMap(45.4642, 9.1900, "Milano");
            loadSearchData();
        }
    );
} else {
    initMap(45.4642, 9.1900, "Milano");
    loadSearchData();
}

// ==========================================
// 3. RECUPERO DATI DAL DATABASE
// ==========================================
async function loadSearchData() {
    try {
        // A. Scarica i Veterinari e le loro sedi fisiche
        const { data: vetsData, error: vetsError } = await supabase
            .from('veterinarians') 
            .select(`
                user_id,
                profiles (
                    nome, 
                    cognome,
                    avatar_url, 
                    provider_locations (*)
                )
            `); 

        if (vetsError) throw new Error(vetsError.message);

        const normalizedVets = (vetsData || []).flatMap(v => {
            const basicInfo = {
                user_id: v.user_id,
                nome: getProfileData(v.profiles, 'nome') || 'Veterinario',
                cognome: getProfileData(v.profiles, 'cognome') || '',
                avatar_url: getProfileData(v.profiles, 'avatar_url'),
                tipo_professione: 'Veterinario',
                tariffa_oraria: null
            };
            const sedi = getProfileData(v.profiles, 'provider_locations') || [];
            if (sedi.length === 0) return [{ ...basicInfo, latitudine: null, longitudine: null, address: 'n.d.' }];
            return sedi.map(s => ({ ...basicInfo, id_sede: s.id, latitudine: s.latitudine, longitudine: s.longitudine, address: s.indirizzo }));
        });

        // B. Scarica i Professionisti (Sitter, Educatori)
        const { data: prosData, error: prosError } = await supabase
            .from('professionals') 
            .select(`
                user_id, 
                tipo_professione, 
                tariffa_oraria,
                profiles (
                    nome, 
                    cognome,
                    avatar_url, 
                    provider_locations (*)
                )
            `);

        if (prosError) throw new Error(prosError.message);

        const normalizedPros = (prosData || []).flatMap(p => {
            const basicInfo = {
                user_id: p.user_id,
                nome: getProfileData(p.profiles, 'nome') || 'Professionista',
                cognome: getProfileData(p.profiles, 'cognome') || '',
                avatar_url: getProfileData(p.profiles, 'avatar_url'),
                tipo_professione: p.tipo_professione || 'Altro',
                tariffa_oraria: p.tariffa_oraria
            };
            const sedi = getProfileData(p.profiles, 'provider_locations') || [];
            if (sedi.length === 0) return [{ ...basicInfo, latitudine: null, longitudine: null, address: 'n.d.' }];
            return sedi.map(s => ({ ...basicInfo, id_sede: s.id, latitudine: s.latitudine, longitudine: s.longitudine, address: s.indirizzo }));
        });

        // C. Unisce le due liste di SEDI
        allLocations = [...normalizedVets, ...normalizedPros];

        // Creazione Pille/Categorie
        if (categoriesContainer) {
            categoriesContainer.innerHTML = '';
            
            if (allLocations.length > 0) {
                categoriesContainer.style.display = 'flex';
                categoriesContainer.style.alignItems = 'center';
                categoriesContainer.style.gap = '5px';
                
                const leftArrow = document.createElement('i');
                leftArrow.className = 'fa-solid fa-chevron-left';
                leftArrow.style.cssText = 'color:#F58220; cursor:pointer; padding:0 5px; font-size:1.1rem;';

                const track = document.createElement('div');
                track.style.cssText = 'display:flex; gap:10px; overflow-x:auto; scroll-behavior:smooth; flex-grow:1; scrollbar-width:none; -ms-overflow-style:none;';
                track.insertAdjacentHTML('afterbegin', `<style>track::-webkit-scrollbar { display: none; }</style>`);

                const rightArrow = document.createElement('i');
                rightArrow.className = 'fa-solid fa-chevron-right';
                rightArrow.style.cssText = 'color:#F58220; cursor:pointer; padding:0 5px; font-size:1.1rem;';

                const categorieUniche = ['Tutti', ...new Set(allLocations.map(p => p.tipo_professione).filter(Boolean))];
                categorieUniche.forEach((categoriaTesto, index) => {
                    const pill = document.createElement('div');
                    pill.className = `category-pill ${index === 0 ? 'active' : ''}`;
                    pill.textContent = categoriaTesto;
                    pill.style.whiteSpace = 'nowrap';
                    
                    pill.addEventListener('click', () => {
                        track.querySelectorAll('.category-pill').forEach(p => p.classList.remove('active'));
                        pill.classList.add('active');
                        applicaFiltriIncrociati();
                    });
                    track.appendChild(pill);
                });

                leftArrow.addEventListener('click', () => track.scrollBy({ left: -150, behavior: 'smooth' }));
                rightArrow.addEventListener('click', () => track.scrollBy({ left: 150, behavior: 'smooth' }));

                categoriesContainer.appendChild(leftArrow);
                categoriesContainer.appendChild(track);
                categoriesContainer.appendChild(rightArrow);
            }
        }

        applicaFiltriIncrociati();

    } catch (error) {
        console.error("Errore Fetch:", error);
        if (professionalsList) {
            professionalsList.innerHTML = `<div style="text-align:center; padding: 2rem; color:#ef4444;"><p>Errore di connessione al database.</p></div>`;
        }
    }
}

// ==========================================
// 4. MOTORE DI RICERCA CENTRALIZZATO
// ==========================================
function applicaFiltriIncrociati() {
    let risultati = [...allLocations];

    // 1. FILTRO DI TESTO (L'INPUT DELL'UTENTE VIENE SEMPRE RISPETTATO)
    const termine = searchInput ? searchInput.value.toLowerCase().trim() : '';
    if (termine !== '') {
        risultati = risultati.filter(pro => {
            const nome = (pro.nome || '').toLowerCase();
            const cognome = (pro.cognome || '').toLowerCase();
            const tipo = (pro.tipo_professione || '').toLowerCase();
            return nome.includes(termine) || cognome.includes(termine) || tipo.includes(termine);
        });
    }

    // 2. FILTRO CATEGORIA (PILLOLE)
    const activePill = document.querySelector('.category-pill.active');
    const categoriaSelezionata = activePill ? activePill.textContent.trim() : 'Tutti';
    
    if (categoriaSelezionata !== 'Tutti') {
        risultati = risultati.filter(p => (p.tipo_professione || '').toLowerCase() === categoriaSelezionata.toLowerCase());
    }

    // 3. FILTRO DISTANZA (SOLO SE L'UTENTE HA CLICCATO "APPLICA FILTRO")
    if (isDistanceFilterActive) {
        let kmScelti = Infinity;
        if (distanceRange && distanceRange.value) {
            kmScelti = parseFloat(distanceRange.value);
        }

        risultati = risultati.filter(pro => {
            const distanzaVera = calcolaDistanza(userLat, userLng, pro.latitudine, pro.longitudine);
            // CORREZIONE: Se non ha coordinate, lo escludiamo! Prima bypassava il filtro
            if (isNaN(distanzaVera)) return false; 
            return distanzaVera <= kmScelti;
        });
    }

    // 4. ORDINAMENTO PER DISTANZA
    risultati.sort((a, b) => {
        const distA = calcolaDistanza(userLat, userLng, a.latitudine, a.longitudine);
        const distB = calcolaDistanza(userLat, userLng, b.latitudine, b.longitudine);
        
        const valA = isNaN(distA) ? 999999 : distA;
        const valB = isNaN(distB) ? 999999 : distB;
        return valA - valB;
    });

    renderProfessionals(risultati);
}

// Ascolta i tasti digitati nell'input
if (searchInput) {
    searchInput.addEventListener('input', applicaFiltriIncrociati);
}

// ==========================================
// 5. GESTIONE MODALE E BOTTONI
// ==========================================
if (btnApriFiltri) btnApriFiltri.addEventListener('click', (e) => { e.preventDefault(); modalFiltri.classList.add('show'); });
if (closeFiltri) closeFiltri.addEventListener('click', () => modalFiltri.classList.remove('show'));
window.addEventListener('click', (e) => { if (e.target === modalFiltri) modalFiltri.classList.remove('show'); });

if (distanceRange) distanceRange.addEventListener('input', (e) => { 
    if (distanceValue) distanceValue.textContent = e.target.value; 
});

// APPLICA IL FILTRO DISTANZA
if (applyFiltri) {
    applyFiltri.addEventListener('click', () => {
        isDistanceFilterActive = true; 
        modalFiltri.classList.remove('show');
        applicaFiltriIncrociati();
    });
}

// RIMUOVE IL FILTRO DISTANZA E RIPORTA TUTTO ALLA NORMALITÀ
if (resetFiltri) {
    resetFiltri.addEventListener('click', () => {
        isDistanceFilterActive = false; 
        
        // Opzionale: resetta visivamente la barra a 50km
        if(distanceRange) distanceRange.value = 50;
        if(distanceValue) distanceValue.textContent = 50;
        
        modalFiltri.classList.remove('show');
        applicaFiltriIncrociati();
    });
}

// ==========================================
// 6. RENDER DEI RISULTATI
// ==========================================
function renderProfessionals(listaDaMostrare) {
    if (!professionalsList) return;
    professionalsList.innerHTML = '';
    
    if (markersLayer) markersLayer.clearLayers(); 

    const utentiStampati = new Set();

    if (listaDaMostrare.length > 0) {
        listaDaMostrare.forEach(pro => {
            const avatarUrl = pro.avatar_url || 'https://via.placeholder.com/150/E2E8F0/64748B';
            const prezzo = pro.tariffa_oraria ? `da €${parseFloat(pro.tariffa_oraria).toFixed(2)}` : 'Prezzo su richiesta';

            let distanzaTesto = "Distanza n.d.";
            const km = calcolaDistanza(userLat, userLng, pro.latitudine, pro.longitudine);
            
            if (!isNaN(km)) {
                distanzaTesto = `${km} km`;

                // Aggiunge marker sulla mappa
                if (markersLayer) {
                    L.marker([pro.latitudine, pro.longitudine])
                        .addTo(markersLayer)
                        .bindPopup(`<strong>${pro.nome} ${pro.cognome}</strong><br>${pro.tipo_professione}<br><p style="font-size:0.7rem; color:#64748B;">${pro.address}</p>`);
                }
            }

            // Evita duplicati se lo stesso utente ha più sedi vicine
            if (!utentiStampati.has(pro.user_id)) {
                utentiStampati.add(pro.user_id);
                
                const proHTML = `
                    <a href="dettaglio-professionista.html?id=${pro.user_id}" class="pro-card" style="display: flex; align-items: center; background: #fff; padding: 15px; border-radius: 16px; margin-bottom: 12px; text-decoration: none; border: 1px solid #E2E8F0;">
                        <img src="${avatarUrl}" alt="${pro.nome} ${pro.cognome}" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover; margin-right: 15px;">
                        <div style="flex-grow: 1;">
                            <div style="font-weight: bold; color: #1E293B; font-size: 1.1rem; margin-bottom: 2px;">${pro.nome} ${pro.cognome}</div>
                            <div style="font-size: 0.8rem; color: #64748B;">${distanzaTesto} &middot; ${prezzo}</div>
                            <div style="font-size: 0.75rem; color: #F58220; margin-top: 4px; font-weight: 600;">
                                ${pro.tipo_professione}
                            </div>
                        </div>
                        <i class="fa-solid fa-chevron-right" style="color: #CBD5E1;"></i>
                    </a>
                `;
                professionalsList.insertAdjacentHTML('beforeend', proHTML);
            }
        });
    } else {
        professionalsList.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: #64748b;">
                <p>Nessun risultato corrisponde ai tuoi filtri.</p>
            </div>
        `;
    }
}