import { supabase } from '../../utils/supabaseClient.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../js/config.js';
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
  setTimeout(() => t.classList.remove("show"), 6000);
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

function approvalStatus(isApproved) {
  return isApproved
    ? '<span class="badge badge-approved">Approvato</span>'
    : '<span class="badge badge-pending">Non approvato</span>';
}

function adminDeleteBtn(userId, label) {
  const safeUserId = esc(userId);
  const safeLabel = esc(label);
  return `<button type="button" class="btn btn-approval btn-delete-admin"
    data-admin-delete="${safeUserId}"
    data-delete-label="${safeLabel}"
    title="Elimina record creato dall'admin">✕ Elimina</button>`;
}

function adminEditBtn(userId, label) {
  const safeUserId = esc(userId);
  const safeLabel = esc(label);
  return `<button type="button" class="btn btn-approval btn-edit-admin"
    data-admin-edit="${safeUserId}"
    data-edit-label="${safeLabel}"
    title="Modifica record creato dall'admin">✎ Modifica</button>`;
}

function adminActions(userId, label) {
  return `<div class="approval-controls">${adminEditBtn(userId, label)} ${adminDeleteBtn(userId, label)}</div>`;
}

function approvalControls(table, userId, isApproved, label) {
const safeUserId = esc(userId);
  const safeLabel = esc(label);
 return `
   <div class="approval-controls" aria-label="Gestione approvazione ${safeLabel}">
     <button type="button" class="btn btn-approval btn-approve"
      data-approval-table="${table}" data-user-id="${safeUserId}"
       data-approved="true" ${isApproved ? "disabled" : ""}>✓ Approva</button>
     <button type="button" class="btn btn-approval btn-reject"
       data-approval-table="${table}" data-user-id="${safeUserId}"
       data-approved="false" ${!isApproved ? "disabled" : ""}>✕ Rifiuta</button>
   </div>
 `;
}

function normalizeSortValue(value) {
  const text = String(value ?? "").trim();

  if (!text || text === "—") return "";

  // Valori booleani / stato
  const lower = text.toLowerCase();

  if (lower === "sì" || lower === "si" || lower === "yes" || lower === "true") {
    return 1;
  }

  if (lower === "no" || lower === "false") {
    return 0;
  }

  // Data italiana: 31/12/2026 oppure 31/12/2026, 14:30
  const dateMatch = text.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,\s*(\d{1,2}):(\d{2}))?$/
  );

  if (dateMatch) {
    const [
      ,
      day,
      month,
      year,
      hour = "0",
      minute = "0"
    ] = dateMatch;

    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute)
    ).getTime();
  }

  // Valori numerici / monetari
  const numeric = text
    .replace(/[€$]/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");

  if (numeric && !Number.isNaN(Number(numeric))) {
    return Number(numeric);
  }

  return lower;
}


function sortTable(table, columnIndex, direction) {
  const tbody = table.querySelector("tbody");

  if (!tbody) return;

  const rows = [...tbody.querySelectorAll("tr")];

  rows.sort((a, b) => {
    const aCell = a.children[columnIndex];
    const bCell = b.children[columnIndex];

    if (!aCell || !bCell) return 0;

    const aValue = normalizeSortValue(aCell.innerText);
    const bValue = normalizeSortValue(bCell.innerText);

    if (aValue === bValue) return 0;

    if (aValue === "") return 1;
    if (bValue === "") return -1;

    if (typeof aValue === "number" && typeof bValue === "number") {
      return direction === "asc"
        ? aValue - bValue
        : bValue - aValue;
    }

    return direction === "asc"
      ? String(aValue).localeCompare(String(bValue), "it", {
          numeric: true,
          sensitivity: "base"
        })
      : String(bValue).localeCompare(String(aValue), "it", {
          numeric: true,
          sensitivity: "base"
        });
  });

  rows.forEach(row => tbody.appendChild(row));
}


function filterTableColumn(table, columnIndex, value) {
  const tbody = table.querySelector("tbody");

  if (!tbody) return;

  const filter = String(value || "").trim().toLowerCase();

  tbody.querySelectorAll("tr").forEach(row => {
    const cell = row.children[columnIndex];

    if (!cell) return;

    const text = cell.innerText.toLowerCase();

    row.style.display =
      !filter || text.includes(filter)
        ? ""
        : "none";
  });
}


