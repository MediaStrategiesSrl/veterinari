// ==========================================
// 1. IMPORT CENTRALIZZATI E SETUP
// ==========================================
// Assicurati che i percorsi (es. ./utils/) puntino alla tua struttura reale
import { supabase } from '../utils/supabaseClient.js';
import { logError } from '../utils/logger.js';

const activeRolesList = document.getElementById("activeRolesList");
const availableRolesList = document.getElementById("availableRolesList");

const ALL_ROLES = [
    {
        id: "proprietario",
        title: "Proprietario",
        desc: "Gestisci i tuoi animali",
        icon: "fa-paw",
        dashboardUrl: "pages/proprietario/dashboard-proprietario.html"
    },
    {
        id: "veterinario",
        title: "Veterinario",
        desc: "Gestisci visite e pazienti",
        icon: "fa-user-doctor",
        dashboardUrl: "pages/veterinario/dashboard-veterinario.html"
    },
    {
        id: "professionista",
        title: "Professionista (Pet Sitter/Educatore)",
        desc: "Offri servizi per animali",
        icon: "fa-dog",
        dashboardUrl: "pages/professionista/dashboard-professionista.html"
    },
    {
        id: "sponsor",
        title: "Sponsor",
        desc: "Gestisci le tue campagne",
        icon: "fa-bullhorn",
        dashboardUrl: "pages/sponsor/dashboard-sponsor.html"
    }
];

// ==========================================
// 2. INIZIALIZZAZIONE E RECUPERO RUOLI
// ==========================================
async function initRuoli() {
    try {
        // 1. Check Autenticazione
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        if (authError) throw Object.assign(new Error(authError.message), { code: authError.code || 'AUTH_SYS_ERROR' });
        
        if (!user) {
            window.location.href = "index.html";
            return;
        }

        // 2. Recupero Ruoli dal Database
        const { data: userRolesData, error: dbError } = await supabase
            .from('user_roles')
            .select(`
                roles (
                    nome
                )
            `)
            .eq('user_id', user.id);

        if (dbError) throw Object.assign(new Error(dbError.message), { code: dbError.code || 'DB_FETCH_ROLES_ERROR' });

        console.log("--- DEBUG SUPABASE ---");
        console.log("Dati grezzi ricevuti:", userRolesData);

        const activeRoles = [];
        if (userRolesData) {
            userRolesData.forEach(item => {
                if (item.roles) {
                    // Estrai il nome dal DB, che sia in un oggetto o in un array
                    let dbRoleName = "";
                    if (item.roles.nome) {
                        dbRoleName = item.roles.nome.toLowerCase();
                    } else if (Array.isArray(item.roles) && item.roles[0] && item.roles[0].nome) {
                        dbRoleName = item.roles[0].nome.toLowerCase();
                    }

                    if (dbRoleName) {
                        // ========================================================
                        // TRADUZIONE: Mappatura ruoli flessibili in ruoli di sistema
                        // ========================================================
                        if (dbRoleName.includes("professionista") || dbRoleName.includes("sitter") || dbRoleName.includes("educatore")) {
                            dbRoleName = "professionista";
                        }
                        
                        activeRoles.push(dbRoleName.trim());
                    }
                }
            });
        }

        console.log("Ruoli attivi elaborati finali:", activeRoles);
        console.log("----------------------");

        // 3. Renderizzazione UI
        renderRoles(activeRoles);

    } catch (error) {
        console.error("ERRORE CRITICO RECUPERO RUOLI:", error);
        
        // ==========================================
        // TRIGGER LOG ERROR
        // ==========================================
        await logError({
            source: 'selezione_ruoli',
            action: 'init_ruoli',
            errorMessage: error.message || "Impossibile recuperare i ruoli dell'utente",
            errorCode: error.code || 'UNKNOWN_SYS_ERROR',
            context: {}
        });

        activeRolesList.innerHTML = `
            <div style="text-align: center; padding: 20px; background: #FEF2F2; border-radius: 12px; border: 1px dashed #EF4444;">
                <p style="color: #DC2626; margin: 0; font-weight: bold;">Errore di sistema.</p>
                <p style="color: #EF4444; margin-top: 5px; font-size: 0.9rem;">Impossibile caricare i profili. I nostri tecnici sono stati avvisati.</p>
            </div>
        `;
    }
}

// ==========================================
// 3. RENDERIZZAZIONE INTERFACCIA
// ==========================================
function renderRoles(activeRoles) {
    activeRolesList.innerHTML = "";
    availableRolesList.innerHTML = "";

    if (activeRoles.length === 0) {
        activeRolesList.innerHTML = `
            <div style="text-align: center; padding: 20px; background: #fff; border-radius: 12px; border: 1px dashed #CBD5E1;">
                <p style="color: #64748B; margin: 0;">Non hai ancora nessun profilo attivo.<br>Scegline uno qui sotto per iniziare!</p>
            </div>
        `;
    }

    ALL_ROLES.forEach(roleObj => {
        const isActive = activeRoles.includes(roleObj.id);

        const card = document.createElement("div");
        card.className = `role-card role-${roleObj.id}`;
        
        const actionIcon = isActive ? '<i class="fa-solid fa-arrow-right-to-bracket"></i>' : '<i class="fa-solid fa-plus"></i>';
        const actionText = isActive ? 'Passa al profilo' : 'Aggiungi ruolo';

        card.innerHTML = `
            <div class="role-info">
                <div class="role-icon"><i class="fa-solid ${roleObj.icon}"></i></div>
                <div class="role-texts">
                    <h4>${roleObj.title}</h4>
                    <p>${actionText}</p>
                </div>
            </div>
            <div class="role-action">${actionIcon}</div>
        `;

        card.addEventListener("click", () => {
            if (isActive) {
                window.location.href = roleObj.dashboardUrl;
            } else {
                window.location.href = `completeprofile.html?role=${roleObj.id}`;
            }
        });

        if (isActive) {
            activeRolesList.appendChild(card);
        } else {
            availableRolesList.appendChild(card);
        }
    });

    if (availableRolesList.innerHTML === "") {
        availableRolesList.innerHTML = "<p class='section-desc' style='text-align:center; color:#10B981; font-weight:bold;'>Hai sbloccato tutti i profili disponibili!</p>";
    }
}

// Avvio
initRuoli();