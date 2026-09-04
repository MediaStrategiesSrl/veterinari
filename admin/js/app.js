import { supabase } from '../../utils/supabaseClient.js';
import { logError } from '../../utils/logger.js'; // Import del sistema di logging centrale

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const sb = supabase;

let cache = {};
const tables = [
  "profiles", "roles", "user_roles", "veterinarians", "professionals", "sponsors", "pets",
  "medical_records", "appointments", "urgent_consultations", "walks", "pet_access_requests",
  "veterinarian_patients", "marketplace_items", "marketplace_categories", "provider_services",
  "pet_friendships", "walk_participants", "error_logs", "provider_locations", "marketplace_listings",
  "marketplace_listing_photos", "marketplace_listing_declarations", "marketplace_requests",
  "marketplace_giveaways", "marketplace_ratings", "marketplace_chat_messages", "marketplace_reports",
  "sponsor_campaigns", "campaign_events"
];

function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, m => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[m]));
}

function nameOf(p) {
  return p ? `${p.nome || ""} ${p.cognome || ""}`.trim() : "—";
}

function fmtDate(v) {
  return v ? new Date(v).toLocaleDateString("it-IT") : "—";
}

function fmtDateTime(v) {
  return v ? new Date(v).toLocaleString("it-IT") : "—";
}

function money(v) {
  return v == null
    ? "—"
    : new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(v));
}

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2400);
}

function fail(e) {
  console.error(e);
  toast(e?.message || "Errore durante il caricamento");
}

async function q(table, columns = "*") {
  const { data, error } = await sb.from(table).select(columns);
  if (error) throw error;
  cache[table] = data || [];
  return cache[table];
}

async function loadAll() {
  const results = await Promise.allSettled(tables.map(t => q(t)));
  const errors = results.filter(x => x.status === "rejected");
  if (errors.length) console.warn("Tabelle non leggibili:", errors);
  renderAll();
}

function rows(table, html) {
  const body = $(`#${table} tbody`);
  if (body) body.innerHTML = html;
}

function profileMap() {
  return Object.fromEntries((cache.profiles || []).map(x => [x.id, x]));
}

function renderDashboard() {
  const counts = {
    "Animali": cache.pets?.length || 0,
    "Profili": cache.profiles?.length || 0,
    "Veterinari": cache.veterinarians?.length || 0,
    "Professionisti": cache.professionals?.length || 0,
    "Sponsor": cache.sponsors?.length || 0,
    "Appuntamenti": cache.appointments?.length || 0,
    "Cartelle mediche": cache.medical_records?.length || 0,
    "Campagne": cache.sponsor_campaigns?.length || 0
  };

  const top = [
    ["Animali", counts["Animali"], "🐾"],
    ["Profili", counts["Profili"], "👤"],
    ["Veterinari", counts["Veterinari"], "🩺"],
    ["Professionisti", counts["Professionisti"], "💼"]
  ];

  $("#statsGrid").innerHTML = top.map(x => `
    <div class="stat">
      <div class="label">${x[2]} ${x[0]}</div>
      <div class="value">${x[1]}</div>
    </div>
  `).join("");

  $("#dashboardSummary").innerHTML = Object.entries(counts).map(([k, v]) => `
    <div class="summary-item">
      <b>${v}</b>
      <span>${k}</span>
    </div>
  `).join("");
}

function renderPets() {
  const p = profileMap();
  rows("petsTable", (cache.pets || []).map(x => `
    <tr>
      <td><b>${esc(x.nome)}</b></td>
      <td>${esc(x.specie)}</td>
      <td>${esc(x.razza)}</td>
      <td>${fmtDate(x.data_nascita)}</td>
      <td>${esc(x.microchip)}</td>
      <td>${esc(nameOf(p[x.owner_id]))}</td>
    </tr>
  `).join(""));
}

