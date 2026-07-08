import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const qrTitle = document.getElementById('qrTitle');
const qrImage = document.getElementById('qrImage'); 
const petNameText = document.getElementById('petNameText'); 

let qrChannel = null; 

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
            .select('id, nome, qr_code_hash') 
            .eq('owner_id', user.id)
            .order('id', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) throw new Error("Errore DB: " + error.message);
        if (!pet) throw new Error("Nessun animale registrato");
        if (!pet.qr_code_hash) throw new Error("Nessun QR generato");

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
        if (qrTitle) qrTitle.textContent = err.message; 
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
                    
                    if (vetError) console.error("❌ ERRORE LETTURA DATI VET:", vetError.message);
                    
                    // 1. Estraiamo i dati del veterinario in modo sicuro
                    // (Supabase potrebbe restituire un array o un oggetto singolo, li gestiamo entrambi)
                    let vDati = null;
                    if (vet && vet.veterinarians) {
                        vDati = Array.isArray(vet.veterinarians) ? vet.veterinarians[0] : vet.veterinarians;
                    }

                    // 2. Creiamo i testi dinamici
                    const nomeCompleto = vet ? `Dott. ${vet.nome} ${vet.cognome || ''}` : "Veterinario";
                    
                    // Sostituiamo "Medico veterinario verificato" con il numero dell'ordine
                    const dettagliOrdine = vDati && vDati.numero_ordine
                        ? `Ordine n. ${vDati.numero_ordine}` 
                        : "Ordine in aggiornamento";
                        
                    // Inseriamo l'indirizzo vero
                    const indirizzo = vDati && vDati.indirizzo_clinica
                        ? vDati.indirizzo_clinica 
                        : "Indirizzo non specificato";

                    // 3. Lanciamo la modale
                    mostraPopupApprovazione(nomeCompleto, dettagliOrdine, indirizzo, richiestaInArrivo.id);
                }
            }
        )
        .subscribe((status) => {
             console.log("📡 [REALTIME QR-PAGE] Stato connessione server:", status);
        });
}

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