function createColumnControls(table) {
  const headers = table.querySelectorAll("thead th");

  headers.forEach((th, columnIndex) => {

    if (th.dataset.columnControls === "skip") return;

    // Evita di creare i controlli più volte
    if (th.querySelector(".column-controls")) return;

    const originalText = th.innerText.trim();

    th.innerHTML = `
      <div class="th-title">
        <span>${esc(originalText)}</span>

        <div class="sort-buttons">
          <button
            type="button"
            class="sort-btn"
            data-sort="asc"
            title="Ordine crescente"
          >↑</button>

          <button
            type="button"
            class="sort-btn"
            data-sort="desc"
            title="Ordine decrescente"
          >↓</button>
        </div>
      </div>

      <div class="column-controls">
        <input
          type="text"
          class="column-filter"
          placeholder="Filtra…"
          aria-label="Filtra ${esc(originalText)}"
        >
      </div>
    `;

    const filterInput = th.querySelector(".column-filter");

    filterInput.addEventListener("input", () => {
      filterTableColumn(
        table,
        columnIndex,
        filterInput.value
      );
    });

    th.querySelectorAll(".sort-btn").forEach(button => {
      button.addEventListener("click", event => {
        event.stopPropagation();

        const direction = button.dataset.sort;

        sortTable(
          table,
          columnIndex,
          direction
        );

        // Evidenzia il tipo di ordinamento attivo
        th.querySelectorAll(".sort-btn").forEach(btn => {
          btn.classList.remove("active");
        });

        button.classList.add("active");
      });
    });
  });
}


function setupTableControls() {
  document.querySelectorAll("table").forEach(table => {
    // Non aggiungiamo i controlli alle tabelle che non hanno tbody
    if (!table.querySelector("thead") || !table.querySelector("tbody")) {
      return;
    }

    createColumnControls(table);
  });
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

  rows("ownersTable", (cache.profiles || []).filter(x => petCount[x.id] || rolesBy[x.id]?.length || x.created_via === "admin").map(x => `
    <tr>
      <td><b>${esc(nameOf(x))}</b></td>
      <td>${esc(x.email)}</td>
      <td>${esc(x.telefono)}</td>
      <td>${esc(x.citta)}</td>
      <td>${petCount[x.id] || 0}</td>
      <td>${(rolesBy[x.id] || []).map(r => `<span class="badge">${esc(r)}</span>`).join(" ") || "—"}</td>
      <td>${x.created_via === "admin" ? adminActions(x.id, nameOf(x)) : ""}</td>
    </tr>
  `).join(""));
}

