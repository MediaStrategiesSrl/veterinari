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
let isEditing = false; // <-- Variabile magica per controllare lo stato Modifica/Salva

// Gestione visiva del file selezionato
documentoFile.addEventListener("change", (e) => {
    if (e.target.files.length > 0) {
        fileLabelText.textContent = e.target.files[0].name;
        fileLabelText.style.color = "#1E293B";
        fileLabelText.style.fontWeight = "bold";
    }
});

// ==========================================
// 1. CARICAMENTO DATI (Tutto bloccato di default)
// ==========================================
async function loadUserData() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        window.location.href = "../../index.html";
        return;
    }
    currentUser = user;

    try {
        emailInput.value = user.email;

        const { data: profile, error } = await supabase
            .from('profiles')
            .select('nome, cognome, data_nascita, documento_url') 
            .eq('id', user.id)
            .single();

        if (error && error.code !== 'PGRST116') throw error;

        if (profile) {
            const nome = profile.nome || "";
            const cognome = profile.cognome || "";
            nomeCognomeInput.value = `${nome} ${cognome}`.trim();

            if (profile.data_nascita) {
                dataNascitaInput.value = profile.data_nascita;
            }

            if (profile.documento_url) {
                docStatus.classList.remove("hidden");
                fileLabelText.textContent = "Sostituisci documento esistente";
            }
        }

        // BLOCCA TUTTI I CAMPI ALL'AVVIO
        disabilitaCampi(true);

    } catch (error) {
        console.error("Errore recupero dati:", error);
        showMessage("Impossibile caricare i dati del profilo.", "#DC2626");
    }
}

// Funzione di utilità per bloccare/sbloccare l'interfaccia
function disabilitaCampi(disabilita) {
    nomeCognomeInput.disabled = disabilita;
    emailInput.disabled = disabilita;
    dataNascitaInput.disabled = disabilita;
    documentoFile.disabled = disabilita;
    
    // Cambia aspetto visivo e testo del bottone principale
    if (disabilita) {
        submitBtn.innerHTML = '<i class="fa-solid fa-pen"></i> Modifica Dati';
        submitBtn.style.backgroundColor = "transparent";
        submitBtn.style.color = "#F58220";
        submitBtn.style.border = "2px solid #F58220";
    } else {
        submitBtn.innerHTML = '<i class="fa-solid fa-check"></i> Salva Modifiche';
        submitBtn.style.backgroundColor = "#F58220";
        submitBtn.style.color = "white";
    }
}

// ==========================================
// 2. GESTIONE CLICK BOTTONE (TOGGLE MODIFICA / SALVA)
// ==========================================
form.addEventListener("submit", async (e) => {
    e.preventDefault();

    // SE SIAMO IN MODALITÀ LETTURA -> SBLOCCA I CAMPI E FERMATI QUI
    if (!isEditing) {
        isEditing = true;
        disabilitaCampi(false);
        nomeCognomeInput.focus(); // Mette il cursore pronto per scrivere
        return; 
    }

    // SE SIAMO IN MODALITÀ MODIFICA -> SALVA I DATI
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvataggio...';
    formMessage.innerHTML = "";

    try {
        let docUrl = null;
        const file = documentoFile.files[0];

        // 1. UPLOAD DOCUMENTO (Se modificato)
        if (file) {
            submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Upload documento...';
            const fileExt = file.name.split('.').pop();
            const fileName = `doc_identita_${Date.now()}.${fileExt}`;
            const filePath = `user_docs/${currentUser.id}/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('storage_veterinari')
                .upload(filePath, file, { upsert: true });

            if (uploadError) throw uploadError;
            docUrl = filePath;
        }

        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Aggiornamento profilo...';

        // 2. DIVIDI NOME E COGNOME
        // Separa il campo unico alla prima riga di spazio (es. "Marco Riva" -> nome:"Marco", cognome:"Riva")
        const [nuovoNome, ...restoCognome] = nomeCognomeInput.value.trim().split(' ');
        const nuovoCognome = restoCognome.join(' '); 

        // 3. PREPARA I DATI PER LA TABELLA PROFILES
        const updateData = {
            nome: nuovoNome || null,
            cognome: nuovoCognome || null,
            data_nascita: dataNascitaInput.value || null
        };
        if (docUrl) updateData.documento_url = docUrl;

        // AGGIORNA TABELLA PROFILES
        const { error: updateError } = await supabase
            .from('profiles')
            .update(updateData)
            .eq('id', currentUser.id);

        if (updateError) throw updateError;

        // 4. AGGIORNA EMAIL (Richiede chiamata Auth speciale)
        if (emailInput.value !== currentUser.email) {
            const { error: emailError } = await supabase.auth.updateUser({
                email: emailInput.value
            });
            if (emailError) throw emailError;
            
            showMessage("Dati salvati! Controlla la tua nuova email per confermare l'indirizzo.", "#059669");
        } else {
            showMessage("Dati personali salvati con successo!", "#059669");
        }
        
        // Aggiorniamo l'interfaccia documento
        if (docUrl) {
            docStatus.classList.remove("hidden");
            fileLabelText.textContent = "Sostituisci documento esistente";
            documentoFile.value = ""; 
        }

        // SALVATAGGIO FINITO: TORNAMO IN MODALITÀ LETTURA
        isEditing = false;
        disabilitaCampi(true);

    } catch (error) {
        console.error("Errore salvataggio:", error);
        showMessage("Si è verificato un errore durante il salvataggio.", "#DC2626");
        // In caso di errore restiamo in modalità modifica per far riprovare l'utente
        disabilitaCampi(false);
    } finally {
        submitBtn.disabled = false;
    }
});

function showMessage(text, color) {
    formMessage.textContent = text;
    formMessage.style.color = color;
    setTimeout(() => { formMessage.textContent = ""; }, 6000);
}

loadUserData();