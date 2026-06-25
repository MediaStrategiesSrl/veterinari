import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const addPetForm = document.getElementById('addPetForm');
const petAvatarInput = document.getElementById('petAvatar');
const avatarPreview = document.getElementById('avatarPreview');
const statusMessage = document.getElementById('statusMessage');

let selectedFile = null;

// Gestione preview immagine
document.getElementById('avatarUploadArea').addEventListener('click', () => petAvatarInput.click());

petAvatarInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        selectedFile = file;
        const reader = new FileReader();
        reader.onload = (e) => avatarPreview.innerHTML = `<img src="${e.target.result}">`;
        reader.readAsDataURL(file);
    }
});

// Invio dati
addPetForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Mostra caricamento sul bottone (UX)
    const submitBtn = document.getElementById('submitBtn');
    const originalBtnText = submitBtn.innerHTML;
    submitBtn.innerHTML = 'Salvataggio...';
    submitBtn.disabled = true;

    try{
    const { data: { user } } = await supabase.auth.getUser();
    
    let avatarPath = null;
    
    // 1. Carica immagine su Storage
   if (selectedFile) {
            const fileName = `${user.id}/${Date.now()}.${selectedFile.name.split('.').pop()}`;
            const { data, error: uploadError } = await supabase.storage
                .from('storage_veterinari')
                .upload(`pets_avatar/${fileName}`, selectedFile);
            
            if (uploadError) {
                console.error("Errore Storage:", uploadError);
                throw new Error("Errore nel caricamento della foto: " + uploadError.message);
            }
            avatarPath = data.path;
        }

        // --- IL TRUCCO È QUI ---
        // Generiamo un hash univoco finto/temporaneo per il QR Code, 
        // dato che il tuo database lo richiede come NOT NULL e UNIQUE.
        const hashGenerato = "QR-" + Date.now() + "-" + Math.random().toString(36).substring(2, 9);

        // 2. Salva nel DB
        const { error: dbError } = await supabase.from('pets').insert({
            owner_id: user.id,
            nome: document.getElementById('petName').value,
            specie: document.getElementById('petSpecies').value,
            razza: document.getElementById('petBreed').value,
            avatar_url: avatarPath,      // Assicurati che questa colonna esista nel DB!
            qr_code_hash: hashGenerato   // <--- DATO OBBLIGATORIO MANCANTE AGGIUNTO!
        });

        if (dbError) {
            console.error("Errore Database:", dbError);
            throw new Error(dbError.message); // Passa l'errore vero al catch
        } 
        
        // Se tutto va bene, torna alla dashboard
        window.location.href = "dashboard-proprietario.html";

    } catch (err) {
        // Ora se c'è un errore te lo stampa in faccia, non puoi sbagliarti
        console.error("ERRORE COMPLETO:", err);
        statusMessage.textContent = "Errore: " + err.message;
        statusMessage.className = "status-message error visible";
        
        // Ripristina il bottone
        submitBtn.innerHTML = originalBtnText;
        submitBtn.disabled = false;
    }
});