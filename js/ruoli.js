import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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

async function initRuoli() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        window.location.href = "index.html";
        return;
    }

    try {
        const { data: userRolesData, error } = await supabase
            .from('user_roles')
            .select(`
                roles (
                    nome
                )
            `)
            .eq('user_id', user.id);

        if (error) throw error;

        console.log("--- DEBUG SUPABASE ---");
        console.log("Dati grezzi ricevuti:", userRolesData);

        const activeRoles = [];
        if (userRolesData) {
            userRolesData.forEach(item => {
                if (item.roles) {
                    if (item.roles.nome) {
                        activeRoles.push(item.roles.nome.toLowerCase());
                    } else if (Array.isArray(item.roles) && item.roles[0] && item.roles[0].nome) {
                        activeRoles.push(item.roles[0].nome.toLowerCase());
                    }
                }
            });
        }

        console.log("Ruoli attivi elaborati finali:", activeRoles);
        console.log("----------------------");

        renderRoles(activeRoles);

    } catch (error) {
        console.error("ERRORE CRITICO RECUPERO RUOLI:", error);
        activeRolesList.innerHTML = "<p style='color:red;'>Errore nel caricamento dei profili.</p>";
    }
}

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
        availableRolesList.innerHTML = "<p class='section-desc'>Hai sbloccato tutti i profili disponibili!</p>";
    }
}

initRuoli();