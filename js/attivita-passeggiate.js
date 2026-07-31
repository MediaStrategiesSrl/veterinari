import { supabase } from '../utils/supabaseClient.js';
import { logError } from '../utils/logger.js'; // Importazione corretta del logger centralizzato

document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    // FIX: la convenzione dell'app è 'petId' (camelCase), come si vede in
    // scheda-paziente.js e nei link a nuova-visita.html/storia-clinica.html.
    // Teniamo comunque un fallback per sicurezza.
    const petId = urlParams.get('petId') || urlParams.get('pet_id') || urlParams.get('id');
    
    const walksContainer = document.getElementById('walksContainer');
    const petNameSub = document.getElementById('petNameSub');
    const btnBack = document.getElementById('btnBack');

    // Gestione del pulsante indietro
    btnBack.addEventListener('click', (e) => {
        if (document.referrer.includes('scheda-paziente')) {
            e.preventDefault();
            window.history.back();
        } else {
            btnBack.href = `scheda-paziente.html?petId=${petId}`;
        }
    });

    // Controllo ID: se manca, blocca tutto e logga l'errore
    if (!petId) {
        renderError("ID Paziente mancante nell'URL. Torna alla scheda paziente.");
        await logError(new Error("ID Paziente mancante nell'URL"), "Init Pagina Attività", { petId: null });
        return;
    }

    try {
        // 1. Prendo il nome del cane per l'header
        const { data: petData, error: petError } = await supabase
            .from('pets')
            .select('nome')
            .eq('id', petId)
            .single();
            
        if (petError) throw petError;
        
        if (petData) {
            petNameSub.textContent = `Passeggiate di ${petData.nome}`;
        }

        // 2. Prendo le passeggiate facendo una JOIN implicita tramite walk_participants
        const { data: participations, error: walksError } = await supabase
            .from('walk_participants')
            .select(`
                id,
                walks (
                    id,
                    titolo,
                    luogo,
                    data_passeggiata,
                    lunghezza_km,
                    livello
                )
            `)
            .eq('pet_id', petId)
            .order('created_at', { ascending: false });

        if (walksError) throw walksError;

        // 3. Controllo se ci sono risultati
        if (!participations || participations.length === 0) {
            renderEmptyState();
            return;
        }

        walksContainer.innerHTML = ''; 

        // 4. Ciclo e stampo le card
        participations.forEach(participation => {
            const walk = participation.walks;
            if (!walk) return;

            const dateObj = new Date(walk.data_passeggiata);
            const formattedDate = dateObj.toLocaleDateString('it-IT', { 
                day: 'numeric', 
                month: 'long', 
                year: 'numeric' 
            });

            const card = document.createElement('div');
            card.className = 'walk-card';
            
            card.innerHTML = `
                <div class="walk-card-header">
                    <div class="walk-date">
                        <i class="fa-regular fa-calendar-check"></i> ${formattedDate}
                    </div>
                    <div class="walk-level-badge">${walk.livello || 'Non specificato'}</div>
                </div>
                <h3 class="walk-title">${walk.titolo}</h3>
                <div class="walk-details-row">
                    <div class="walk-detail-item">
                        <i class="fa-solid fa-location-dot"></i> 
                        <span>${walk.luogo}</span>
                    </div>
                    <div class="walk-detail-item">
                        <i class="fa-solid fa-route"></i> 
                        <span>${walk.lunghezza_km ? walk.lunghezza_km.toFixed(1) + ' km' : 'N/D'}</span>
                    </div>
                </div>
            `;

            walksContainer.appendChild(card);
        });

    } catch (err) {
        console.error("Errore durante il recupero delle attività:", err);
        renderError("Si è verificato un errore di connessione col database.");
        
        // Log dell'errore nel DB!
        await logError(err, "Recupero Passeggiate Paziente", { pet_id: petId });
    }

    // --- Utility Functions ---
    function renderEmptyState() {
        walksContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">
                    <i class="fa-solid fa-leaf"></i>
                </div>
                <h4>Nessuna passeggiata</h4>
                <p>Non ci sono ancora dati registrati sulle attività e le passeggiate per questo paziente.</p>
            </div>
        `;
    }

    function renderError(message) {
        walksContainer.innerHTML = `
            <div class="empty-state" style="border: 1px solid #fecdd3; background-color: #fff1f2;">
                <div class="empty-state-icon" style="background-color: #ffe4e6; color: #e11d48;">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                </div>
                <h4 style="color: #be123c;">Errore</h4>
                <p style="color: #9f1239;">${message}</p>
            </div>
        `;
    }
});