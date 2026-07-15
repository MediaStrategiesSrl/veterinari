// 1. IMPORT CENTRALIZZATI
// ==========================================
// Assicurati che i percorsi puntino alla cartella corretta (es. ../utils/)
import { supabase } from '../utils/supabaseClient.js';
import { logError } from '../utils/logger.js';


const activeProfilesCount = document.getElementById("activeProfilesCount");
const petsCarousel = document.getElementById("petsCarousel");
const carouselDots = document.getElementById("carouselDots");
const btnPrevProfile = document.getElementById("btnPrevProfile");
const btnNextProfile = document.getElementById("btnNextProfile");

async function loadAnimaliData() {
    // Inizializziamo l'ID utente fuori dal try per poterlo passare al logger in caso di errore
    let currentUserId = null; 

    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        // Se c'è un errore di autenticazione, lo lanciamo con un codice specifico
        if (authError) throw Object.assign(new Error(authError.message), { code: 'AUTH_FETCH_ERROR' });

        if (!user) {
            window.location.href = "../../index.html";
            return;
        }
        
        currentUserId = user.id;

        const { data: pets, error } = await supabase
            .from('pets')
            .select('*')
            .eq('owner_id', user.id)
            .order('id', { ascending: true });

        // Assegniamo il codice di errore originale di Supabase se presente
        if (error) throw Object.assign(new Error(error.message), { code: error.code || 'DB_FETCH_PETS_ERROR' });

        if (pets && pets.length > 0) {
            activeProfilesCount.textContent = pets.length === 1 ? "1 profilo attivo" : `${pets.length} profili attivi`;
            
            // --- GESTIONE VISIBILITÀ FRECCE ---
            if (pets.length > 1) {
                if (btnPrevProfile) btnPrevProfile.classList.remove("hidden");
                if (btnNextProfile) btnNextProfile.classList.remove("hidden");
            } else {
                if (btnPrevProfile) btnPrevProfile.classList.add("hidden");
                if (btnNextProfile) btnNextProfile.classList.add("hidden");
            }
            
            petsCarousel.innerHTML = "";
            carouselDots.innerHTML = "";

            pets.forEach((pet, index) => {
                const razzaText = pet.razza ? ` · ${pet.razza}` : '';
                const petDesc = `${pet.specie}${razzaText}`;
                
                let avatarSrc = 'assets/default-pet.png';
                if (pet.avatar_url) {
                    const { data } = supabase.storage.from('storage_veterinari').getPublicUrl(pet.avatar_url);
                    avatarSrc = data.publicUrl;
                }

                // Crea la slide
                const slide = document.createElement("div");
                slide.className = "pet-slide";
                slide.innerHTML = `
                    <div class="simple-profile-header" style="padding-top: 0; margin-bottom: 1.5rem;">
                        <div class="simple-avatar-box">
                            <img src="${avatarSrc}" alt="Avatar" onerror="this.onerror=null; this.src='https://via.placeholder.com/150/E2E8F0/E2E8F0';">
                        </div>
                        <div class="pet-titles">
                            <h1>${pet.nome}</h1>
                            <p>${petDesc}</p>
                        </div>
                    </div>

                    <div style="padding: 0;">
                        <div class="menu-action-card btn-profilo" data-id="${pet.id}">
                            <div class="info-icon icon-orange"><i class="fa-solid fa-circle"></i></div>
                            <div class="menu-action-text">
                                <div class="menu-action-title">Profilo completo</div>
                                <div class="menu-action-desc">Anagrafica, passaporto, dettagli</div>
                            </div>
                            <i class="fa-solid fa-chevron-right chevron-icon"></i>
                        </div>

                       <div class="menu-action-card btn-cartella" data-id="${pet.id}">
                            <div class="info-icon icon-blue"><i class="fa-solid fa-plus"></i></div>
                            <div class="menu-action-text">
                                <div class="menu-action-title">Cartella sanitaria</div>
                                <div class="menu-action-desc">Visite, farmaci, interventi e referti</div>
                            </div>
                            <i class="fa-solid fa-chevron-right chevron-icon"></i>
                        </div>

                        <div class="menu-action-card btn-qr" data-id="${pet.id}">
                            <div class="info-icon icon-orange"><i class="fa-solid fa-qrcode"></i></div>
                            <div class="menu-action-text">
                                <div class="menu-action-title">QR Code personale</div>
                                <div class="menu-action-desc">Accesso veterinario con conferma</div>
                            </div>
                            <i class="fa-solid fa-chevron-right chevron-icon"></i>
                        </div>
                    </div>
                `;
                petsCarousel.appendChild(slide);

                // Crea il pallino cliccabile
                const dot = document.createElement("div");
                dot.className = `dot ${index === 0 ? 'active' : ''}`;
                
                // --- NUOVA FUNZIONE: Clicca sul pallino per scorrere ---
                dot.addEventListener("click", () => {
                    const slideWidth = petsCarousel.offsetWidth;
                    petsCarousel.scrollTo({
                        left: index * slideWidth,
                        behavior: 'smooth'
                    });
                });
                
                carouselDots.appendChild(dot);
            });

            // GESTIONE SCROLL: Cambia colore ai pallini quando scorri col dito
            petsCarousel.addEventListener('scroll', () => {
                const scrollLeft = petsCarousel.scrollLeft;
                const slideWidth = petsCarousel.offsetWidth;
                // Calcola su quale slide ci troviamo in base allo scorrimento
                const currentIndex = Math.round(scrollLeft / slideWidth);
                
                const dots = carouselDots.querySelectorAll('.dot');
                dots.forEach((dot, idx) => {
                    dot.classList.toggle('active', idx === currentIndex);
                });
            });

            // COLLEGAMENTO BOTTONI ALLE PAGINE
            document.querySelectorAll('.btn-profilo').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    window.location.href = `profilo-animale.html?petId=${e.currentTarget.getAttribute('data-id')}`;
                });
            });

            document.querySelectorAll('.btn-cartella').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const idAnimale = e.currentTarget.getAttribute('data-id');
                    
                    if (!idAnimale || idAnimale === "null") {
                        alert("Errore: ID animale non trovato sul bottone!");
                        return;
                    }
                    window.location.href = `/storia-clinica.html?petId=${idAnimale}`;
                });
            });

            document.querySelectorAll('.btn-qr').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    window.location.href = `qr-pets.html?petId=${e.currentTarget.getAttribute('data-id')}`;
                });
            });

        } else {
            activeProfilesCount.textContent = "0 profili attivi";
            petsCarousel.innerHTML = `
                <div class="pet-slide">
                    <div class="simple-profile-header">
                        <div class="simple-avatar-box">
                            <img src="assets/default-pet.png" alt="Nessun animale">
                        </div>
                        <div class="pet-titles">
                            <h1>Nessun animale</h1>
                            <p>Aggiungi un cucciolo dalla Dashboard</p>
                        </div>
                    </div>
                </div>
            `;
        }

    } catch (err) {
        console.error("ERRORE COMPLETO:", err);
        
        // 2. LOGGA L'ERRORE NEL DATABASE TRAMITE LA TUA FUNZIONE
        await logError({
            source: 'frontend_pets_carousel',
            action: 'load_animali_data',
            errorMessage: err.message,
            errorCode: err.code || 'UNKNOWN_FETCH_ERROR',
            stackTrace: err.stack,
            context: {
                user_id: currentUserId || 'Non autenticato'
            }
        });

        // 3. AGGIORNA LA UI PER MOSTRARE L'ERRORE ALL'UTENTE IN MODO ELEGANTE
        activeProfilesCount.textContent = "Errore di caricamento";
        petsCarousel.innerHTML = `
            <div class="pet-slide" style="display: flex; align-items: center; justify-content: center; height: 100%; border: 1px dashed #ef4444; border-radius: 16px; background-color: #fef2f2;">
                <div style="text-align: center; padding: 20px; color: #b91c1c;">
                    <i class="fa-solid fa-triangle-exclamation" style="font-size: 24px; margin-bottom: 10px;"></i>
                    <p style="margin: 0; font-weight: 500;">Ops! Non siamo riusciti a caricare i tuoi profili.</p>
                    <p style="margin: 5px 0 0 0; font-size: 14px; color: #ef4444;">Il team tecnico è stato avvisato in automatico.</p>
                </div>
            </div>
        `;
        // Nascondiamo le frecce se c'è un errore
        if (btnPrevProfile) btnPrevProfile.classList.add("hidden");
        if (btnNextProfile) btnNextProfile.classList.add("hidden");
    }
}

// ==========================================
// FUNZIONI DI SCORRIMENTO CON FRECCE
// ==========================================
function scrollPetsCarousel(direction) {
    if (!petsCarousel) return;
    
    const slideWidth = petsCarousel.offsetWidth;
    const currentScroll = petsCarousel.scrollLeft;
    
    // Calcola la nuova posizione arrotondando alla slide più vicina
    let newScroll = direction === 'next' 
        ? currentScroll + slideWidth 
        : currentScroll - slideWidth;
        
    petsCarousel.scrollTo({
        left: newScroll,
        behavior: 'smooth'
    });
}

if (btnPrevProfile) {
    btnPrevProfile.addEventListener("click", () => scrollPetsCarousel('prev'));
}

if (btnNextProfile) {
    btnNextProfile.addEventListener("click", () => scrollPetsCarousel('next'));
}

loadAnimaliData();