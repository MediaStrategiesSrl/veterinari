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

        // 3. Aggiunge l'animale alla lista pazienti del Veterinario
        const { error: insertError } = await supabase
            .from('veterinarian_patients')
            .insert({
                veterinarian_id: currentUser.id,
                pet_id: petData.id
            });

        // Se l'animale è già in lista (errore 23505 di chiave duplicata), va bene lo stesso
        if (insertError && insertError.code !== '23505') {
            throw insertError;
        }

        // 4. Successo!
        scanStatus.innerHTML = `<i class="fa-solid fa-check"></i> ${petData.nome} aggiunto ai pazienti!`;
        scanStatus.style.backgroundColor = "#059669"; // Verde successo

        // Reindirizza alla pagina pazienti dopo 2 secondi (oppure apri la sua scheda medica)
        setTimeout(() => {
            window.location.href = "dashboard-veterinario.html"; // Puoi cambiarlo con la pagina Pazienti in futuro
        }, 2000);

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