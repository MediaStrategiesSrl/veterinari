// ==========================================
// 1. IMPORT CENTRALIZZATI E SETUP
// ==========================================
// Assicurati che i percorsi (es. ../utils/) puntino alla cartella corretta
import { supabase } from '../utils/supabaseClient.js';
import { logError } from '../utils/logger.js';

// ==========================================
// VARIABILI GLOBALI
// ==========================================
let currentUser = null;
let petId = null;

// Elementi DOM
const headerPetName = document.getElementById("headerPetName");
const petAvatar = document.getElementById("petAvatar");
const petNameAge = document.getElementById("petNameAge");
const petMicrochipText = document.getElementById("petMicrochipText");
const btnNuovaVisita = document.getElementById("btnNuovaVisita");
const storiaClinicaStats = document.getElementById("storiaClinicaStats");
const btnStoriaClinica = document.getElementById("btnStoriaClinica");

// Elementi DOM per Upload
const uploadRefertoInput = document.getElementById("uploadReferto");
const refertoTitle = document.getElementById("refertoTitle");
const refertoSub = document.getElementById("refertoSub");

// Elemento DOM per Revoca
const btnRevocaAccesso = document.getElementById("btnRevocaAccesso");

// ==========================================
// 2. INIZIALIZZAZIONE E CONTROLLO ACCESSI
// ==========================================
async function initPage() {
    try {
        // Controllo Login
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) throw Object.assign(new Error(authError.message), { code: authError.code || 'AUTH_SYS_ERROR' });
        
        if (!user) {
            window.location.href = "index.html";
            return;
        }
        currentUser = user; 

        // Legge il petId dall'URL
        const urlParams = new URLSearchParams(window.location.search);
        petId = urlParams.get('petId'); 

        if (!petId) {
            alert("Nessun paziente selezionato!");
            window.location.href = "/pages/veterinario/pazienti.html";
            return;
        }

        // ==========================================
        // CONTROLLO DI SICUREZZA (GUARD)
        // ==========================================
        const { data: accessData, error: accessError } = await supabase
            .from('veterinarian_patients')
            .select('status')
            .eq('pet_id', petId)
            .eq('veterinarian_id', currentUser.id)
            .single();

        if (accessError) throw Object.assign(new Error(accessError.message), { code: accessError.code || 'DB_GUARD_CHECK_ERROR' });

        // ERRORE LOGICO: Lo status NON è "active", blocca tutto! (Nessun log DB, è fisiologico)
        if (!accessData || accessData.status !== 'active') {
            alert("Accesso negato: non sei autorizzato a visualizzare o modificare questo paziente (Accesso revocato dal proprietario).");
            window.location.href = "/pages/veterinario/pazienti.html";
            return;
        }

        // Prepara i bottoni
        if (btnNuovaVisita) btnNuovaVisita.href = `nuova-visita.html?petId=${petId}`;
        if (btnStoriaClinica) btnStoriaClinica.href = `../../storia-clinica.html?petId=${petId}`;

        // Scarica i dati dell'animale
        const { data: pet, error: petError } = await supabase
            .from('pets')
            .select('*')
            .eq('id', petId)
            .single();

        if (petError) throw Object.assign(new Error(petError.message), { code: petError.code || 'DB_FETCH_PET_ERROR' });

        // Popola l'interfaccia
        if (headerPetName) headerPetName.textContent = pet.nome;
        if (petNameAge) {
            const extraInfo = pet.razza ? pet.razza : (pet.specie || "Animale");
            petNameAge.textContent = `${pet.nome} · ${extraInfo}`;
        }

        if (petMicrochipText) {
            petMicrochipText.textContent = pet.microchip ? `Microchip ${pet.microchip}` : "Microchip non inserito";
        }

        if (petAvatar) {
            if (pet.avatar_url) {
                const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(pet.avatar_url);
                petAvatar.src = publicUrlData.publicUrl;
            } else {
                petAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(pet.nome)}&background=F58220&color=fff`;
            }
        }

        // Conta le visite fatte (Ottimizzato con head:true)
        const { count, error: countError } = await supabase
            .from('medical_records')
            .select('*', { count: 'exact', head: true })
            .eq('pet_id', petId);
            
        if (countError) throw Object.assign(new Error(countError.message), { code: countError.code || 'DB_COUNT_RECORDS_ERROR' });

        if (storiaClinicaStats) {
            storiaClinicaStats.textContent = count > 0 ? `${count} visite/referti registrati` : `Nessuna visita registrata`;
        }

    } catch (err) {
        console.error("Errore caricamento scheda:", err);
        
        // ==========================================
        // TRIGGER LOG ERROR
        // ==========================================
        await logError({
            source: 'scheda_paziente_vet',
            action: 'init_page',
            errorMessage: err.message || "Errore imprevisto nel caricamento della scheda paziente",
            errorCode: err.code || 'UNKNOWN_SYS_ERROR',
            context: { petId, vetId: currentUser?.id }
        });

        alert("Errore di sistema nel caricamento dei dati. I tecnici sono stati avvisati.");
    }
}

// ==========================================
// 3. UPLOAD MULTIPLO REFERTI CON ANTI-DOPPIONE
// ==========================================
if (uploadRefertoInput) {
    uploadRefertoInput.addEventListener("change", async (e) => {
        const files = e.target.files;
        
        if (!files || files.length === 0 || !petId) return;

        // UI: Feedback visivo
        if (refertoTitle) {
            refertoTitle.textContent = "Caricamento...";
            refertoTitle.style.color = "#F58220";
        }
        if (refertoSub) refertoSub.textContent = "Verifica in corso...";
        
        try {
            // 1. Chiediamo a Supabase la lista dei referti già presenti
            const { data: existingFiles, error: listError } = await supabase.storage
                .from('storage_veterinari')
                .list('referti', { search: petId });

            if (listError) throw Object.assign(new Error(listError.message), { code: listError.code || 'STORAGE_LIST_ERROR' });

            let fileCaricati = 0;
            let fileSaltati = 0;

            // 2. Cicliamo su tutti i file selezionati
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                
                // Creiamo un nome univoco e sicuro: ID_CANE_NOMEFILE
                const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
                const finalFileName = `${petId}_${safeName}`;
                const filePath = `referti/${finalFileName}`;

                // 3. CONTROLLO ANTI-DOPPIONE
                const isDuplicate = existingFiles && existingFiles.some(f => f.name === finalFileName);

                if (isDuplicate) {
                    console.warn(`File ignorato (doppione): ${file.name}`);
                    fileSaltati++;
                    continue; 
                }

                // 4. Upload vero e proprio
                if (refertoSub) refertoSub.textContent = `Invio ${i + 1} di ${files.length}...`;

                const { error: uploadError } = await supabase.storage
                    .from('storage_veterinari')
                    .upload(filePath, file);

                if (uploadError) throw Object.assign(new Error(uploadError.message), { code: uploadError.code || 'STORAGE_UPLOAD_ERROR' });

                // 5. Otteniamo il link
                const { data: publicUrlData } = supabase.storage
                    .from('storage_veterinari')
                    .getPublicUrl(filePath);

                // 6. Salviamo nel database
                const { error: insertRecordError } = await supabase.from('medical_records').insert({
                    pet_id: petId,
                    vet_id: currentUser.id, 
                    diagnosi: "Referto medico allegato", 
                    attachment_url: publicUrlData.publicUrl
                });

                if (insertRecordError) throw Object.assign(new Error(insertRecordError.message), { code: insertRecordError.code || 'DB_INSERT_ATTACHMENT_ERROR' });

                fileCaricati++;
            }

            // 7. Resoconto finale
            if (fileSaltati > 0 && fileCaricati === 0) {
                alert(`Nessun nuovo file caricato. Tutti i file selezionati (${fileSaltati}) erano già presenti in memoria!`);
            } else if (fileSaltati > 0) {
                alert(`Completato! ${fileCaricati} file caricati. ${fileSaltati} file ignorati perché già presenti.`);
            } else {
                alert(`Successo! ${fileCaricati} referti caricati correttamente nella cartella clinica.`);
            }

            // Aggiorna il numerino visivo della storia clinica
            if (storiaClinicaStats) {
                const testoAttuale = storiaClinicaStats.textContent;
                const numeroAttuale = parseInt(testoAttuale.match(/\d+/)?.[0] || "0");
                storiaClinicaStats.textContent = `${numeroAttuale + fileCaricati} visite/referti registrati`;
            }

        } catch (error) {
            console.error("Errore upload referti:", error);
            
            await logError({
                source: 'scheda_paziente_vet',
                action: 'upload_referti',
                errorMessage: error.message || "Fallimento durante l'upload dei referti",
                errorCode: error.code || 'UNKNOWN_UPLOAD_ERROR',
                context: { petId, vetId: currentUser?.id }
            });

            alert("Si è verificato un errore di sistema durante il caricamento. I tecnici sono stati avvisati.");
        } finally {
            // Ripristiniamo la grafica del bottone originale
            if (refertoTitle) {
                refertoTitle.textContent = "Allega referto";
                refertoTitle.style.color = "#1E293B";
            }
            if (refertoSub) refertoSub.textContent = "PDF, foto o esame";
            uploadRefertoInput.value = ""; 
        }
    });
}

// ==========================================
// 4. FUNZIONE: REVOCA ACCESSO VETERINARIO
// ==========================================
if (btnRevocaAccesso) {
    btnRevocaAccesso.addEventListener("click", async () => {
        const conferma = confirm("Attenzione: sei sicuro di voler rimuovere questa cartella dai tuoi pazienti? Non potrai più visualizzare i dati o caricare referti.");
        
        if (!conferma) return;

        // UI: Feedback visivo e disabilitazione per evitare click multipli
        btnRevocaAccesso.disabled = true;
        btnRevocaAccesso.style.opacity = "0.6";
        const h4Element = btnRevocaAccesso.querySelector('h4');
        if (h4Element) h4Element.textContent = "Revoca in corso...";

        try {
            // Soft delete
            const { error } = await supabase
                .from('veterinarian_patients')
                .update({ 
                    status: 'revoked', 
                    revoked_at: new Date().toISOString() 
                })
                .eq('pet_id', petId)
                .eq('veterinarian_id', currentUser.id);

            if (error) throw Object.assign(new Error(error.message), { code: error.code || 'DB_REVOKE_ACCESS_ERROR' });

            alert("Accesso revocato con successo.");
            window.location.href = "pazienti.html";

        } catch (error) {
            console.error("Errore durante la revoca dell'accesso:", error);
            
            await logError({
                source: 'scheda_paziente_vet',
                action: 'revoke_access',
                errorMessage: error.message || "Impossibile aggiornare lo stato di revoca nel DB",
                errorCode: error.code || 'UNKNOWN_DB_ERROR',
                context: { petId, vetId: currentUser?.id }
            });

            alert("Errore di sistema. Impossibile revocare l'accesso in questo momento.");
            
            // Ripristino interfaccia
            btnRevocaAccesso.disabled = false;
            btnRevocaAccesso.style.opacity = "1";
            if (h4Element) h4Element.textContent = "Revoca accesso";
        }
    });
}

// Avvia tutto!
initPage();