// ==========================================
// 1. IMPORT CENTRALIZZATI E SETUP
// ==========================================
// Assicurati che i percorsi (../utils/) puntino alla tua struttura reale
import { supabase } from '../utils/supabaseClient.js';
import { logError } from '../utils/logger.js';

const qrTitle = document.getElementById('qrTitle');
const qrImage = document.getElementById('qrImage'); 
const petNameText = document.getElementById('petNameText'); 

let qrChannel = null; 

// ==========================================
// 2. CARICAMENTO DEL QR CODE
// ==========================================
async function loadQRCode() {
    try {
        // 1. Controlla utente
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        if (authError) throw Object.assign(new Error(authError.message), { code: authError.code || 'AUTH_SYS_ERROR' });
        
        if (!user) {
            window.location.href = '../../index.html';
            return;
        }

        // 2. Prendi l'animale (l'ultimo inserito, fallback semplice)
        const { data: pet, error: petError } = await supabase
            .from('pets')
            .select('id, nome, qr_code_hash') 
            .eq('owner_id', user.id)
            .order('id', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (petError) throw Object.assign(new Error(petError.message), { code: petError.code || 'DB_FETCH_PET_ERROR' });
        
        if (!pet) {
            if (qrTitle) qrTitle.textContent = "Nessun animale registrato";
            return;
        }
        if (!pet.qr_code_hash) {
            if (qrTitle) qrTitle.textContent = "Nessun QR generato per questo animale";
            return;
        }

        // 3. Aggiorna i testi a schermo
        if (qrTitle) qrTitle.textContent = `QR di ${pet.nome}`; 
        if (petNameText) petNameText.textContent = pet.nome;
        
        // 4. Carica l'immagine
        const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(pet.qr_code_hash)}`;
        
        if (qrImage) {
            qrImage.src = qrApiUrl;
            qrImage.style.display = 'block'; 
        }

        // 5. ATTIVA L'ANTENNA REALTIME
        attivaAscoltoNotificheQR(pet.id);

    } catch (err) {
        console.error("ERRORE QR:", err);
        
        // ==========================================
        // TRIGGER LOG ERROR
        // ==========================================
        await logError({
            source: 'condivisione_qr',
            action: 'load_qr_code',
            errorMessage: err.message || "Impossibile caricare il QR Code dal database",
            errorCode: err.code || 'UNKNOWN_SYS_ERROR',
            context: {}
        });

        if (qrTitle) qrTitle.textContent = "Errore di caricamento. Riprova più tardi."; 
    }
}

loadQRCode();

const btnSimulate = document.getElementById("btnSimulate");
if (btnSimulate) {
    btnSimulate.addEventListener("click", () => {
        alert("Simulazione scansione lato Veterinario in corso...");
    });
}

// ========================================================
// 3. REALTIME: ASCOLTO RICHIESTE DI ACCESSO QR
// ========================================================
function attivaAscoltoNotificheQR(activePetId) {
    if (!activePetId) return;

    if (qrChannel) {
        supabase.removeChannel(qrChannel);
    }

    console.log("📡 [REALTIME QR-PAGE] Antenna accesa! In ascolto sul pet_id:", activePetId);

    qrChannel = supabase
        .channel(`ascolto-qr-page-${activePetId}`)
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'pet_access_requests',
                filter: `pet_id=eq.${activePetId}`
            },
            async (payload) => {
                console.log("🔥 [REALTIME QR-PAGE] MESSAGGIO RICEVUTO DAL VETERINARIO!", payload);
                const richiestaInArrivo = payload.new;

                if (richiestaInArrivo.status === 'pending') {
                    try {
                        const idVet = richiestaInArrivo.veterinarian_id; 

                        const { data: vet, error: vetError } = await supabase
                            .from('profiles')
                            .select(`
                                nome,
                                cognome,
                                veterinarians (
                                    numero_ordine,
                                    indirizzo_clinica
                                )
                            `)
                            .eq('id', idVet) 
                            .single();
                        
                        if (vetError) throw Object.assign(new Error(vetError.message), { code: vetError.code || 'DB_FETCH_VET_DETAILS_ERROR' });
                        
                        // Estraiamo i dati del veterinario in modo sicuro
                        let vDati = null;
                        if (vet && vet.veterinarians) {
                            vDati = Array.isArray(vet.veterinarians) ? vet.veterinarians[0] : vet.veterinarians;
                        }

                        // Creiamo i testi dinamici
                        const nomeCompleto = vet ? `Dott. ${vet.nome} ${vet.cognome || ''}` : "Veterinario";
                        const dettagliOrdine = vDati && vDati.numero_ordine
                            ? `Ordine n. ${vDati.numero_ordine}` 
                            : "Ordine in aggiornamento";
                        const indirizzo = vDati && vDati.indirizzo_clinica
                            ? vDati.indirizzo_clinica 
                            : "Indirizzo non specificato";

                        // Lanciamo la modale UI
                        mostraPopupApprovazione(nomeCompleto, dettagliOrdine, indirizzo, richiestaInArrivo.id);

                    } catch (err) {
                        console.error("❌ ERRORE LETTURA DATI VET IN REALTIME:", err);
                        
                        // Registriamo l'errore tecnico senza bloccare l'esperienza utente
                        await logError({
                            source: 'condivisione_qr',
                            action: 'realtime_fetch_vet',
                            errorMessage: err.message || "Fallita lettura dati veterinario dopo ricezione payload Realtime",
                            errorCode: err.code || 'UNKNOWN_DB_ERROR',
                            context: { activePetId, payload: payload.new }
                        });
                        
                        // Fallback UI: permettiamo comunque all'utente di approvare/rifiutare anche se mancano i dettagli del medico
                        mostraPopupApprovazione("Veterinario", "Dettagli non disponibili", "Indirizzo non specificato", richiestaInArrivo.id);
                    }
                }
            }
        )
        .subscribe((status) => {
             console.log("📡 [REALTIME QR-PAGE] Stato connessione server:", status);
             
             // Se cade la connessione Realtime, logghiamo l'evento
             if (status === 'CHANNEL_ERROR') {
                 logError({
                     source: 'condivisione_qr',
                     action: 'realtime_subscription',
                     errorMessage: "Errore iscrizione canale realtime o disconnessione",
                     errorCode: 'REALTIME_CHANNEL_ERROR',
                     context: { activePetId }
                 });
             }
        });
}

// ========================================================
// 4. RISPOSTA ALLA RICHIESTA (APPROVA/RIFIUTA)
// ========================================================
window.rispondiAllaRichiesta = async function(idRichiesta, sceltaUtente) {
    try {
        const { error } = await supabase
            .from('pet_access_requests')
            .update({ status: sceltaUtente })
            .eq('id', idRichiesta);

        if (error) throw Object.assign(new Error(error.message), { code: error.code || 'DB_UPDATE_REQUEST_ERROR' });

        nascondiPopupApprovazione();
        
        if (sceltaUtente === 'approved') {
            // Opzionale: un piccolo feedback di conferma per l'utente
            console.log("Accesso consentito con successo.");
        }

    } catch (err) {
        console.error("Errore aggiornamento richiesta:", err);
        
        await logError({
            source: 'condivisione_qr',
            action: 'rispondi_richiesta',
            errorMessage: err.message || "Errore durante l'aggiornamento dello status della richiesta",
            errorCode: err.code || 'UNKNOWN_DB_ERROR',
            context: { idRichiesta, sceltaUtente }
        });

        alert("Errore di connessione durante la conferma. Riprova.");
    }
};

// ========================================================
// UI: VIEW A SCHERMO INTERO DINAMICA
// ========================================================
function mostraPopupApprovazione(nomeVet, dettagliOrdine, indirizzo, idRichiesta) {
    if (document.getElementById("qr-auth-fullscreen")) return;

    const popupHTML = `
        <div id="qr-auth-fullscreen" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background-color: #FAF8F5; z-index: 10000; display: flex; flex-direction: column; font-family: 'Inter', sans-serif; overflow-y: auto;">
            
            <!-- Header Nav -->
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 20px;">
                <button onclick="nascondiPopupApprovazione()" style="background: none; border: none; font-size: 20px; cursor: pointer; color: #1E293B;"><i class="fa-solid fa-chevron-left"></i></button>
                <div style="text-align: center;">
                    <h2 style="margin: 0; font-size: 1.2rem; color: #1E293B;">Richiesta di accesso</h2>
                    <p style="margin: 2px 0 0; font-size: 0.85rem; color: #94A3B8;">Nuovo veterinario</p>
                </div>
                <div style="width: 40px; height: 40px; background: white; border-radius: 50%; display: flex; justify-content: center; align-items: center; box-shadow: 0 2px 5px rgba(0,0,0,0.05); color: #1E293B;">
                    <i class="fa-solid fa-diamond"></i>
                </div>
            </div>

            <!-- Hero Card Blue -->
            <div style="margin: 10px 20px; background: linear-gradient(135deg, #41AECF, #2E8CAE); border-radius: 20px; padding: 25px; color: white; box-shadow: 0 10px 20px rgba(65, 174, 207, 0.2);">
                <div style="background: rgba(255,255,255,0.3); display: inline-block; padding: 4px 10px; border-radius: 8px; font-size: 0.7rem; font-weight: bold; letter-spacing: 0.5px; margin-bottom: 15px;">
                    IDENTITÀ VERIFICATA
                </div>
                <h1 style="margin: 0 0 10px; font-size: 1.8rem;">${nomeVet}</h1>
                <p style="margin: 0 0 5px; font-size: 0.9rem; opacity: 0.9;">Medico veterinario &middot; ${dettagliOrdine}</p>
                <p style="margin: 0; font-size: 0.9rem; opacity: 0.9;">Studio: ${indirizzo}</p>
            </div>

            <!-- Lista Dati Richiesti -->
            <div style="padding: 20px;">
                <h3 style="margin: 0 0 15px; font-size: 1.1rem; color: #1E293B;">Dati richiesti</h3>
                
                <!-- Card 1 -->
                <div style="display: flex; align-items: center; background: white; padding: 15px; border-radius: 16px; margin-bottom: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.03);">
                    <div style="width: 50px; height: 50px; background: #FFF7ED; color: #F58220; border-radius: 12px; display: flex; justify-content: center; align-items: center; font-size: 20px; margin-right: 15px;">
                        <i class="fa-solid fa-plus"></i>
                    </div>
                    <div style="flex: 1;">
                        <h4 style="margin: 0 0 4px; font-size: 1rem; color: #1E293B;">Cartella clinica completa</h4>
                        <p style="margin: 0; font-size: 0.8rem; color: #94A3B8;">Visite, diagnosi, terapie e allegati</p>
                    </div>
                    <i class="fa-solid fa-chevron-right" style="color: #CBD5E1; font-size: 0.9rem;"></i>
                </div>

                <!-- Card 2 -->
                <div style="display: flex; align-items: center; background: white; padding: 15px; border-radius: 16px; margin-bottom: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.03);">
                    <div style="width: 50px; height: 50px; background: #F0F9FA; color: #41AECF; border-radius: 12px; display: flex; justify-content: center; align-items: center; font-size: 20px; margin-right: 15px;">
                        <i class="fa-solid fa-clover"></i>
                    </div>
                    <div style="flex: 1;">
                        <h4 style="margin: 0 0 4px; font-size: 1rem; color: #1E293B;">Storico attività</h4>
                        <p style="margin: 0; font-size: 0.8rem; color: #94A3B8;">Appuntamenti e passeggiate</p>
                    </div>
                    <i class="fa-solid fa-chevron-right" style="color: #CBD5E1; font-size: 0.9rem;"></i>
                </div>

                <!-- Card 3 -->
                <div style="display: flex; align-items: center; background: white; padding: 15px; border-radius: 16px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.03);">
                    <div style="width: 50px; height: 50px; background: #FFF7ED; color: #F58220; border-radius: 12px; display: flex; justify-content: center; align-items: center; font-size: 20px; margin-right: 15px;">
                        <i class="fa-solid fa-square"></i>
                    </div>
                    <div style="flex: 1;">
                        <h4 style="margin: 0 0 4px; font-size: 1rem; color: #1E293B;">Documenti dell'animale</h4>
                        <p style="margin: 0; font-size: 0.8rem; color: #94A3B8;">Microchip, passaporto, assicurazione</p>
                    </div>
                    <i class="fa-solid fa-chevron-right" style="color: #CBD5E1; font-size: 0.9rem;"></i>
                </div>

                <p style="font-size: 0.8rem; color: #94A3B8; line-height: 1.5; margin-bottom: 30px;">
                    L'autorizzazione resterà valida fino alla revoca. Ogni consultazione e modifica sarà registrata.
                </p>

                <!-- Bottoni -->
                <div style="display: flex; gap: 15px; padding-bottom: 20px;">
                    <button onclick="rispondiAllaRichiesta('${idRichiesta}', 'rejected')" style="flex: 1; padding: 16px; border-radius: 16px; border: 2px solid #E2E8F0; background: transparent; color: #1E293B; font-weight: bold; font-size: 1rem; cursor: pointer;">Rifiuta</button>
                    <button onclick="rispondiAllaRichiesta('${idRichiesta}', 'approved')" style="flex: 1; padding: 16px; border-radius: 16px; border: none; background: #F58220; color: white; font-weight: bold; font-size: 1rem; cursor: pointer; box-shadow: 0 4px 12px rgba(245, 130, 32, 0.2);">Conferma accesso</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML("beforeend", popupHTML);
}

window.nascondiPopupApprovazione = function() {
    const popup = document.getElementById("qr-auth-fullscreen");
    if (popup) popup.remove();
}