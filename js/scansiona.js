// ==========================================
// 1. IMPORT CENTRALIZZATI E SETUP
// ==========================================
// Assicurati che i percorsi (es. ../utils/) puntino alla tua struttura reale
import { supabase } from '../utils/supabaseClient.js';
import { logError } from '../utils/logger.js';

let currentUser = null;
let html5QrCode = null;
let isProcessingScan = false; // FLAG AGGIUNTA: Previene letture doppie e conflitti DB

const scanStatus = document.getElementById("scanStatus");

// ==========================================
// 2. INIZIALIZZAZIONE SCANNER E AUTH
// ==========================================
async function initScanner() {
    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        if (authError) throw Object.assign(new Error(authError.message), { code: authError.code || 'AUTH_SYS_ERROR' });
        
        if (!user) {
            window.location.href = "index.html";
            return;
        }
        currentUser = user;

        // Avvia la fotocamera (richiede HTTPS o localhost)
        html5QrCode = new Html5Qrcode("reader");
        
        const config = { 
            fps: 10, 
            qrbox: { width: 220, height: 220 },
            aspectRatio: 0.8
        };

        await html5QrCode.start(
            { facingMode: "environment" }, // Usa fotocamera posteriore
            config,
            onScanSuccess
        );
    } catch (err) {
        console.error("Errore inizializzazione scanner:", err);
        
        // Se l'errore è causato dall'utente che nega i permessi, mostriamo solo un alert
        if (err.name === 'NotAllowedError' || err.name === 'NotFoundError') {
            alert("Consenti l'accesso alla fotocamera per scansionare il QR Code.");
        } else {
            // Se è un errore di sistema, lo logghiamo nel DB
            await logError({
                source: 'scanner_qr_vet',
                action: 'init_scanner',
                errorMessage: err.message || "Impossibile avviare la fotocamera o recuperare la sessione auth",
                errorCode: err.code || 'CAMERA_INIT_ERROR',
                context: { userId: currentUser?.id }
            });
            alert("Errore di sistema durante l'avvio della fotocamera.");
        }
    }
}

