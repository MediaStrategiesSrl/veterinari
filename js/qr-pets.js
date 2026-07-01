import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Qui usiamo ESATTAMENTE gli ID del tuo HTML
const qrTitle = document.getElementById('qrTitle');
const qrImage = document.getElementById('qrImage'); 
const petNameText = document.getElementById('petNameText'); 

async function loadQRCode() {
    try {
        // 1. Controlla utente
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            window.location.href = '../../index.html';
            return;
        }

        // 2. Prendi l'animale
        const { data: pet, error } = await supabase
            .from('pets')
            .select('nome, qr_code_hash')
            .eq('owner_id', user.id)
            .order('id', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) throw new Error("Errore DB: " + error.message);
        if (!pet) throw new Error("Nessun animale registrato");
        if (!pet.qr_code_hash) throw new Error("Nessun QR generato");

        // 3. Aggiorna i testi a schermo (Titolo e Descrizione)
        if (qrTitle) qrTitle.textContent = `QR di ${pet.nome}`; 
        if (petNameText) petNameText.textContent = pet.nome;
        
        // 4. Carica l'immagine
        const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(pet.qr_code_hash)}`;
        
        if (qrImage) {
            qrImage.src = qrApiUrl;
            // Assicuriamoci che l'immagine sia visibile
            qrImage.style.display = 'block'; 
        }

    } catch (err) {
        console.error("ERRORE QR:", err);
        if (qrTitle) qrTitle.textContent = err.message; 
    }
}

loadQRCode();

// Già che ci siamo, diamo vita al bottone "Simula scansione"
const btnSimulate = document.getElementById("btnSimulate");
if (btnSimulate) {
    btnSimulate.addEventListener("click", () => {
        alert("Simulazione scansione lato Veterinario in corso...");
    });
}