function renderOwners() {
  const p = profileMap(), rolesBy = {};
  (cache.user_roles || []).forEach(r => (rolesBy[r.user_id] ??= []).push(
    (cache.roles || []).find(x => x.id === r.role_id)?.label || "—"
  ));

  const petCount = {};
  (cache.pets || []).forEach(x => petCount[x.owner_id] = (petCount[x.owner_id] || 0) + 1);

  rows("ownersTable", (cache.profiles || []).filter(x => petCount[x.id] || rolesBy[x.id]?.length).map(x => `
    <tr>
      <td><b>${esc(nameOf(x))}</b></td>
      <td>${esc(x.email)}</td>
      <td>${esc(x.telefono)}</td>
      <td>${esc(x.citta)}</td>
      <td>${petCount[x.id] || 0}</td>
      <td>${(rolesBy[x.id] || []).map(r => `<span class="badge">${esc(r)}</span>`).join(" ") || "—"}</td>
    </tr>
  `).join(""));
}

function renderVets() {
  const p = profileMap(), pc = {};
  (cache.veterinarian_patients || []).filter(x => x.status === "active").forEach(x => {
    pc[x.veterinarian_id] = (pc[x.veterinarian_id] || 0) + 1;
  });

  rows("vetsTable", (cache.veterinarians || []).map(x => {
    let u = p[x.user_id];
    return `
      <tr>
        <td><b>${esc(nameOf(u))}</b></td>
        <td>${esc(u?.email)}</td>
        <td>${esc(u?.telefono)}</td>
        <td>${esc(x.numero_ordine)}</td>
        <td>${x.is_available_now ? '<span class="badge">Sì</span>' : 'No'}</td>
        <td>${pc[x.user_id] || 0}</td>
      </tr>
    `;
  }).join(""));
}

function renderProfessionals() {
  const p = profileMap(), loc = {};
  (cache.provider_locations || []).forEach(x => {
    loc[x.provider_id] = (loc[x.provider_id] || 0) + 1;
  });

  rows("professionalsTable", (cache.professionals || []).map(x => {
    let u = p[x.user_id];
    return `
      <tr>
        <td><b>${esc(nameOf(u))}</b></td>
        <td>${esc(x.tipo_professione)}</td>
        <td>${esc(u?.email)}</td>
        <td>${money(x.tariffa_oraria)}</td>
        <td>${loc[x.user_id] || 0}</td>
      </tr>
    `;
  }).join(""));
}

function renderSponsors() {
  const p = profileMap(), cc = {};
  (cache.sponsor_campaigns || []).forEach(x => {
    cc[x.sponsor_id] = (cc[x.sponsor_id] || 0) + 1;
  });

  rows("sponsorsTable", (cache.sponsors || []).map(x => {
    let u = p[x.user_id];
    return `
      <tr>
        <td><b>${esc(x.nome_azienda)}</b></td>
        <td>${esc(x.partita_iva)}</td>
        <td>${esc(nameOf(u))}</td>
        <td>${esc(u?.email)}</td>
        <td>${cc[x.user_id] || 0}</td>
      </tr>
    `;
  }).join(""));
}

function renderRelations() {
  const p = profileMap(), pets = Object.fromEntries((cache.pets || []).map(x => [x.id, x]));

  $("#relationPetOwner tbody").innerHTML = (cache.pets || []).map(x => `
    <tr>
      <td><b>${esc(x.nome)}</b></td>
      <td>${esc(x.specie)}</td>
      <td>${esc(nameOf(p[x.owner_id]))}</td>
      <td>${esc(p[x.owner_id]?.email)}</td>
    </tr>
  `).join("");

  $("#relationPetVet tbody").innerHTML = (cache.veterinarian_patients || []).map(x => {
    const pet = pets[x.pet_id], v = p[x.veterinarian_id];
    return `
      <tr>
        <td>${esc(pet?.nome)}</td>
        <td>${esc(nameOf(v))}</td>
        <td>${esc((cache.veterinarians || []).find(z => z.user_id === x.veterinarian_id)?.numero_ordine)}</td>
        <td>${esc(x.status)}</td>
      </tr>
    `;
  }).join("");

  const ap = cache.appointments || [];
  $("#relationPetProf tbody").innerHTML = ap
    .filter(x => x.ruolo_provider && x.ruolo_provider.toLowerCase() !== "veterinario")
    .map(x => {
      const pet = pets[x.pet_id], pr = p[x.provider_id];
      return `
        <tr>
          <td>${esc(pet?.nome)}</td>
          <td>${esc(nameOf(pr))}</td>
          <td>${esc(x.ruolo_provider)}</td>
          <td>1</td>
        </tr>
      `;
    }).join("");
}