// ==========================================
// 3. GESTIONE SCANSIONE AVVENUTA
// ==========================================
async function onScanSuccess(decodedText) {
    // 1. BLOCCO ANTI-RIMBALZO: Se stiamo già processando un QR, ignoriamo le letture successive (Fix per letture multiple)
    if (isProcessingScan) return;
    isProcessingScan = true;
    
    // Ferma subito lo scanner in modo asincrono attendendone il completamento
    try {
        await html5QrCode.stop();
    } catch (err) {
        console.error("Errore stop scanner", err);
    }
    
    // Mostra caricamento UI
    scanStatus.classList.remove("hidden");
    scanStatus.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Ricerca animale in corso...`;
    scanStatus.style.backgroundColor = "#F58220"; 
    
    try {
        // 2. Cerca l'animale nel DB usando il codice QR (qr_code_hash)
        const { data: petData, error: petError } = await supabase
            .from('pets')
            .select('id, nome')
            .eq('qr_code_hash', decodedText)
            .single();

        if (petError) throw Object.assign(new Error(petError.message), { code: petError.code || 'DB_FETCH_PET_ERROR' });
        if (!petData) throw Object.assign(new Error("Animale non trovato."), { code: 'PET_NOT_FOUND_LOGIC' });

        // ==========================================
        // 3. INVIA RICHIESTA DI ACCESSO E METTITI IN ASCOLTO
        // ==========================================
        scanStatus.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Attesa approvazione da parte del proprietario...`;

        // Calcoliamo la data di scadenza (Es: tra 1 ora esatta da adesso)
        const scadenza = new Date();
        scadenza.setHours(scadenza.getHours() + 1);

        // Crea la richiesta pendente
        const { data: richiesta, error: requestError } = await supabase
            .from('pet_access_requests')
            .insert({
                pet_id: petData.id,
                veterinarian_id: currentUser.id,
                status: 'pending',
                expires_at: scadenza.toISOString()
            })
            .select()
            .single();

        if (requestError) throw Object.assign(new Error(requestError.message), { code: requestError.code || 'DB_INSERT_REQUEST_ERROR' });

        // ==========================================
        // 4. REALTIME: ASCOLTO RISPOSTA
        // ==========================================
        const canaleVet = supabase
            .channel(`attesa-accesso-${richiesta.id}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'pet_access_requests',
                    filter: `id=eq.${richiesta.id}`
                },
                async (payload) => {
                    const nuovoStato = payload.new.status;

                    if (nuovoStato === 'approved') {
                        // SPEGNE L'ANTENNA
                        supabase.removeChannel(canaleVet); 

                        try {
                            // ORA CHE HA IL PERMESSO, AGGIUNGE L'ANIMALE ALLA LISTA PAZIENTI
                            const { error: insertPatientError } = await supabase
                                .from('veterinarian_patients')
                                .insert({
                                    veterinarian_id: currentUser.id,
                                    pet_id: petData.id,
                                    access_request_id: richiesta.id, // FIX: Campo fondamentale per RLS/Coerenza dati
                                    status: 'active'
                                });

                            if (insertPatientError) throw Object.assign(new Error(insertPatientError.message), { code: insertPatientError.code || 'DB_INSERT_PATIENT_ERROR' });

                            // Successo visivo!
                            scanStatus.innerHTML = `<i class="fa-solid fa-check"></i> Accesso approvato! ${petData.nome} aggiunto.`;
                            scanStatus.style.backgroundColor = "#059669"; 

                            // Reindirizza alla cartella clinica dopo 2 secondi
                            setTimeout(() => {
                                window.location.href = `/storia-clinica.html?petId=${petData.id}`;
                            }, 2000);

                        } catch (insertErr) {
                            console.error("Errore salvataggio paziente:", insertErr);
                            
                            await logError({
                                source: 'scanner_qr_vet',
                                action: 'insert_veterinarian_patient',
                                errorMessage: insertErr.message || "Impossibile collegare il paziente al veterinario post-approvazione",
                                errorCode: insertErr.code || 'UNKNOWN_DB_ERROR',
                                context: { vetId: currentUser.id, petId: petData.id }
                            });
                            
                            scanStatus.innerHTML = `<i class="fa-solid fa-xmark"></i> Errore di salvataggio interno.`;
                            scanStatus.style.backgroundColor = "#DC2626";

                            // FIX: Ripristina lo scanner anche se l'inserimento finale fallisce
                            setTimeout(() => {
                                scanStatus.classList.add("hidden");
                                isProcessingScan = false;
                                initScanner();
                            }, 3000);
                        }

                    } else if (nuovoStato === 'rejected') {
                        // SPEGNE L'ANTENNA E MOSTRA ERRORE
                        supabase.removeChannel(canaleVet);
                        scanStatus.innerHTML = `<i class="fa-solid fa-xmark"></i> Accesso negato dal proprietario.`;
                        scanStatus.style.backgroundColor = "#DC2626"; 

                        setTimeout(() => {
                            window.location.href = "dashboard-veterinario.html";
                        }, 2500);
                    }
                }
            )
            .subscribe((status) => {
                 if (status === 'CHANNEL_ERROR') {
                     logError({
                         source: 'scanner_qr_vet',
                         action: 'realtime_subscription_vet',
                         errorMessage: "Errore iscrizione canale realtime o disconnessione improvvisa",
                         errorCode: 'REALTIME_CHANNEL_ERROR',
                         context: { requestId: richiesta.id }
                     });
                 }
            });

    } catch (error) {
        console.error("Errore durante la scansione:", error);
        
        scanStatus.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${error.message}`;
        scanStatus.style.backgroundColor = "#DC2626"; 
        
        // Logghiamo l'errore a meno che non sia semplicemente "animale non trovato"
        if (error.code !== 'PET_NOT_FOUND_LOGIC') {
            await logError({
                source: 'scanner_qr_vet',
                action: 'process_scan',
                errorMessage: error.message || "Fallimento durante l'elaborazione del QR Code",
                errorCode: error.code || 'UNKNOWN_DB_ERROR',
                context: { decodedText, vetId: currentUser?.id }
            });
        }
        
        // Riavvia lo scanner dopo un errore e sblocca il flag
        setTimeout(() => {
            scanStatus.classList.add("hidden");
            isProcessingScan = false; // FIX: Permette una nuova scansione
            initScanner();
        }, 3000);
    }
}

// Avvia lo script
initScanner();