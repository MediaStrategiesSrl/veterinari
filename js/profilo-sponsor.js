// ==========================================
// 1. IMPORT CENTRALIZZATI E SETUP
// ==========================================
import { supabase } from '../utils/supabaseClient.js';
import { logError } from '../utils/logger.js';
import { applyPartialApprovalLock } from '../utils/approvalGuard.js';

// Elementi DOM esatti che mi hai passato nell'HTML
const userNameDisplay = document.getElementById('userNameDisplay');
const userDetailsDisplay = document.getElementById('userDetailsDisplay');
const profileHeaderContainer = document.getElementById('profileHeaderContainer');
const btnLogout = document.getElementById('btnLogout');

// ==========================================
// 2. INIZIALIZZAZIONE
// ==========================================
async function init() {
    try {
        // Controllo Autenticazione
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            window.location.href = '../../index.html';
            return;
        }

        // Recupero in parallelo: info anagrafiche (profiles) e info azienda (sponsors)
        const [ { data: profile }, { data: sponsor } ] = await Promise.all([
            supabase.from('profiles').select('nome, cognome, citta').eq('id', user.id).single(),
            supabase.from('sponsors').select('nome_azienda, is_approved').eq('user_id', user.id).maybeSingle()
        ]);

        if (!profile) throw new Error("Profilo non trovato nel database");

        // 1. Definisci il Nome da mostrare (Priorità: Nome Azienda > Nome e Cognome)
        let displayNome = `${profile.nome} ${profile.cognome}`.trim();
        if (sponsor && sponsor.nome_azienda) {
            displayNome = sponsor.nome_azienda;
        }
        if (userNameDisplay) userNameDisplay.textContent = displayNome;

        // 2. Dettagli (Account verificato · Città)
        const cittaText = profile.citta ? ` · ${profile.citta}` : '';
        const statoText = (sponsor && sponsor.is_approved) ? 'Account verificato' : 'In attesa di approvazione';
        if (userDetailsDisplay) userDetailsDisplay.textContent = `${statoText}${cittaText}`;

        // 3. Generazione e stile Iniziali Avatar
        if (profileHeaderContainer) {
            const avatarDiv = profileHeaderContainer.querySelector('.user-initials-avatar');
            if (avatarDiv) {
                avatarDiv.textContent = getInitials(displayNome);
                // Sovrascrive lo stile base per farlo diventare colorato stile gradient arancio come da app
                avatarDiv.style.background = 'linear-gradient(135deg, #F39C12, #E67E22)';
                avatarDiv.style.color = '#ffffff';
                avatarDiv.style.boxShadow = '0 8px 20px rgba(243, 156, 18, 0.3)';
            }
        }

        //lock parziale se lo sponsor non è ancora approvato
        if (!sponsor || !sponsor.is_approved) {
            applyPartialApprovalLock({
                lockSelectors: ['.profile-card', '.menu-action-card'],
                keepActiveHrefIncludes: 'ruoli.html',
                bannerTarget: document.querySelector('.section-container')
            });
        }

    } catch (error) {
        console.error("Errore caricamento profilo sponsor:", error);
        if (userNameDisplay) userNameDisplay.textContent = "Errore di caricamento";
        if (userDetailsDisplay) userDetailsDisplay.textContent = "Riprova più tardi";
        
        logError({ 
            source: 'profilo_sponsor', 
            action: 'init', 
            errorMessage: error.message 
        });
    }
}

// ==========================================
// 3. UTILITIES E AZIONI
// ==========================================
function getInitials(nameString) {
    if (!nameString) return "SP";
    const parts = nameString.trim().split(' ');
    if (parts.length >= 2) {
        // Prende la prima lettera delle prime due parole (Es: Luca Rinaldi -> LR)
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    // Se è una sola parola, prende le prime due lettere
    return nameString.substring(0, 2).toUpperCase();
}

// GESTIONE LOGOUT
if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
        const conferma = confirm("Sei sicuro di voler uscire?");
        if (!conferma) return;

        btnLogout.textContent = "Uscita in corso...";
        btnLogout.disabled = true;

        const { error } = await supabase.auth.signOut();
        
        if (error) {
            console.error("Errore durante il logout:", error);
            alert("Si è verificato un errore. Riprova.");
            btnLogout.textContent = "Esci dal profilo";
            btnLogout.disabled = false;
        } else {
            window.location.href = '../../index.html'; // Reindirizza alla landing page o login
        }
    });
}

// Lancia lo script al caricamento della pagina
document.addEventListener('DOMContentLoaded', init);