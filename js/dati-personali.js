import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Elementi DOM
const form = document.getElementById("profileForm");
const nomeCognomeInput = document.getElementById("nomeCognome");
const emailInput = document.getElementById("email");
const dataNascitaInput = document.getElementById("dataNascita");
const documentoFile = document.getElementById("documentoFile");
const fileLabelText = document.getElementById("fileLabelText");
const docStatus = document.getElementById("docStatus");
const submitBtn = document.getElementById("submitBtn");
const formMessage = document.getElementById("formMessage");

let currentUser = null;

// Gestione visiva del file selezionato
documentoFile.addEventListener("change", (e) => {
    if (e.target.files.length > 0) {
        fileLabelText.textContent = e.target.files[0].name;
        fileLabelText.style.color = "#1E293B";
        fileLabelText.style.fontWeight = "bold";
    }
});

// ==========================================
// 1. CARICAMENTO DATI
// ==========================================
async function loadUserData() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        window.location.href = "login.html";
        return;
    }
    currentUser = user;

    try {
        emailInput.value = user.email;

        // Modifica i nomi delle colonne se nel tuo DB si chiamano diversamente!
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('nome, cognome, data_nascita, documento_url') 
            .eq('id', user.id)
            .single();

        if (error && error.code !== 'PGRST116') throw error;

        if (profile) {
            // Mostriamo Nome e Cognome bloccati
            const nome = profile.nome || "";
            const cognome = profile.cognome || "";
            nomeCognomeInput.value = `${nome} ${cognome}`.trim();

            // Mostriamo la data di nascita se esiste
            if (profile.data_nascita) {
                dataNascitaInput.value = profile.data_nascita;
            }

            // Mostriamo il badge se un documento è già stato caricato in passato
            if (profile.documento_url) {
                docStatus.classList.remove("hidden");
                fileLabelText.textContent = "Sostituisci documento esistente";
            }
        }

    } catch (error) {
        console.error("Errore recupero dati:", error);
        showMessage("Impossibile caricare i dati del profilo.", "#DC2626");
    }
}

// ==========================================
// 2. SALVATAGGIO (TESTO + FILE)
// ==========================================
form.addEventListener("submit", async (e) => {
    e.preventDefault();
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvataggio...';
    formMessage.innerHTML = "";

    try {
        let docUrl = null;
        const file = documentoFile.files[0];

        // Se l'utente ha selezionato un file, lo carichiamo nello Storage
        if (file) {
            submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Upload documento...';
            
            const fileExt = file.name.split('.').pop();
            const fileName = `doc_identita_${Date.now()}.${fileExt}`;
            const filePath = `documenti/${currentUser.id}/${fileName}`;

            // Assicurati che il bucket "storage_veterinari" (o come lo hai chiamato) esista!
            const { error: uploadError } = await supabase.storage
                .from('storage_veterinari')
                .upload(filePath, file, { upsert: true });

            if (uploadError) throw uploadError;
            docUrl = filePath;
        }

        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Aggiornamento profilo...';

        // Prepariamo i dati da aggiornare
        const updateData = {
            data_nascita: dataNascitaInput.value || null
        };
        
        // Aggiungiamo l'URL del documento solo se ne abbiamo appena caricato uno nuovo
        if (docUrl) {
            updateData.documento_url = docUrl;
        }

        const { error: updateError } = await supabase
            .from('profiles')
            .update(updateData)
            .eq('id', currentUser.id);

        if (updateError) throw updateError;

        showMessage("Dati salvati con successo!", "#059669");
        
        if (docUrl) {
            docStatus.classList.remove("hidden");
            fileLabelText.textContent = "Sostituisci documento esistente";
            documentoFile.value = ""; // Reset dell'input file
        }

    } catch (error) {
        console.error("Errore salvataggio:", error);
        showMessage("Si è verificato un errore durante il salvataggio.", "#DC2626");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Salva informazioni';
    }
});

function showMessage(text, color) {
    formMessage.textContent = text;
    formMessage.style.color = color;
    setTimeout(() => { formMessage.textContent = ""; }, 4000);
}

loadUserData();