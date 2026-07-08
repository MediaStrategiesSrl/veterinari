import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let currentUser = null;
let html5QrCode = null;

const scanStatus = document.getElementById("scanStatus");

async function initScanner() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        window.location.href = "login.html";
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

    try {
        await html5QrCode.start(
            { facingMode: "environment" }, // Usa fotocamera posteriore
            config,
            onScanSuccess
        );
    } catch (err) {
        console.error("Errore avvio fotocamera:", err);
        alert("Consenti l'accesso alla fotocamera per scansionare il QR Code.");
    }
}

// Quando un QR viene letto con successo
async function onScanSuccess(decodedText) {
    // 1. Ferma subito lo scanner per evitare doppie letture
    html5QrCode.stop().catch(err => console.error("Errore stop scanner", err));
    
    // Mostra caricamento UI
    scanStatus.classList.remove("hidden");
    scanStatus.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Ricerca animale in corso...`;
    scanStatus.style.backgroundColor = "#F58220"; // Arancione
    
    try {
        // 2. Cerca l'animale nel DB usando il codice QR (qr_code_hash)
        const { data: petData, error: petError } = await supabase
            .from('pets')
            .select('id, nome')
            .eq('qr_code_hash', decodedText)
            .single();

        if (petError || !petData) {
            throw new Error("Codice QR non valido o animale non trovato.");
        }

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
                status: 'pending', // Stato iniziale
                expires_at: scadenza.toISOString()
            })
            .select()
            .single();

        if (requestError) throw new Error(requestError.message);

        // Accende l'antenna Realtime per ascoltare i cambiamenti su QUESTA specifica richiesta
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

                        // ORA CHE HA IL PERMESSO, AGGIUNGE L'ANIMALE ALLA LISTA PAZIENTI
                        await supabase
                            .from('veterinarian_patients')
                            .insert({
                                veterinarian_id: currentUser.id,
                                pet_id: petData.id
                            });

                        // Successo visivo!
                        scanStatus.innerHTML = `<i class="fa-solid fa-check"></i> Accesso approvato! ${petData.nome} aggiunto.`;
                        scanStatus.style.backgroundColor = "#059669"; // Verde successo

                        // Reindirizza alla cartella clinica dopo 2 secondi
                        setTimeout(() => {
                            window.location.href = `/storia-clinica.html?petId=${petData.id}`;
                        }, 2000);

                    } else if (nuovoStato === 'rejected') {
                        // SPEGNE L'ANTENNA E MOSTRA ERRORE
                        supabase.removeChannel(canaleVet);
                        scanStatus.innerHTML = `<i class="fa-solid fa-xmark"></i> Accesso negato dal proprietario.`;
                        scanStatus.style.backgroundColor = "#DC2626"; // Rosso errore

                        setTimeout(() => {
                            window.location.href = "dashboard-veterinario.html";
                        }, 2500);
                    }
                }
            )
            .subscribe();

    } catch (error) {
        console.error(error);
        scanStatus.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${error.message}`;
        scanStatus.style.backgroundColor = "#DC2626"; // Rosso errore
        
        // Riavvia lo scanner dopo un errore
        setTimeout(() => {
            scanStatus.classList.add("hidden");
            initScanner();
        }, 3000);
    }
}

// Avvia lo script
initScanner();