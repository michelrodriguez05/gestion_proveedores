const fields = [
  "codigo_sap",
  "razon_social",
  "nombre_comercial",
  "contacto_comercial",
  "cargo_comercial",
  "correo_electronico",
  "telefono_fijo",
  "extension",
  "celular",
  "ciudad",
  "cobertura_despacho",
  "categoria",
  "materiales",
  "servicios",
  "marca",
  "contacto_facturacion",
  "correo_facturacion",
  "telefono_facturacion",
];

const labels = {
  codigo_sap: "Codigo SAP",
  razon_social: "Razon social",
  nombre_comercial: "Nombre comercial",
  contacto_comercial: "Contacto comercial",
  cargo_comercial: "Cargo comercial",
  correo_electronico: "Correo electronico",
  telefono_fijo: "Telefono fijo",
  extension: "Extension",
  celular: "Celular",
  ciudad: "Ciudad",
  cobertura_despacho: "Cobertura de despacho",
  categoria: "Categoria",
  materiales: "Materiales",
  servicios: "Servicios",
  marca: "Marca",
  contacto_facturacion: "Contacto facturacion",
  correo_facturacion: "Correo facturacion",
  telefono_facturacion: "Telefono facturacion",
};

const required = ["razon_social", "nombre_comercial", "ciudad", "cobertura_despacho", "categoria"];
let currentRole = null;
let loginIntent = "admin";
let selectedIds = new Set();
let resultRows = [];
let searchTimer = null;
let currentView = "public";

function q(id) {
  return document.getElementById(id);
}

function renderForm(formId) {
  const form = q(formId);
  form.innerHTML = `<div class="form-grid">${fields
    .map(
      (f) =>
        `<label>${labels[f]}${required.includes(f) ? " *" : ""}<input name="${f}" /></label>`
    )
    .join("")}</div>`;
}

renderForm("supplierForm");
renderForm("providerForm");

async function fetchSession() {
  const r = await fetch("/api/auth/session");
  const data = await r.json();
  currentRole = data.user?.role || null;
  q("logoutBtn").classList.toggle("hidden", !currentRole);
}

function setView(view) {
  currentView = view;
  q("publicSearchPanel").classList.toggle("hidden", view !== "public");
  q("publicDetailPanel").classList.toggle("hidden", view !== "public");
  q("adminPanel").classList.toggle("hidden", view !== "admin");
  q("providerPanel").classList.toggle("hidden", view !== "provider");
}

function openLoginFor(intent) {
  loginIntent = intent;
  q("modalTitle").textContent =
    intent === "admin" ? "Acceso Administrador" : "Acceso Proveedor Nuevo";
  q("modal").classList.remove("hidden");
}

async function searchSuppliers() {
  const text = q("searchInput").value.trim();
  q("searchState").textContent = "Buscando...";
  q("searchState").classList.add("loading");
  const r = await fetch(`/api/suppliers?q=${encodeURIComponent(text)}`);
  const rows = await r.json();
  resultRows = rows;
  selectedIds = new Set();
  updateSelectedCount();
  const tbody = q("resultsTable").querySelector("tbody");
  tbody.innerHTML = "";
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.dataset.id = String(row.id);
    tr.innerHTML = `
      <td><input type="checkbox" class="row-selector" data-id="${row.id}" /></td>
      <td>${row.razon_social || ""}</td>
      <td>${row.nombre_comercial || ""}</td>
      <td>${row.ciudad || ""}</td>
      <td>${row.categoria || ""}</td>
      <td>${row.contacto_comercial || ""}</td>
      <td>${row.correo_electronico || ""}</td>
      <td>${row.celular || ""}</td>
    `;
    tr.onclick = (event) => {
      if (event.target.classList.contains("row-selector")) return;
      loadDetail(row.id);
    };
    tbody.appendChild(tr);
  });

  document.querySelectorAll(".row-selector").forEach((checkbox) => {
    checkbox.addEventListener("change", (event) => {
      const id = Number(event.target.dataset.id);
      if (event.target.checked) {
        selectedIds.add(id);
      } else {
        selectedIds.delete(id);
      }
      const row = event.target.closest("tr");
      row.classList.toggle("selected", event.target.checked);
      updateSelectedCount();
    });
  });

  q("searchState").classList.remove("loading");
  q("searchState").textContent = rows.length
    ? `${rows.length} resultados encontrados.`
    : "No se encontraron resultados.";
}

function updateSelectedCount() {
  q("selectedCount").textContent = `${selectedIds.size} seleccionados`;
}

