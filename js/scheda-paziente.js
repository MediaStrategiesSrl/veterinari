// ==========================================
// 1. IMPORT CENTRALIZZATI E SETUP
// ==========================================
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
const btnAttivitaPasseggiate = document.getElementById("btnAttivitaPasseggiate"); // FIX: mancava il riferimento a questo elemento
// FIX: il box Vaccini non aveva id nell'HTML, quindi questo riferimento
// tornava sempre null e il suo href non veniva mai aggiornato con petId.
const btnVaccini = document.getElementById("btnVaccini");

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

        // ERRORE LOGICO: Lo status NON è "active", blocca tutto!
        if (!accessData || accessData.status !== 'active') {
            alert("Accesso negato: non sei autorizzato a visualizzare o modificare questo paziente (Accesso revocato dal proprietario).");
            window.location.href = "/pages/veterinario/pazienti.html";
            return;
        }

        // Prepara i bottoni
        if (btnNuovaVisita) btnNuovaVisita.href = `nuova-visita.html?petId=${petId}`;
        if (btnStoriaClinica) btnStoriaClinica.href = `../../storia-clinica.html?petId=${petId}`;
        if (btnAttivitaPasseggiate) btnAttivitaPasseggiate.href = `attivita-passeggiate.html?petId=${petId}`; // FIX: mancava questa riga, per questo l'URL non aveva mai il petId
        if (btnVaccini) btnVaccini.href = `vaccini.html?petId=${petId}`; // FIX: il box Vaccini non era mai stato collegato, per questo vaccini.html si apriva senza petId nell'URL

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

        // ==========================================
        // FIX: GESTIONE STORAGE AVATAR
        // ==========================================
        if (petAvatar) {
            if (pet.avatar_url) {
                // Controllo: se è già un URL http completo, usalo. Altrimenti genera il public URL dallo storage.
                if (pet.avatar_url.startsWith('http')) {
                    petAvatar.src = pet.avatar_url;
                } else {
                    const { data: publicUrlData } = supabase.storage.from('storage_veterinari').getPublicUrl(pet.avatar_url);
                    petAvatar.src = publicUrlData.publicUrl;
                }
            } else {
                // Fallback: Iniziali generate dinamicamente
                petAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(pet.nome)}&background=F58220&color=fff`;
            }
        }

        // Conta le visite fatte
        const { count, error: countError } = await supabase
            .from('medical_records')
            .select('*', { count: 'exact', head: true })
            .eq('pet_id', petId);
            
        if (countError) throw Object.assign(new Error(countError.message), { code: countError.code || 'DB_COUNT_RECORDS_ERROR' });

        if (storiaClinicaStats) {
            storiaClinicaStats.textContent = count > 0 ? `${count} visite/referti registrati` : `Nessuna visita registrata`;
        }

        // ==========================================
        // LINK ALL'ULTIMA PRESCRIZIONE
        // ==========================================
        // Cerchiamo l'ultima visita di QUESTO animale che contiene una terapia
        // (non tutti i medical_records ce l'hanno: i referti allegati via upload,
        // ad esempio, hanno diagnosi ma niente terapia). Se la troviamo, mostriamo
        // un link diretto a prescrizione.html con l'id di quella visita, senza
        // richiedere modifiche all'HTML esistente.
        const { data: ultimaTerapia, error: ultimaTerapiaError } = await supabase
            .from('medical_records')
            .select('id')
            .eq('pet_id', petId)
            .not('terapia', 'is', null)
            .neq('terapia', '')
            .order('data_visita', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (ultimaTerapiaError) {
            console.warn("Impossibile verificare l'ultima prescrizione:", ultimaTerapiaError.message);
        } else if (ultimaTerapia) {
            inserisciLinkUltimaPrescrizione(ultimaTerapia.id);
        }

    } catch (err) {
        console.error("Errore caricamento scheda:", err);
        
        // TRIGGER LOG ERROR
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
            // Chiediamo a Supabase la lista dei referti già presenti
            const { data: existingFiles, error: listError } = await supabase.storage
                .from('storage_veterinari')
                .list('referti', { search: petId });

            if (listError) throw Object.assign(new Error(listError.message), { code: listError.code || 'STORAGE_LIST_ERROR' });

            let fileCaricati = 0;
            let fileSaltati = 0;

            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                
                const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
                const finalFileName = `${petId}_${safeName}`;
                const filePath = `referti/${finalFileName}`;

                // CONTROLLO ANTI-DOPPIONE
                const isDuplicate = existingFiles && existingFiles.some(f => f.name === finalFileName);

                if (isDuplicate) {
                    console.warn(`File ignorato (doppione): ${file.name}`);
                    fileSaltati++;
                    continue; 
                }

                if (refertoSub) refertoSub.textContent = `Invio ${i + 1} di ${files.length}...`;

                const { error: uploadError } = await supabase.storage
                    .from('storage_veterinari')
                    .upload(filePath, file);

                if (uploadError) throw Object.assign(new Error(uploadError.message), { code: uploadError.code || 'STORAGE_UPLOAD_ERROR' });

                const { data: publicUrlData } = supabase.storage
                    .from('storage_veterinari')
                    .getPublicUrl(filePath);

                const { error: insertRecordError } = await supabase.from('medical_records').insert({
                    pet_id: petId,
                    vet_id: currentUser.id, 
                    diagnosi: "Referto medico allegato", 
                    attachment_url: publicUrlData.publicUrl
                });

                if (insertRecordError) throw Object.assign(new Error(insertRecordError.message), { code: insertRecordError.code || 'DB_INSERT_ATTACHMENT_ERROR' });

                fileCaricati++;
            }

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

        btnRevocaAccesso.disabled = true;
        btnRevocaAccesso.style.opacity = "0.6";
        const h4Element = btnRevocaAccesso.querySelector('h4');
        if (h4Element) h4Element.textContent = "Revoca in corso...";

        try {
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
            
            btnRevocaAccesso.disabled = false;
            btnRevocaAccesso.style.opacity = "1";
            if (h4Element) h4Element.textContent = "Revoca accesso";
        }
    });
}

// ==========================================
// LINK DINAMICO: ULTIMA PRESCRIZIONE
// ==========================================
function inserisciLinkUltimaPrescrizione(recordId) {
    if (document.getElementById('btnUltimaPrescrizione')) return; // evita doppioni

    // Usiamo btnStoriaClinica come punto fisso di inserimento
    const puntoInserimento = btnStoriaClinica;
    if (!puntoInserimento || !puntoInserimento.parentNode) return;

    const link = document.createElement('a');
    link.id = 'btnUltimaPrescrizione';
    link.href = `prescrizione.html?id=${recordId}`;
    
    // FIX CSS INLINE: Aggiunto width 100%, box-sizing e padding/margini identici alle altre card
    link.style.cssText = `
        text-decoration: none; 
        display: flex; 
        align-items: center; 
        justify-content: space-between; 
        background: #ffffff; 
        padding: 16px; 
        border-radius: 16px; 
        margin-top: 16px; /* Spaziatura identica tra le card */
        box-shadow: 0 4px 15px rgba(28, 36, 48, 0.04); 
        width: 100%; 
        box-sizing: border-box;
    `;
    
    link.innerHTML = `
        <div style="display:flex; align-items:center; gap:16px;">
            <div style="background:#FFF3E9; color:#F58220; width:44px; height:44px; border-radius:12px; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                <i class="fa-solid fa-file-medical" style="font-size:18px;"></i>
            </div>
            <div style="display:flex; flex-direction:column; justify-content:center;">
                <h4 style="margin:0 0 2px 0; color:#1C2430; font-size:16px; font-weight:700; line-height:1.2;">Ultima prescrizione</h4>
                <p style="margin:0; color:#6B7280; font-size:13px; line-height:1.2;">Visualizza e stampa</p>
            </div>
        </div>
        <!-- FIX FRECCIA: Colore grigio chiaro standard UI (#CBD5E1) -->
        <i class="fa-solid fa-chevron-right" style="color:#CBD5E1; font-size:14px;"></i>
    `;

    // Inserisce esattamente sotto la card "Storia clinica"
    puntoInserimento.parentNode.insertBefore(link, puntoInserimento.nextSibling);
}
// Avvia tutto!
initPage();