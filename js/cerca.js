import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const categoryFilters = document.getElementById("categoryFilters");
const professionalsList = document.getElementById("professionalsList");

// ==========================================
// 1. INIZIALIZZAZIONE MAPPA (Leaflet.js)
// ==========================================
// Centriamo su Milano come da Mockup
const map = L.map('map', { zoomControl: false }).setView([45.4642, 9.1900], 13);

// Usiamo un tile layer di CartoDB (Positron) che è chiaro, pulito e senza fronzoli
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '',
    maxZoom: 19
}).addTo(map);

// Aggiungiamo un paio di Pin finti colorati come nel mockup
const orangeIcon = L.divIcon({ className: 'custom-pin', html: '<i class="fa-solid fa-location-dot" style="color: #EE8A2A; font-size: 30px; filter: drop-shadow(0 4px 4px rgba(0,0,0,0.3));"></i>', iconSize: [30, 30], iconAnchor: [15, 30] });
const blueIcon = L.divIcon({ className: 'custom-pin', html: '<i class="fa-solid fa-location-dot" style="color: #1E88E5; font-size: 30px; filter: drop-shadow(0 4px 4px rgba(0,0,0,0.3));"></i>', iconSize: [30, 30], iconAnchor: [15, 30] });

L.marker([45.4700, 9.1800], {icon: orangeIcon}).addTo(map);
L.marker([45.4550, 9.2000], {icon: blueIcon}).addTo(map);

// ==========================================
// 2. RECUPERO DATI E RENDERIZZAZIONE
// ==========================================
async function loadProfessionals() {
    try {
        // Estraiamo i Veterinari (con Join su profiles per Nome/Cognome)
        const { data: vets, error: errVets } = await supabase
            .from("veterinarians")
            .select(`*, profiles(nome, cognome, citta)`);

        // Estraiamo gli Altri Professionisti (con Join)
        const { data: profs, error: errProfs } = await supabase
            .from("professionals")
            .select(`*, profiles(nome, cognome, citta)`);

        if (errVets || errProfs) throw new Error("Errore nel recupero dati");

        // Uniformiamo i dati in un unico Array
        let allProfessionals = [];

        vets?.forEach(v => {
            if(v.profiles) {
                allProfessionals.push({
                    id: v.user_id,
                    categoria: 'Veterinario',
                    nome: `Dott. ${v.profiles.nome} ${v.profiles.cognome}`,
                    citta: v.profiles.citta || 'Milano',
                    avatar: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?q=80&w=150&auto=format&fit=crop', // Placeholder Medico
                    distanza: (Math.random() * 5).toFixed(1), // Distanza simulata
                    rating: (4.5 + Math.random() * 0.5).toFixed(1), // Rating simulato tra 4.5 e 5.0
                    prezzo: 'da €45'
                });
            }
        });

        profs?.forEach(p => {
            if(p.profiles) {
                allProfessionals.push({
                    id: p.user_id,
                    categoria: p.tipo_professione || 'Pet Sitter',
                    nome: `${p.profiles.nome} ${p.profiles.cognome}`,
                    citta: p.profiles.citta || 'Milano',
                    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=150&auto=format&fit=crop', // Placeholder Ragazza
                    distanza: (Math.random() * 5).toFixed(1),
                    rating: (4.5 + Math.random() * 0.5).toFixed(1),
                    prezzo: p.tariffa_oraria > 0 ? `da €${p.tariffa_oraria}/ora` : 'Contatta'
                });
            }
        });

        // ==========================================
        // 3. GENERAZIONE FILTRI DINAMICI
        // ==========================================
        // Crea un Set unico di categorie estratte dal DB
        const categorieUniche = ['Tutti', ...new Set(allProfessionals.map(p => p.categoria))];
        
        categoryFilters.innerHTML = '';
        categorieUniche.forEach((cat, index) => {
            const pill = document.createElement('div');
            pill.className = `filter-pill ${index === 0 ? 'active' : ''}`;
            pill.textContent = cat === 'Veterinario' ? 'Veterinari' : cat; // Plurale estetico
            
            // Funzionalità di filtro al click
            pill.addEventListener('click', () => {
                document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                renderList(cat === 'Tutti' ? allProfessionals : allProfessionals.filter(p => p.categoria === cat));
            });
            
            categoryFilters.appendChild(pill);
        });

        // Mostra tutta la lista all'inizio
        renderList(allProfessionals);

    } catch (error) {
        console.error(error);
        professionalsList.innerHTML = `<p style="text-align:center; color:red;">Errore caricamento dati.</p>`;
    }
}

// Funzione che disegna le Card in HTML
function renderList(lista) {
    professionalsList.innerHTML = '';
    
    if (lista.length === 0) {
        professionalsList.innerHTML = `<p style="text-align:center; color:var(--text-muted);">Nessun professionista trovato in questa categoria.</p>`;
        return;
    }

    // Ordina per distanza crescente (simulata)
    lista.sort((a, b) => a.distanza - b.distanza);

    lista.forEach(prof => {
        professionalsList.innerHTML += `
            <div class="prof-card" onclick="alert('Apertura profilo di ${prof.nome}...')">
                <img src="${prof.avatar}" alt="${prof.nome}" class="prof-avatar">
                <div class="prof-info">
                    <h4>${prof.nome}</h4>
                    <div class="prof-details">
                        ${prof.distanza} km · <i class="fa-solid fa-star"></i> ${prof.rating} · ${prof.prezzo}
                    </div>
                </div>
                <div class="prof-arrow"><i class="fa-solid fa-chevron-right"></i></div>
            </div>
        `;
    });
}

// Avvia tutto
loadProfessionals();