function splitContactValues(value) {
  return String(value || "")
    .split(/[|,;\n\r\s]+/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function collectFromSelection(field) {
  const selectedRows = resultRows.filter((row) => selectedIds.has(row.id));
  const values = selectedRows.flatMap((row) => splitContactValues(row[field]));
  return [...new Set(values)];
}

async function copyToClipboard(values, emptyMessage) {
  if (!values.length) return alert(emptyMessage);
  const text = values.join("; ");
  await navigator.clipboard.writeText(text);
  alert("Copiado al portapapeles");
}

async function loadDetail(id) {
  const r = await fetch(`/api/suppliers/${id}`);
  if (!r.ok) return;
  const item = await r.json();
  q("detailBox").classList.remove("empty");
  q("detailBox").innerHTML = `
    <h3>Informacion general</h3>
    <p><strong>${labels.codigo_sap}:</strong> ${item.codigo_sap || "-"}</p>
    <p><strong>${labels.razon_social}:</strong> ${item.razon_social || "-"}</p>
    <p><strong>${labels.nombre_comercial}:</strong> ${item.nombre_comercial || "-"}</p>
    <p><strong>${labels.ciudad}:</strong> ${item.ciudad || "-"}</p>
    <p><strong>${labels.cobertura_despacho}:</strong> ${item.cobertura_despacho || "-"}</p>
    <p><strong>${labels.categoria}:</strong> ${item.categoria || "-"}</p>

    <h3>Contactos</h3>
    <p><strong>${labels.contacto_comercial}:</strong> ${item.contacto_comercial || "-"}</p>
    <p><strong>${labels.cargo_comercial}:</strong> ${item.cargo_comercial || "-"}</p>
    <p><strong>${labels.contacto_facturacion}:</strong> ${item.contacto_facturacion || "-"}</p>

    <h3>Correos y telefonos</h3>
    <p><strong>${labels.correo_electronico}:</strong> ${item.correo_electronico || "-"}</p>
    <p><strong>${labels.correo_facturacion}:</strong> ${item.correo_facturacion || "-"}</p>
    <p><strong>${labels.telefono_fijo}:</strong> ${item.telefono_fijo || "-"}</p>
    <p><strong>${labels.extension}:</strong> ${item.extension || "-"}</p>
    <p><strong>${labels.celular}:</strong> ${item.celular || "-"}</p>
    <p><strong>${labels.telefono_facturacion}:</strong> ${item.telefono_facturacion || "-"}</p>

    <h3>Productos y servicios</h3>
    <p><strong>${labels.materiales}:</strong> ${item.materiales || "-"}</p>
    <p><strong>${labels.servicios}:</strong> ${item.servicios || "-"}</p>
    <p><strong>${labels.marca}:</strong> ${item.marca || "-"}</p>
  `;
}

function formData(formId) {
  const form = q(formId);
  const data = {};
  fields.forEach((f) => {
    data[f] = form.querySelector(`[name="${f}"]`).value.trim();
  });
  return data;
}

function loadToForm(formId, data) {
  const form = q(formId);
  fields.forEach((f) => {
    form.querySelector(`[name="${f}"]`).value = data[f] || "";
  });
}

function validate(data) {
  const missing = required.filter((k) => !data[k]);
  if (missing.length) {
    alert(`Faltan campos: ${missing.map((m) => labels[m]).join(", ")}`);
    return false;
  }
  return true;
}

async function saveSupplier(formId) {
  const payload = formData(formId);
  if (!validate(payload)) return;
  const r = await fetch("/api/suppliers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const res = await r.json();
  if (!r.ok) return alert(res.error || "Error guardando");
  alert("Proveedor guardado correctamente.");
  searchSuppliers();
}

q("saveBtn").onclick = () => saveSupplier("supplierForm");
q("providerSaveBtn").onclick = () => saveSupplier("providerForm");

q("loadForEdit").onclick = async () => {
  const id = q("editId").value;
  if (!id) return alert("Ingresa un ID");
  const r = await fetch(`/api/suppliers/${id}`);
  const data = await r.json();
  if (!r.ok) return alert(data.error || "No encontrado");
  loadToForm("supplierForm", data);
  q("updateBtn").dataset.id = id;
  q("updateBtn").classList.remove("hidden");
};

q("updateBtn").onclick = async () => {
  const id = q("updateBtn").dataset.id;
  const payload = formData("supplierForm");
  if (!validate(payload)) return;
  const r = await fetch(`/api/suppliers/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await r.json();
  if (!r.ok) return alert(data.error || "Error actualizando");
  alert("Proveedor actualizado correctamente.");
  searchSuppliers();
};

q("importBtn").onclick = async () => {
  const file = q("importFile").files[0];
  if (!file) return alert("Selecciona archivo CSV o JSON");
  const fd = new FormData();
  fd.append("file", file);
  const r = await fetch("/api/suppliers/import", { method: "POST", body: fd });
  const data = await r.json();
  if (!r.ok) return alert(data.error || "Error importando");
  alert(`Importacion completada. Registros importados: ${data.inserted}.`);
  searchSuppliers();
};

q("adminBtn").onclick = () => {
  if (currentRole === "admin") {
    setView("admin");
    return;
  }
  openLoginFor("admin");
};

q("providerBtn").onclick = () => {
  if (currentRole === "provider") {
    setView("provider");
    return;
  }
  openLoginFor("provider");
};

q("closeModal").onclick = () => q("modal").classList.add("hidden");

q("loginSubmit").onclick = async () => {
  const username = q("userInput").value.trim();
  const password = q("passInput").value.trim();
  const r = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await r.json();
  if (!r.ok) return alert(data.error || "Error de autenticacion");
  if (data.user.role !== loginIntent) {
    alert("Este acceso no corresponde al tipo de boton seleccionado.");
    await fetch("/api/auth/logout", { method: "POST" });
    return;
  }
  q("modal").classList.add("hidden");
  q("userInput").value = "";
  q("passInput").value = "";
  fetchSession();
  setView(loginIntent);
};

q("logoutBtn").onclick = async () => {
  await fetch("/api/auth/logout", { method: "POST" });
  currentRole = null;
  fetchSession();
  setView("public");
};

q("backFromAdmin").onclick = () => setView("public");
q("backFromProvider").onclick = () => setView("public");

q("searchInput").addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(searchSuppliers, 260);
});
q("copyEmailsBtn").onclick = () =>
  copyToClipboard(
    collectFromSelection("correo_electronico"),
    "Selecciona proveedores con correo comercial para copiar."
  );
q("copyBillingEmailsBtn").onclick = () =>
  copyToClipboard(
    collectFromSelection("correo_facturacion"),
    "Selecciona proveedores con correo de facturacion para copiar."
  );
q("copyPhonesBtn").onclick = () =>
  copyToClipboard(collectFromSelection("celular"), "Selecciona proveedores con celular para copiar.");

fetchSession();
setView("public");
searchSuppliers();