function renderAppointments() {
  const p = profileMap(), pets = Object.fromEntries((cache.pets || []).map(x => [x.id, x]));
  rows("appointmentsTable", (cache.appointments || []).map(x => `
    <tr>
      <td>${fmtDateTime(x.data_inizio)}</td>
      <td>${esc(pets[x.pet_id]?.nome)}</td>
      <td>${esc(nameOf(p[x.owner_id]))}</td>
      <td>${esc(nameOf(p[x.provider_id]))}</td>
      <td>${esc(x.ruolo_provider)}</td>
      <td>${esc(x.stato)}</td>
      <td>${money(x.costo)}</td>
    </tr>
  `).join(""));
}

function renderMedical() {
  const p = profileMap(), pets = Object.fromEntries((cache.pets || []).map(x => [x.id, x]));
  rows("medicalTable", (cache.medical_records || []).map(x => `
    <tr>
      <td>${fmtDateTime(x.data_visita)}</td>
      <td>${esc(pets[x.pet_id]?.nome)}</td>
      <td>${esc(nameOf(p[x.vet_id]))}</td>
      <td>${esc(x.diagnosi)}</td>
      <td>${esc(x.terapia)}</td>
      <td>${fmtDateTime(x.prossimo_richiamo)}</td>
    </tr>
  `).join(""));
}

function renderMarketplace() {
  const vals = [
    ["Annunci", cache.marketplace_listings?.length || 0],
    ["Richieste", cache.marketplace_requests?.length || 0],
    ["Giveaway", cache.marketplace_giveaways?.length || 0],
    ["Rating", cache.marketplace_ratings?.length || 0],
    ["Messaggi", cache.marketplace_chat_messages?.length || 0],
    ["Segnalazioni", cache.marketplace_reports?.length || 0]
  ];
  $("#marketCards").innerHTML = vals.map(x => `
    <div class="market-card">
      <b>${x[1]}</b>
      <span>${x[0]}</span>
    </div>
  `).join("");
}

function renderCampaigns() {
  const s = Object.fromEntries((cache.sponsors || []).map(x => [x.user_id, x.nome_azienda])), ev = {};
  (cache.campaign_events || []).forEach(x => {
    ev[x.campaign_id] ??= { impression: 0, click: 0 };
    ev[x.campaign_id][x.event_type]++;
  });

  rows("campaignsTable", (cache.sponsor_campaigns || []).map(x => `
    <tr>
      <td><b>${esc(x.title)}</b></td>
      <td>${esc(s[x.sponsor_id])}</td>
      <td>${esc(x.target_city)}${x.target_radius_km ? ` · ${x.target_radius_km} km` : ""}</td>
      <td>${fmtDate(x.start_date)} → ${fmtDate(x.end_date)}</td>
      <td><span class="badge">${esc(x.status)}</span></td>
      <td>${ev[x.id]?.impression || 0}</td>
      <td>${ev[x.id]?.click || 0}</td>
    </tr>
  `).join(""));
}

function renderLogs() {
  rows("logsTable", (cache.error_logs || [])
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .map(x => `
      <tr>
        <td>${fmtDateTime(x.created_at)}</td>
        <td><span class="badge">${esc(x.severity)}</span></td>
        <td>${esc(x.source)}</td>
        <td>${esc(x.action)}</td>
        <td>${esc(x.error_message)}</td>
        <td>${x.is_resolved ? "Risolto" : "Aperto"}</td>
      </tr>
    `).join(""));
}

