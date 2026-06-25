import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const activeProfilesCount = document.getElementById("activeProfilesCount");
const petsCarousel = document.getElementById("petsCarousel");
const carouselDots = document.getElementById("carouselDots");

async function loadAnimaliData() {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            window.location.href = "login.html";
            return;
        }

        const { data: pets, error } = await supabase
            .from('pets')
            .select('*')
            .eq('owner_id', user.id)
            .order('id', { ascending: true });

        if (error) throw error;

        if (pets && pets.length > 0) {
            activeProfilesCount.textContent = pets.length === 1 ? "1 profilo attivo" : `${pets.length} profili attivi`;
            
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

                        <div class="menu-action-card btn-cartella">
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
                btn.addEventListener('click', () => alert("Cartella clinica in fase di sviluppo!"));
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
        activeProfilesCount.textContent = "Errore di caricamento";
    }
}

loadAnimaliData();