import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let currentUser = null;
let nomeVeterinario = "Dott. Sconosciuto";

// Elementi DOM
const headerSubtitle = document.getElementById("headerSubtitle");
const petSelect = document.getElementById("petSelect");
const form = document.getElementById("medicalRecordForm");
const submitBtn = document.getElementById("submitBtn");
const formMessage = document.getElementById("formMessage");
const documentUpload = document.getElementById("documentUpload");
const fileNameDisplay = document.getElementById("fileNameDisplay");
const fileSubtext = document.getElementById("fileSubtext");

async function initPage() {
    // 1. Controllo Autenticazione
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        window.location.href = "index.html";
        return;
    }
    currentUser = user;

    // 2. Recupera Nome del Veterinario
    try {
        const { data: profile } = await supabase
            .from('profiles')
            .select('nome')
            .eq('id', currentUser.id)
            .single();
        
        if (profile && profile.nome) {
            nomeVeterinario = profile.nome;
        }
    } catch (err) {
        console.warn("Profilo vet non trovato, uso default.");
    }
    headerSubtitle.textContent = `Seleziona paziente · ${nomeVeterinario}`;

    // 3. Scarica i pazienti per la select
    await caricaPazienti();
}

async function caricaPazienti() {
    try {
        const { data, error } = await supabase
            .from('vet_patients')
            .select(`pet_id, pets ( nome )`)
            .eq('vet_id', currentUser.id);

        if (error) throw error;

        if (!data || data.length === 0) {
            petSelect.innerHTML = `<option value="" disabled selected>Nessun paziente in archivio.</option>`;
            return;
        }

        data.forEach(item => {
            if (item.pets) {
                const opt = document.createElement("option");
                opt.value = item.pet_id;
                opt.textContent = item.pets.nome;
                petSelect.appendChild(opt);
            }
        });

        // Aggiorna il sottotitolo dinamicamente quando il vet sceglie il cane
        petSelect.addEventListener("change", (e) => {
            const nomeCane = e.target.options[e.target.selectedIndex].text;
            headerSubtitle.textContent = `${nomeCane} · ${nomeVeterinario}`;
        });

    } catch (error) {
        console.error("Errore caricamento pazienti:", error);
        petSelect.innerHTML = `<option value="" disabled selected>Errore di caricamento</option>`;
    }
}

// Gestione Grafica: Mostra il nome del file selezionato
documentUpload.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) {
        fileNameDisplay.textContent = file.name;
        fileNameDisplay.style.color = "#059669"; // Verde per conferma
        fileSubtext.textContent = "File pronto per l'invio";
    } else {
        fileNameDisplay.textContent = "Allega documenti";
        fileNameDisplay.style.color = "#1E293B";
        fileSubtext.textContent = "Referti, esami, immagini (Max 5MB)";
    }
});

// ==========================================
// SALVATAGGIO CARTELLA CLINICA + UPLOAD FILE
// ==========================================
form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const petId = petSelect.value;
    if (!petId) {
        formMessage.textContent = "Seleziona un paziente prima di salvare.";
        formMessage.style.color = "#DC2626";
        return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Elaborazione in corso...';
    formMessage.innerHTML = "";

    try {
        let attachmentUrl = null;
        const file = documentUpload.files[0];

        // 1. SE C'È UN FILE, FAI L'UPLOAD NELLO STORAGE PRIMA
        if (file) {
            submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Caricamento file...';
            
            // Crea un nome unico per il file per evitare sovrascritture
            const fileExt = file.name.split('.').pop();
            const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
            
            // Inserisce il file esattamente nella tua cartella 'referti'
            const filePath = `referti/${fileName}`; 

            // Upload nel TUO bucket 'storage_veterinari'
            const { error: uploadError } = await supabase.storage
                .from('storage_veterinari')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            // Recupera il link pubblico del file appena caricato
            const { data: { publicUrl } } = supabase.storage
                .from('storage_veterinari')
                .getPublicUrl(filePath);

            attachmentUrl = publicUrl;
        }

        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvataggio referto...';

        // 2. SALVA TUTTO NEL DATABASE
        const { error: insertError } = await supabase
            .from('medical_records')
            .insert({
                pet_id: petId,
                vet_id: currentUser.id,
                motivo: document.getElementById("motivo").value,
                anamnesi: document.getElementById("anamnesi").value,
                diagnosi: document.getElementById("diagnosi").value,
                terapia: document.getElementById("terapia").value,
                attachment_url: attachmentUrl // <-- Salva il link del file! (Sarà NULL se non ha allegato nulla)
            });

        if (insertError) throw insertError;

        formMessage.textContent = "Referto e allegati salvati con successo!";
        formMessage.style.color = "#059669";

        // Torna alla dashboard dopo 2 secondi
        setTimeout(() => {
            window.location.href = "dashboard-veterinario.html";
        }, 2000);

    } catch (error) {
        console.error("Errore salvataggio:", error);
        formMessage.textContent = "Errore durante il salvataggio: " + (error.message || "Errore sconosciuto");
        formMessage.style.color = "#DC2626";
        
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Firma e salva nella cartella';
    }
});

// Avvia tutto!
initPage();