function renderAll() {
  renderDashboard();
  renderPets();
  renderOwners();
  renderVets();
  renderProfessionals();
  renderSponsors();
  renderRelations();
  renderAppointments();
  renderMedical();
  renderMarketplace();
  renderCampaigns();
  renderLogs();
}

async function ensureAdmin() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  // The SQL policy/function in supabase_admin.sql is the security boundary.
  
  const { data: isAdmin, error } = await sb.rpc("is_admin");
  if (error) throw error;
  if (!isAdmin) {
    await sb.auth.signOut();
    throw new Error("Questo account non è autorizzato all'area amministrativa.");
  }
  return user;
}

async function start() {
  try {
    const user = await ensureAdmin();
    if (!user) return;
    $("#loginView").classList.add("hidden");
    $("#appView").classList.remove("hidden");
    $("#adminEmail").textContent = user.email || "Admin";
    await loadAll();
  } catch (e) {
    $("#loginError").textContent = e.message;
    $("#loginError").classList.remove("hidden");
  }
}

$("#loginForm").addEventListener("submit", async e => {
  e.preventDefault();

  $("#loginError").classList.add("hidden");

  try {
    const email = $("#email").value.trim();
    const password = $("#password").value;

    const { error } = await sb.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      $("#loginError").textContent =
        "❌ Password sbagliata o email non corretta.";

      $("#loginError").classList.remove("hidden");
      $("#password").focus();
      return;
    }

    await start();

  } catch (err) {
    $("#loginError").textContent =
      "❌ Password sbagliata o errore durante l'accesso.";

    $("#loginError").classList.remove("hidden");
    $("#password").focus();
  }
});

$("#logoutBtn").addEventListener("click", () => sb.auth.signOut().then(() => location.reload()));
$("#refreshBtn").addEventListener("click", async () => {
  try {
    await loadAll();
    toast("Dati aggiornati");
  } catch (e) {
    fail(e);
  }
});

$$(".nav-item[data-section]").forEach(b => b.addEventListener("click", () => {
  $$(".nav-item[data-section]").forEach(x => x.classList.remove("active"));
  b.classList.add("active");
  $$(".section").forEach(x => x.classList.remove("active"));
  $("#" + b.dataset.section).classList.add("active");
  $("#pageTitle").textContent = b.querySelector("span").textContent;
}));

$$(".tab").forEach(b => b.addEventListener("click", () => {
  $$(".tab").forEach(x => x.classList.remove("active"));
  b.classList.add("active");
  $$(".relation-pane").forEach(x => x.classList.remove("active"));
  $("#relation" + b.dataset.rel.split("-").map((x, i) => i ? x[0].toUpperCase() + x.slice(1) : x[0].toUpperCase() + x.slice(1)).join("")).classList.add("active");
}));

$$(".search").forEach(input => input.addEventListener("input", () => {
  const t = $("#" + input.dataset.tableSearch);
  const q = input.value.toLowerCase();
  t.querySelectorAll("tbody tr").forEach(r => r.style.display = r.textContent.toLowerCase().includes(q) ? "" : "none");
}));

function csvFor(section) {
  const table = $("#" + section + "Table");
  if (!table) return;
  const data = [...table.querySelectorAll("tr")].map(tr => [...tr.children].map(td => `"${td.innerText.replaceAll('"', '""')}"`).join(","));
  const blob = new Blob(["\ufeff" + data.join("\n")], { type: "text/csv;charset=utf-8" }), a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `pethub-${section}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

$$("[data-export]").forEach(b => b.addEventListener("click", () => csvFor(b.dataset.export)));

$("#resolveAllBtn").addEventListener("click", async () => {
  try {
    const { error } = await sb.from("error_logs").update({ is_resolved: true, resolved_at: new Date().toISOString() }).eq("is_resolved", false);
    if (error) throw error;
    await loadAll();
    toast("Error segnati come risolti");
  } catch (e) {
    fail(e);
  }
});

sb.auth.onAuthStateChange((_event) => {});
start();