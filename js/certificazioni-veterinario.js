import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let currentUser = null;

// Elementi DOM
const form = document.getElementById("certificationsForm");
const submitBtn = document.getElementById("submitBtn");
const formMessage = document.getElementById("formMessage");
const numOrdineInput = document.getElementById("numeroOrdine");

// Helper per gestire l'UI dell'upload
function setupFileInput(inputId, nameId, subtextId) {
    const input = document.getElementById(inputId);
    const nameDisplay = document.getElementById(nameId);
    const subtextDisplay = document.getElementById(subtextId);
    const card = input.closest('.upload-card');

    input.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (file) {
            nameDisplay.textContent = file.name;
            nameDisplay.style.color = "#059669";
            subtextDisplay.textContent = "Pronto per l'invio";
            card.classList.add("file-selected");
        } else {
            card.classList.remove("file-selected");
        }
    });
}

// Inizializza i 3 input
setupFileInput("avatarUpload", "avatarFileName", "avatarSubtext");
setupFileInput("ciUpload", "ciFileName", "ciSubtext");
setupFileInput("tesseraUpload", "tesseraFileName", "tesseraSubtext");

// Funzione Helper per caricare un singolo file su Supabase Storage
async function uploadFileToStorage(file, bucketName, folderPath) {
    if (!file) return null;
    
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `${folderPath}/${fileName}`;

    const { error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(filePath, file);

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
        .from(bucketName)
        .getPublicUrl(filePath);

    return publicUrl;
}

// Inizializzazione pagina
async function initPage() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        window.location.href = "../../index.html";
        return;
    }
    currentUser = user;

    // Recupera il numero di iscrizione attuale se esiste
    const { data: vetData } = await supabase
        .from('veterinarians')
        .select('numero_ordine')
        .eq('user_id', currentUser.id)
        .maybeSingle();

    if (vetData && vetData.numero_ordine) {
        numOrdineInput.value = vetData.numero_ordine;
    }
}

// Salvataggio form
form.addEventListener("submit", async (e) => {
    e.preventDefault();
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvataggio in corso...';
    formMessage.textContent = "";

   try {
        const avatarFile = document.getElementById("avatarUpload").files[0];
        const ciFile = document.getElementById("ciUpload").files[0];
        const tesseraFile = document.getElementById("tesseraUpload").files[0];

        // 1. Upload Avatar (nella tabella profiles)
        // Usa il TUO bucket 'storage_veterinari' e crea la cartella 'avatar_vet'
        if (avatarFile) {
            const avatarUrl = await uploadFileToStorage(avatarFile, 'storage_veterinari', 'avatar_vet');
            await supabase.from('profiles').update({ avatar_url: avatarUrl }).eq('id', currentUser.id);
        }

        // 2. Upload Documenti (nella tabella veterinarians)
        let updatesForVet = {
            numero_ordine: numOrdineInput.value.trim()
        };

        // Usa il TUO bucket 'storage_veterinari' e crea la cartella 'certificazioni'
        if (ciFile) {
            updatesForVet.documento_identita_url = await uploadFileToStorage(ciFile, 'storage_veterinari', 'certificazioni');
        }
        
        if (tesseraFile) {
            updatesForVet.tessera_ordine_url = await uploadFileToStorage(tesseraFile, 'storage_veterinari', 'certificazioni');
        }

        // 3. Esegue l'update sul database
        const { error: updateError } = await supabase
            .from('veterinarians')
            .update(updatesForVet)
            .eq('user_id', currentUser.id);

        if (updateError) throw updateError;

        formMessage.textContent = "Documenti salvati con successo!";
        formMessage.style.color = "#059669";
        
        setTimeout(() => { window.location.href = "profilo-veterinario.html"; }, 1500);

    } catch (error) {
        console.error("Errore di salvataggio:", error);
        formMessage.textContent = "Errore durante l'invio dei documenti.";
        formMessage.style.color = "#DC2626";
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Salva Documenti';
    }
});

initPage();