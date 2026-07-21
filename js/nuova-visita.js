// ==========================================
// 1. IMPORT CENTRALIZZATI
// ==========================================
// Assicurati che i percorsi puntino alla cartella corretta (es. ../utils/)
import { supabase } from '../utils/supabaseClient.js';
import { logError } from '../utils/logger.js';

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
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError) {
        await logError({
            source: 'nuova_visita',
            action: 'auth_check',
            errorMessage: authError.message,
            errorCode: authError.code || 'AUTH_SYS_ERROR',
            context: {}
        });
    }

    if (!user) {
        window.location.href = "../../index.html";
        return;
    }
    currentUser = user;

    // 2. Recupera Nome del Veterinario
    try {
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('nome')
            .eq('id', currentUser.id)
            .single();
        
        if (profileError && profileError.code !== 'PGRST116') throw profileError; 

        if (profile && profile.nome) {
            nomeVeterinario = profile.nome;
        }
    } catch (err) {
        console.warn("Impossibile recuperare il profilo vet, uso default.");
    }
    headerSubtitle.textContent = `Seleziona paziente · ${nomeVeterinario}`;

    // ==========================================
    // GESTIONE URL E SICUREZZA (GUARD)
    // ==========================================
    const urlParams = new URLSearchParams(window.location.search);
    const urlPetId = urlParams.get('petId');

    if (urlPetId) {
        const { data: accessData, error: accessError } = await supabase
            .from('veterinarian_patients')
            .select('status')
            .eq('pet_id', urlPetId)
            .eq('veterinarian_id', currentUser.id)
            .single();

        if (accessError) {
            await logError({
                source: 'nuova_visita',
                action: 'security_guard_check',
                errorMessage: accessError.message,
                errorCode: accessError.code || 'DB_GUARD_ERROR',
                context: { petId: urlPetId }
            });
            alert("Errore di sistema nella verifica delle autorizzazioni. Riprova più tardi.");
            window.location.href = "/pages/veterinario/pazienti.html";
            return;
        }

        if (!accessData || accessData.status !== 'active') {
            alert("Accesso negato: non sei autorizzato a inserire visite per questo paziente (Accesso revocato).");
            window.location.href = "/pages/veterinario/pazienti.html";
            return;
        }
    }

    // 3. Scarica i pazienti per la select
    await caricaPazienti(urlPetId);
}

async function caricaPazienti(preselectedPetId) {
    try {
        const { data, error } = await supabase
            .from('veterinarian_patients')
            .select(`pet_id, pets ( nome, owner_id )`) 
            .eq('veterinarian_id', currentUser.id)
            .eq('status', 'active'); 

        if (error) throw Object.assign(new Error(error.message), { code: error.code || 'DB_FETCH_PATIENTS_ERROR' });

        if (!data || data.length === 0) {
            petSelect.innerHTML = `<option value="" disabled selected>Nessun paziente in archivio.</option>`;
            return;
        }

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
        
        await logError({
            source: 'nuova_visita',
            action: 'carica_pazienti',
            errorMessage: error.message || "Impossibile popolare la select dei pazienti",
            errorCode: error.code || 'UNKNOWN_DB_ERROR',
            context: {}
        });

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
        const file = documentUpload ? documentUpload.files[0] : null;

        // 1. SE C'È UN FILE, FAI L'UPLOAD (Nelle sottocartelle per Paziente)
        if (file) {
            submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Caricamento file...';
            
            const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
            // Aggiungiamo il timestamp per evitare che file con lo stesso nome vengano sovrascritti
            const fileName = `${Date.now()}_${safeName}`;
            
            // LA TUA RICHIESTA: La cartella è 'referti / id_paziente'
            const folderPath = `referti/${petId}`;
            const filePath = `${folderPath}/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('storage_veterinari')
                .upload(filePath, file, { upsert: true });

            if (uploadError) throw Object.assign(new Error(uploadError.message), { code: uploadError.code || 'STORAGE_UPLOAD_ERROR' });

            const { data: { publicUrl } } = supabase.storage
                .from('storage_veterinari')
                .getPublicUrl(filePath);

            attachmentUrl = publicUrl;
        }

        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvataggio referto...';

        // 2. SALVA LA VISITA NEL DATABASE
        const { data: newRecord, error: insertError } = await supabase
            .from('medical_records')
            .insert({
                pet_id: petId,
                vet_id: currentUser.id,
                motivo: document.getElementById("motivo") ? document.getElementById("motivo").value : "",
                anamnesi: document.getElementById("anamnesi") ? document.getElementById("anamnesi").value : "",
                diagnosi: document.getElementById("diagnosi") ? document.getElementById("diagnosi").value : "",
                terapia: document.getElementById("terapia") ? document.getElementById("terapia").value : "",
                attachment_url: attachmentUrl // Salviamo il Public URL diretto (o il path relativo a seconda della tua logica di lettura)
            })
            .select() 
            .single();

        if (insertError) throw Object.assign(new Error(insertError.message), { code: insertError.code || 'DB_INSERT_RECORD_ERROR' });

        formMessage.textContent = "Referto salvato!";
        formMessage.style.color = "#059669";

        // ==========================================
        // 3. LOGICA DI INDIRIZZAMENTO 
        // ==========================================
        const infoAnimaleVisato = pazientiMemoria.find(p => p.pet_id === petId);
        
        setTimeout(() => {
            if (infoAnimaleVisato && infoAnimaleVisato.pets.owner_id === currentUser.id) {
                // EDGE CASE: Il cane è del veterinario stesso! 
                alert("Visita personale registrata con successo (Costo 0€).");
                window.location.href = "dashboard-veterinario.html";
            } else {
                // FLUSSO NORMALE: Cassa.
                window.location.href = `cassa.html?recordId=${newRecord.id}&petId=${petId}`;
            }
        }, 1500);

    } catch (error) {
        console.error("Errore salvataggio:", error);
        
        await logError({
            source: 'nuova_visita',
            action: 'salvataggio_cartella',
            errorMessage: error.message || "Errore durante upload file o insert nel DB",
            errorCode: error.code || 'UNKNOWN_SYS_ERROR',
            context: { petId: petId }
        });

        formMessage.textContent = "Errore durante il salvataggio: " + (error.message || "Errore di sistema");
        formMessage.style.color = "#DC2626";
        
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Firma e salva nella cartella';
    }
});

// Avvia tutto!
initPage();