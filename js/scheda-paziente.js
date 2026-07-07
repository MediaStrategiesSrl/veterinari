import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ==========================================
// VARIABILI GLOBALI (Visibili a tutto il file)
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

async function initPage() {
    try {
        // Controllo Login
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            window.location.href = "login.html";
            return;
        }
        currentUser = user; // Salviamo l'utente globalmente!

        // Legge il petId dall'URL
        const urlParams = new URLSearchParams(window.location.search);
        petId = urlParams.get('petId'); // Salviamo il petId globalmente!

        if (!petId) {
            alert("Nessun paziente selezionato!");
            window.location.href = "/pages/veterinario/pazienti.html";
            return;
        }

        // ==========================================
        // NUOVO: CONTROLLO DI SICUREZZA (GUARD)
        // ==========================================
        const { data: accessData, error: accessError } = await supabase
            .from('veterinarian_patients')
            .select('status')
            .eq('pet_id', petId)
            .eq('veterinarian_id', currentUser.id)
            .single();

        // Se c'è un errore, se non c'è il dato, o se lo status NON è "active", blocca tutto!
        if (accessError || !accessData || accessData.status !== 'active') {
            alert("Accesso negato: non sei autorizzato a visualizzare o modificare questo paziente (Accesso revocato).");
            window.location.href = "/pages/veterinario/pazienti.html";
            return;
        }

        // Prepara il bottone "Nuova Visita"
        btnNuovaVisita.href = `nuova-visita.html?petId=${petId}`;

        // Prepara il bottone "Storia Clinica"
        btnStoriaClinica.href = `../../storia-clinica.html?petId=${petId}`;

        // Scarica i dati dell'animale
        const { data: pet, error } = await supabase
            .from('pets')
            .select('*')
            .eq('id', petId)
            .single();

        if (error) throw error;

        // Popola l'interfaccia
        headerPetName.textContent = pet.nome;
        const extraInfo = pet.razza ? pet.razza : (pet.specie || "Animale");
        petNameAge.textContent = `${pet.nome} · ${extraInfo}`;

        if (pet.microchip) {
            petMicrochipText.textContent = `Microchip ${pet.microchip}`;
        } else {
            petMicrochipText.textContent = "Microchip non inserito";
        }

        if (pet.avatar_url) {
            const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(pet.avatar_url);
            petAvatar.src = publicUrlData.publicUrl;
        } else {
            petAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(pet.nome)}&background=F58220&color=fff`;
        }

        // Conta le visite fatte
        const { count, error: countError } = await supabase
            .from('medical_records')
            .select('*', { count: 'exact', head: true })
            .eq('pet_id', petId);
            
        if (!countError) {
            storiaClinicaStats.textContent = count > 0 ? `${count} visite/referti registrati` : `Nessuna visita registrata`;
        }

    } catch (err) {
        console.error("Errore caricamento scheda:", err);
        alert("Errore nel caricamento dei dati: " + err.message);
    }
}

// ==========================================
// UPLOAD MULTIPLO REFERTI CON CONTROLLO DOPPIONI
// ==========================================
uploadRefertoInput.addEventListener("change", async (e) => {
    const files = e.target.files;
    
    // Controlliamo che l'utente abbia selezionato qualcosa e che petId esista
    if (!files || files.length === 0 || !petId) return;

    // UI: Feedback visivo
    refertoTitle.textContent = "Caricamento...";
    refertoTitle.style.color = "#F58220";
    refertoSub.textContent = "Verifica in corso...";
    
    try {
        // 1. Chiediamo a Supabase la lista dei referti già presenti per questo animale
        const { data: existingFiles, error: listError } = await supabase.storage
            .from('storage_veterinari')
            .list('referti', { search: petId });

        if (listError) throw listError;

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
            refertoSub.textContent = `Invio ${i + 1} di ${files.length}...`;

            const { error: uploadError } = await supabase.storage
                .from('storage_veterinari')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            // 5. Otteniamo il link
            const { data: publicUrlData } = supabase.storage
                .from('storage_veterinari')
                .getPublicUrl(filePath);

            // 6. Salviamo nel database
            await supabase.from('medical_records').insert({
                pet_id: petId,
                vet_id: currentUser.id, 
                diagnosi: "Referto medico allegato", 
                attachment_url: publicUrlData.publicUrl
            });

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
        const testoAttuale = storiaClinicaStats.textContent;
        const numeroAttuale = parseInt(testoAttuale.match(/\d+/)?.[0] || "0");
        storiaClinicaStats.textContent = `${numeroAttuale + fileCaricati} visite/referti registrati`;

    } catch (error) {
        console.error("Errore upload referti:", error);
        alert("Si è verificato un errore durante il caricamento: " + error.message);
    } finally {
        // Ripristiniamo la grafica del bottone originale
        refertoTitle.textContent = "Allega referto";
        refertoTitle.style.color = "#1E293B";
        refertoSub.textContent = "PDF, foto o esame";
        uploadRefertoInput.value = ""; 
    }
});

// ==========================================
// FUNZIONE: REVOCA ACCESSO VETERINARIO
// ==========================================
if (btnRevocaAccesso) {
    btnRevocaAccesso.addEventListener("click", async () => {
        // Chiediamo conferma per evitare click accidentali
        const conferma = confirm("Attenzione: sei sicuro di voler rimuovere questa cartella dai tuoi pazienti? Non potrai più visualizzare i dati o caricare referti.");
        
        if (!conferma) return;

        // UI: Feedback visivo e disabilitazione per evitare click multipli
        btnRevocaAccesso.disabled = true;
        btnRevocaAccesso.style.opacity = "0.6";
        btnRevocaAccesso.querySelector('h4').textContent = "Revoca in corso...";

        try {
            // Soft delete: aggiorniamo lo status in "revoked" e salviamo l'orario in "revoked_at"
            const { error } = await supabase
                .from('veterinarian_patients')
                .update({ 
                    status: 'revoked', 
                    revoked_at: new Date().toISOString() 
                })
                .eq('pet_id', petId)
                .eq('veterinarian_id', currentUser.id);

            if (error) throw error;

            // Feedback di successo e reindirizzamento alla lista pazienti
            alert("Accesso revocato con successo.");
            window.location.href = "pazienti.html";

        } catch (error) {
            console.error("Errore durante la revoca dell'accesso:", error);
            alert("Si è verificato un errore: " + error.message);
            
            // Ripristino interfaccia in caso di errore
            btnRevocaAccesso.disabled = false;
            btnRevocaAccesso.style.opacity = "1";
            btnRevocaAccesso.querySelector('h4').textContent = "Revoca accesso";
        }
    });
}

// Avvia tutto!
initPage();