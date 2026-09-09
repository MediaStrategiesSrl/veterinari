import { supabase } from '../utils/supabaseClient.js';
import { logError } from '../utils/logger.js';

let currentUser = null;
let currentPetId = null;

const listaAmiciCompleta = document.getElementById("listaAmiciCompleta");
const nomePetCorrente = document.getElementById("nomePetCorrente");

async function init() {
    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) throw Object.assign(new Error(authError.message), { code: authError.code || 'AUTH_SYS_ERROR' });
        if (!user) { window.location.href = "../../index.html"; return; }
        currentUser = user;

        currentPetId = localStorage.getItem("activePetId");
        if (!currentPetId) {
            listaAmiciCompleta.innerHTML = `<p style="text-align:center; color:#888;">Nessun animale selezionato.</p>`;
            return;
        }

        const { data: pet, error: petError } = await supabase
            .from('pets')
            .select('nome')
            .eq('id', currentPetId)
            .single();
        if (petError) throw Object.assign(new Error(petError.message), { code: petError.code || 'DB_FETCH_PET_ERROR' });
        if (pet) nomePetCorrente.textContent = pet.nome;

        await loadTuttiAmici();

    } catch (error) {
        console.error("Errore critico in init amici:", error);
        await logError({
            source: 'amici_lista',
            action: 'init_page',
            errorMessage: error.message || "Errore durante l'inizializzazione della pagina amici",
            errorCode: error.code || 'UNKNOWN_SYS_ERROR',
            context: {}
        });
    }
}

async function loadTuttiAmici() {
    try {
        const { data: friendships, error } = await supabase
            .from('pet_friendships')
            .select(`
                passeggiate_insieme,
                pet1:pets!pet1_id(id, nome, avatar_url),
                pet2:pets!pet2_id(id, nome, avatar_url)
            `)
            .or(`pet1_id.eq.${currentPetId},pet2_id.eq.${currentPetId}`)
            .eq('status', 'accepted')
            .order('passeggiate_insieme', { ascending: false });

        if (error) throw Object.assign(new Error(error.message), { code: error.code || 'DB_FETCH_FRIENDS_ERROR' });

        if (!friendships || friendships.length === 0) {
            listaAmiciCompleta.innerHTML = `<p style="text-align:center; color:#888;">Nessun amico registrato.</p>`;
            return;
        }

        listaAmiciCompleta.innerHTML = "";
        friendships.forEach(f => {
            const amico = f.pet1.id === currentPetId ? f.pet2 : f.pet1;
            const foto = amico.avatar_url ? supabase.storage.from('storage_veterinari').getPublicUrl(amico.avatar_url).data.publicUrl : '../../img/default-dog.jpg';

            listaAmiciCompleta.innerHTML += `
                <div class="friend-list-item">
                    <img src="${foto}" alt="${amico.nome}">
                    <div class="friend-list-info">
                        <h4>${amico.nome}</h4>
                        <p>${f.passeggiate_insieme} passeggiat${f.passeggiate_insieme > 1 ? 'e' : 'a'} insieme</p>
                    </div>
                </div>
            `;
        });

    } catch (error) {
        console.error("Errore caricamento amici completo:", error);
        listaAmiciCompleta.innerHTML = `<p style="color:#DC2626; text-align:center;">Errore durante il caricamento degli amici.</p>`;
        await logError({
            source: 'amici_lista',
            action: 'load_tutti_amici',
            errorMessage: error.message || "Impossibile recuperare la lista completa amici dal DB",
            errorCode: error.code || 'UNKNOWN_DB_ERROR',
            context: { currentPetId }
        });
    }
}

init();