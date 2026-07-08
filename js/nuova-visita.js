import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let currentUser = null;
let nomeVeterinario = "Dott. Sconosciuto";

// Variabile globale per tenere in memoria i dati completi dei pazienti (incluso il proprietario)
let pazientiMemoria = []; 

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
        window.location.href = "../../index.html";
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

    // ==========================================
    // NUOVO: GESTIONE URL E SICUREZZA (GUARD)
    // ==========================================
    const urlParams = new URLSearchParams(window.location.search);
    const urlPetId = urlParams.get('petId');

    // Facciamo il controllo di sicurezza SOLO se si arriva tramite un link specifico di un animale
    if (urlPetId) {
        const { data: accessData, error: accessError } = await supabase
            .from('veterinarian_patients')
            .select('status')
            .eq('pet_id', urlPetId)
            .eq('veterinarian_id', currentUser.id)
            .single();

        // Se l'animale è stato revocato, blocco e redirect
        if (accessError || !accessData || accessData.status !== 'active') {
            alert("Accesso negato: non sei autorizzato a inserire visite per questo paziente (Accesso revocato).");
            window.location.href = "/pages/veterinario/pazienti.html";
            return;
        }
    }

    // 3. Scarica i pazienti per la select (solo quelli attivi!)
    await caricaPazienti(urlPetId);
}

async function caricaPazienti(preselectedPetId) {
    try {
        // AGGIUNTO 'owner_id' NELLA SELECT PER IL CONTROLLO CASSA!
        const { data, error } = await supabase
            .from('veterinarian_patients')
            .select(`pet_id, pets ( nome, owner_id )`) 
            .eq('veterinarian_id', currentUser.id)
            .eq('status', 'active'); 

        if (error) throw error;

        if (!data || data.length === 0) {
            petSelect.innerHTML = `<option value="" disabled selected>Nessun paziente in archivio.</option>`;
            return;
        }

        // Salviamo in memoria così dopo possiamo controllare facilmente
        pazientiMemoria = data;

        petSelect.innerHTML = `<option value="" disabled ${!preselectedPetId ? 'selected' : ''}>Seleziona il paziente...</option>`;

        data.forEach(item => {
            if (item.pets) {
                const opt = document.createElement("option");
                opt.value = item.pet_id;
                opt.textContent = item.pets.nome;
                
                if (item.pet_id === preselectedPetId) {
                    opt.selected = true;
                    headerSubtitle.textContent = `${item.pets.nome} · ${nomeVeterinario}`;
                }

                petSelect.appendChild(opt);
            }
        });

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
if(documentUpload) {
    documentUpload.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (file) {
            fileNameDisplay.textContent = file.name;
            fileNameDisplay.style.color = "#059669"; 
            fileSubtext.textContent = "File pronto per l'invio";
        } else {
            fileNameDisplay.textContent = "Allega documenti";
            fileNameDisplay.style.color = "#1E293B";
            fileSubtext.textContent = "Referti, esami, immagini (Max 5MB)";
        }
    });
}


// ==========================================
// SALVATAGGIO CARTELLA CLINICA + LOGICA CASSA
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
        
        // Protezione se documentUpload non esiste in alcune view
        const file = documentUpload ? documentUpload.files[0] : null;

        // 1. SE C'È UN FILE, FAI L'UPLOAD
        if (file) {
            submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Caricamento file...';
            
            const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
            const fileName = `${petId}_${safeName}`;
            const filePath = `referti/${fileName}`; 

            const { data: existingFiles } = await supabase.storage
                .from('storage_veterinari')
                .list('referti', { search: fileName });

            const isDuplicate = existingFiles && existingFiles.some(f => f.name === fileName);

            if (isDuplicate) {
                const { data: { publicUrl } } = supabase.storage
                    .from('storage_veterinari')
                    .getPublicUrl(filePath);
                attachmentUrl = publicUrl;
            } else {
                const { error: uploadError } = await supabase.storage
                    .from('storage_veterinari')
                    .upload(filePath, file);

                if (uploadError) throw uploadError;

                const { data: { publicUrl } } = supabase.storage
                    .from('storage_veterinari')
                    .getPublicUrl(filePath);

                attachmentUrl = publicUrl;
            }
        }

        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvataggio referto...';

        // 2. SALVA LA VISITA NEL DATABASE
        const { data: newRecord, error: insertError } = await supabase
            .from('medical_records')
            .insert({
                pet_id: petId,
                vet_id: currentUser.id, // Tu, veterinario
                motivo: document.getElementById("motivo") ? document.getElementById("motivo").value : "",
                anamnesi: document.getElementById("anamnesi") ? document.getElementById("anamnesi").value : "",
                diagnosi: document.getElementById("diagnosi") ? document.getElementById("diagnosi").value : "",
                terapia: document.getElementById("terapia") ? document.getElementById("terapia").value : "",
                attachment_url: attachmentUrl
            })
            .select() // Importante: ci facciamo restituire l'ID della visita appena creata
            .single();

        if (insertError) throw insertError;

        formMessage.textContent = "Referto salvato!";
        formMessage.style.color = "#059669";

        // ==========================================
        // 3. LOGICA DI INDIRIZZAMENTO (IL MISTERO È RISOLTO!)
        // ==========================================
        
        // Troviamo a chi appartiene il cane appena visitato
        const infoAnimaleVisato = pazientiMemoria.find(p => p.pet_id === petId);
        
        setTimeout(() => {
            if (infoAnimaleVisato && infoAnimaleVisato.pets.owner_id === currentUser.id) {
                // EDGE CASE: Il cane è del veterinario stesso! 
                // Niente cassa, torniamo alla dashboard.
                alert("Visita personale registrata con successo (Costo 0€).");
                window.location.href = "dashboard-veterinario.html";
            } else {
                // FLUSSO NORMALE: Il cane è di un cliente.
                // Lo mandiamo in cassa e gli passiamo via URL l'ID della visita (recordId) per generare la fattura!
                window.location.href = `cassa.html?recordId=${newRecord.id}&petId=${petId}`;
            }
        }, 1500);

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