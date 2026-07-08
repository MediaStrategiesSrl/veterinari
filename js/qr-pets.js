import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Qui usiamo ESATTAMENTE gli ID del tuo HTML
const qrTitle = document.getElementById('qrTitle');
const qrImage = document.getElementById('qrImage'); 
const petNameText = document.getElementById('petNameText'); 

let qrChannel = null; // Aggiungiamo la variabile per l'antenna

async function loadQRCode() {
    try {
        // 1. Controlla utente
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            window.location.href = '../../index.html';
            return;
        }

        // 2. Prendi l'animale (⚠️ HO AGGIUNTO 'id' NELLA SELECT)
        const { data: pet, error } = await supabase
            .from('pets')
            .select('id, nome, qr_code_hash') 
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
            qrImage.style.display = 'block'; 
        }

        // 🚀 5. ATTIVA L'ANTENNA REALTIME MENTRE IL VET SCANSIONA!
        attivaAscoltoNotificheQR(pet.id);

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

// ========================================================
// REATIME: ASCOLTO RICHIESTE DI ACCESSO QR IN TEMPO REALE
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
                    // Cerca il nome del vet
                    const { data: vet } = await supabase
                        .from('profiles')
                        .select('nome')
                        .eq('id', richiestaInArrivo.veterinar_id) // Uso il nome corretto della tua colonna
                        .single();
                    
                    const nomeVet = vet ? vet.nome : "Un veterinario";
                    mostraPopupApprovazione(nomeVet, richiestaInArrivo.id);
                }
            }
        )
        .subscribe((status) => {
             console.log("📡 [REALTIME QR-PAGE] Stato connessione server:", status);
        });
}

// Questa la leghiamo a 'window' così i bottoni HTML creati nel popup possono cliccarla
window.rispondiAllaRichiesta = async function(idRichiesta, sceltaUtente) {
    const { error } = await supabase
        .from('pet_access_requests')
        .update({ status: sceltaUtente })
        .eq('id', idRichiesta);

    if (!error) {
        nascondiPopupApprovazione();
    } else {
        alert("Errore di connessione. Riprova.");
    }
};

// --- CREAZIONE GRAFICA DEL POPUP AUTOMATICO ---
function mostraPopupApprovazione(nomeVet, idRichiesta) {
    if (document.getElementById("qr-auth-popup")) return;

    const popupHTML = `
        <div id="qr-auth-popup" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 9999; backdrop-filter: blur(4px);">
            <div style="background: white; padding: 25px; border-radius: 20px; width: 90%; max-width: 350px; text-align: center; box-shadow: 0 10px 25px rgba(0,0,0,0.2);">
                <div style="background: #FFF7ED; color: #F58220; width: 60px; height: 60px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 24px; margin: 0 auto 15px;">
                    <i class="fa-solid fa-qrcode"></i>
                </div>
                <h3 style="margin: 0 0 10px; color: #1E293B; font-size: 1.2rem;">Richiesta di Accesso</h3>
                <p style="color: #64748B; font-size: 0.95rem; margin-bottom: 25px; line-height: 1.4;">
                    <strong>${nomeVet}</strong> ha scansionato la medaglietta. Vuoi consentire l'accesso alla cartella clinica?
                </p>
                <div style="display: flex; gap: 10px;">
                    <button onclick="rispondiAllaRichiesta('${idRichiesta}', 'rejected')" style="flex: 1; padding: 12px; border-radius: 12px; border: 1px solid #E2E8F0; background: white; color: #64748B; font-weight: bold; cursor: pointer;">Rifiuta</button>
                    <button onclick="rispondiAllaRichiesta('${idRichiesta}', 'approved')" style="flex: 1; padding: 12px; border-radius: 12px; border: none; background: #059669; color: white; font-weight: bold; cursor: pointer; box-shadow: 0 4px 12px rgba(5, 150, 105, 0.2);">Consenti</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML("beforeend", popupHTML);
}

function nascondiPopupApprovazione() {
    const popup = document.getElementById("qr-auth-popup");
    if (popup) popup.remove();
}