function renderVets() {
  const p = profileMap(), pc = {};

  (cache.veterinarian_patients || [])
    .filter(x => x.status === "active")
    .forEach(x => {
      pc[x.veterinarian_id] = (pc[x.veterinarian_id] || 0) + 1;
    });

  rows("vetsTable", (cache.veterinarians || []).map(x => {
    const u = p[x.user_id];

    return `
      <tr>
        <td><b>${esc(nameOf(u))}</b></td>
        <td>${esc(u?.email)}</td>
        <td>${esc(u?.telefono)}</td>
        <td>${esc(x.numero_ordine)}</td>
        <td>${x.is_available_now ? '<span class="badge">Sì</span>' : 'No'}</td>
        <td>${pc[x.user_id] || 0}</td>
        <td>${approvalStatus(x.is_approved)}</td>
        <td>${approvalControls("veterinarians", x.user_id, x.is_approved, nameOf(u))} ${u?.created_via ===
           "admin" ? `<div class="approval-controls">${adminEditBtn(x.user_id, nameOf(u))} ${adminDeleteBtn(x.user_id, nameOf(u))}</div>` : ""}</td>
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
        <td>${u?.created_via === "admin" ? adminActions(x.user_id, nameOf(u)) : ""}</td>
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
    const u = p[x.user_id];

    return `
      <tr>
        <td><b>${esc(x.nome_azienda)}</b></td>
        <td>${esc(x.partita_iva)}</td>
        <td>${esc(nameOf(u))}</td>
        <td>${esc(u?.email)}</td>
        <td>${cc[x.user_id] || 0}</td>
        <td>${approvalStatus(x.is_approved)}</td>
        <td>${approvalControls("sponsors", x.user_id, x.is_approved, x.nome_azienda)} ${u?.created_via ===
           "admin" ? `<div class="approval-controls">${adminEditBtn(x.user_id, x.nome_azienda)} ${adminDeleteBtn(x.user_id, x.nome_azienda)}</div>` : ""}</td>
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

  // Relazione Proprietario + Animale + Veterinario
  const vetPatients = cache.veterinarian_patients || [];
  $("#relationPropPetVet tbody").innerHTML = vetPatients.map(x => {
    const pet = pets[x.pet_id];
    const owner = p[pet?.owner_id];
    const vet = p[x.veterinarian_id];
    return `
      <tr>
        <td>${esc(nameOf(owner))}</td>
        <td>${esc(pet?.nome)}</td>
        <td>${esc(nameOf(vet))}</td>
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

function renderWalks() {
  const p = profileMap();
  const pets = Object.fromEntries((cache.pets || []).map(x => [x.id, x]));

  // Raggruppa i partecipanti per walk_id (walk_participants: walk_id, pet_id, owner_id)
  const participantsByWalk = {};
  (cache.walk_participants || []).forEach(wp => {
    (participantsByWalk[wp.walk_id] ??= []).push(wp);
  });

  rows(
    "walksTable",
    (cache.walks || []).map(x => {
      const creator = p[x.creator_id];
      const parts = participantsByWalk[x.id] || [];

      const petEntries = parts
        .map(wp => {
          const pet = pets[wp.pet_id];
          const petOwner = p[wp.owner_id];
          return pet ? `${pet.nome}${petOwner ? ` (${nameOf(petOwner)})` : ""}` : null;
        })
        .filter(Boolean)
        .join(", ");

      return `
        <tr>
          <td><b>${esc(x.titolo || x.id)}</b></td>
          <td>${esc(nameOf(creator))}</td>
          <td>${esc(petEntries || "—")}</td>
          <td>${fmtDateTime(x.data_passeggiata)}</td>
          <td>${esc(x.livello)}</td>
          <td>${x.lunghezza_km != null ? `${esc(x.lunghezza_km)} km` : "—"}</td>
        </tr>
      `;
    }).join("")
  );
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
  renderWalks();
  renderLogs();

  // Attiva filtri e ordinamento su tutte le tabelle
  setupTableControls();
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

/* =========================================
   MODALE INSERIMENTO RECORD
   ========================================= */

async function callCreateRecord(type, values) {
  const { data: { session } } = await sb.auth.getSession();
  const url = `${SUPABASE_URL}/functions/v1/admin-create-record`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${session?.access_token}`,
      "apikey": SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ type, values }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || `Errore ${response.status}`);
  }

  return data;
}

async function callUpdateRecord(userId, type, values) {
  const { data: { session } } = await sb.auth.getSession();
  const url = `${SUPABASE_URL}/functions/v1/admin-update-record`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${session?.access_token}`,
      "apikey": SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ userId, type, values }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || `Errore ${response.status}`);
  }

  return data;
}

const formDefs = {
  owner: {
    title: "Nuovo proprietario",
    fields: [
      { name: "nome", label: "Nome", type: "text", required: true },
      { name: "cognome", label: "Cognome", type: "text", required: true },
      { name: "email", label: "Email", type: "email", required: true },
      { name: "telefono", label: "Telefono", type: "text", required: true },
      { name: "citta", label: "Città", type: "text", required: true },
      { name: "data_nascita", label: "Data nascita", type: "date" },
      { name: "indirizzo", label: "Indirizzo", type: "text" },
      { name: "cap", label: "CAP", type: "text" }
    ]
  },
  vet: {
    title: "Nuovo veterinario",
    fields: [
      { name: "nome", label: "Nome", type: "text", required: true },
      { name: "cognome", label: "Cognome", type: "text", required: true },
      { name: "email", label: "Email", type: "email", required: true },
      { name: "telefono", label: "Telefono", type: "text", required: true },
      { name: "citta", label: "Città", type: "text", required: true },
      { name: "numero_ordine", label: "Numero ordine", type: "text", required: true }
    ]
  },
  professional: {
    title: "Nuovo professionista",
    fields: [
      { name: "nome", label: "Nome", type: "text", required: true },
      { name: "cognome", label: "Cognome", type: "text", required: true },
      { name: "email", label: "Email", type: "email", required: true },
      { name: "telefono", label: "Telefono", type: "text", required: true },
      { name: "citta", label: "Città", type: "text", required: true },
      { name: "tipo_professione", label: "Tipo professione", type: "text", required: true },
      { name: "tariffa_oraria", label: "Tariffa oraria (€)", type: "number" }
    ]
  },
  sponsor: {
    title: "Nuovo sponsor",
    fields: [
      { name: "nome", label: "Nome referente", type: "text", required: true },
      { name: "cognome", label: "Cognome referente", type: "text", required: true },
      { name: "email", label: "Email", type: "email", required: true },
      { name: "telefono", label: "Telefono", type: "text", required: true },
      { name: "citta", label: "Città", type: "text", required: true },
      { name: "nome_azienda", label: "Nome azienda", type: "text", required: true },
      { name: "partita_iva", label: "Partita IVA", type: "text", required: true }
    ]
  }
};

function buildFormFields(type, mode, prefill) {
  const def = formDefs[type];
  if (!def) return "";
  let html = "";
  for (let i = 0; i < def.fields.length; i += 2) {
    const f1 = def.fields[i];
    const f2 = def.fields[i + 1];
    if (f2) {
      html += `<div class="form-row">`;
      html += fieldHTML(f1, prefill);
      html += fieldHTML(f2, prefill);
      html += `</div>`;
    } else {
      html += fieldHTML(f1, prefill);
    }
  }
  const btnLabel = mode === "edit" ? "Aggiorna" : "Salva";
  return html + `
    <div id="modalError" class="modal-error hidden"></div>
    <div class="modal-footer">
      <button type="button" class="btn" id="modalCancelBtn">Annulla</button>
      <button type="submit" class="btn btn-primary">${btnLabel}</button>
    </div>`;
}

function fieldHTML(f, prefill) {
  const req = f.required ? "required" : "";
  const step = f.type === "number" ? 'step="0.01"' : "";
  const val = prefill && prefill[f.name] != null ? `value="${esc(String(prefill[f.name]))}"` : "";
  return `<label>${esc(f.label)}
    <input type="${f.type}" name="${f.name}" ${req} ${step} ${val} placeholder="${esc(f.label)}">
  </label>`;
}

function openModal(type, mode = "create", prefill = null, editUserId = null) {
  const def = formDefs[type];
  if (!def) return;
  const title = mode === "edit"
    ? "Modifica " + def.title.replace(/^Nuovo /, "")
    : def.title;
  $("#modalTitle").textContent = title;
  $("#recordForm").innerHTML = buildFormFields(type, mode, prefill);
  $("#recordForm").dataset.entityType = type;
  $("#recordForm").dataset.mode = mode;
  if (editUserId) $("#recordForm").dataset.editUserId = editUserId;
  $("#recordModal").classList.remove("hidden");
  const firstInput = $("#recordForm input");
  if (firstInput) firstInput.focus();
}

function openEditModal(userId, type) {
  const p = profileMap();
  let profile = p[userId];
  let extra = {};

  if (type === "vet") {
    const v = (cache.veterinarians || []).find(x => x.user_id === userId);
    extra.numero_ordine = v?.numero_ordine || "";
  } else if (type === "professional") {
    const pr = (cache.professionals || []).find(x => x.user_id === userId);
    extra.tipo_professione = pr?.tipo_professione || "";
    extra.tariffa_oraria = pr?.tariffa_oraria ?? "";
  } else if (type === "sponsor") {
    const s = (cache.sponsors || []).find(x => x.user_id === userId);
    extra.nome_azienda = s?.nome_azienda || "";
    extra.partita_iva = s?.partita_iva || "";
  }

  const prefill = {
    nome: profile?.nome || "",
    cognome: profile?.cognome || "",
    email: profile?.email || "",
    telefono: profile?.telefono || "",
    citta: profile?.citta || "",
    data_nascita: profile?.data_nascita || "",
    indirizzo: profile?.indirizzo || "",
    cap: profile?.cap || "",
    ...extra,
  };

  openModal(type, "edit", prefill, userId);
}

function closeModal() {
  $("#recordModal").classList.add("hidden");
  $("#recordForm").innerHTML = "";
}

document.addEventListener("click", e => {
  const btn = e.target.closest("[data-create]");
  if (btn) openModal(btn.dataset.create, "create");
});

document.addEventListener("click", e => {
  const btn = e.target.closest("[data-admin-edit]");
  if (btn) openEditModal(btn.dataset.adminEdit, guessEditType(btn));
});

function guessEditType(btn) {
  const section = btn.closest(".section");
  if (!section) return "owner";
  const id = section.id;
  if (id === "vets") return "vet";
  if (id === "professionals") return "professional";
  if (id === "sponsors") return "sponsor";
  return "owner";
}

document.addEventListener("click", e => {
  if (e.target.id === "modalCloseBtn" || e.target.id === "modalCancelBtn") closeModal();
});

document.addEventListener("click", e => {
  if (e.target.id === "recordModal") closeModal();
});

document.addEventListener("keydown", e => {
  if (e.key === "Escape" && !$("#recordModal").classList.contains("hidden")) closeModal();
});

$("#recordForm").addEventListener("submit", async e => {
  e.preventDefault();
  const form = e.target;
  const type = form.dataset.entityType;
  const def = formDefs[type];
  if (!def) return;

  const errEl = form.querySelector("#modalError");
  errEl.classList.add("hidden");

  const values = {};
  for (const f of def.fields) {
    const input = form.querySelector(`[name="${f.name}"]`);
    values[f.name] = input ? input.value.trim() : "";
    if (f.required && !values[f.name]) {
      errEl.textContent = `Il campo "${f.label}" è obbligatorio.`;
      errEl.classList.remove("hidden");
      input?.focus();
      return;
    }
  }

  const submitBtn = form.querySelector('[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = "Salvataggio…";

  try {
    if (form.dataset.mode === "edit") {
      await callUpdateRecord(form.dataset.editUserId, type, values);
      closeModal();
      await loadAll();
      toast("Record aggiornato.");
    } else {
      await callCreateRecord(type, values);
      closeModal();
      await loadAll();
      toast(`Record creato. Email con credenziali inviata a ${values.email}`);
    }
  } catch (err) {
    errEl.textContent = err?.message || "Errore durante il salvataggio.";
    errEl.classList.remove("hidden");
    submitBtn.disabled = false;
    submitBtn.textContent = "Salva";
  }
});

async function setApproval(table, userId, isApproved) {
  const { data, error } = await sb
    .from(table)
    .update({
      is_approved: isApproved
    })
    .eq("user_id", userId)
    .select("user_id, is_approved")
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
  throw new Error(
    "Aggiornamento bloccato: la policy Supabase non consente alla dashboard di modificare questo record."
  );
}

  if (data.is_approved !== isApproved) {
    throw new Error("Il database non ha salvato la modifica.");
  }

  const profile = (cache.profiles || []).find(x => x.id === userId);

const ruolo = table === "veterinarians"
  ? "veterinario"
  : "sponsor";

const nome = ruolo === "veterinario"
  ? nameOf(profile)
  : (cache.sponsors || []).find(x => x.user_id === userId)?.nome_azienda;

const { error: emailError } = await sb.functions.invoke(
  "send-account-status-email",
  {
    body: {
      email: profile?.email,
      nome,
      ruolo,
      isApproved
    }
  }
);

if (emailError) {
  console.error("Profilo aggiornato, ma email non inviata:", emailError);
}

  await loadAll();

  toast(
    isApproved
      ? "Approvazione salvata."
      : "Rifiuto salvato."
  );
}

document.addEventListener("click", async event => {
  const button = event.target.closest("[data-approval-table]");
  if (!button || button.disabled) return;

 try {
    button.disabled = true;
    await setApproval(button.dataset.approvalTable, button.dataset.userId, button.dataset.approved === "true");
  } catch (error) {
   fail(error);
    button.disabled = false;
  }
});

document.addEventListener("click", async event => {
  const btn = event.target.closest("[data-admin-delete]");
  if (!btn || btn.disabled) return;

  const userId = btn.dataset.adminDelete;
  const label = btn.dataset.deleteLabel || "questo record";

  if (!confirm(`Sei sicuro di voler eliminare ${label}? L'azione è irreversibile.`)) return;

  btn.disabled = true;
  btn.textContent = "Eliminazione…";

  try {
    const { data: { session } } = await sb.auth.getSession();
    const response = await fetch(`${SUPABASE_URL}/functions/v1/admin-delete-record`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session?.access_token}`,
        "apikey": SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ userId }),
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Errore eliminazione");

    await loadAll();
    toast("Record eliminato.");
  } catch (err) {
    fail(err);
    btn.disabled = false;
    btn.textContent = "✕ Elimina";
  }
});


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