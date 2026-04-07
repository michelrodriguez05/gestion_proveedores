const express = require("express");
const session = require("express-session");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const { parse } = require("csv-parse/sync");

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, "data", "proveedores.db");

const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "proveedores-secret-2026",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 8 },
  })
);
app.use(express.static(path.join(__dirname, "public")));

const db = new sqlite3.Database(DB_PATH);

const SUPPLIER_FIELDS = [
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

const HEADER_ALIASES = {
  codigo_sap: ["codigo_sap", "cod sap", "codigo sap", "cod_sap"],
  razon_social: ["razon_social", "razon social"],
  nombre_comercial: ["nombre_comercial", "nombre comercial"],
  contacto_comercial: ["contacto_comercial", "contacto comercial"],
  cargo_comercial: ["cargo_comercial", "cargo comercial"],
  correo_electronico: ["correo_electronico", "correo electronico", "correo"],
  telefono_fijo: ["telefono_fijo", "telefono fijo", "fijo", "tel fijo"],
  extension: ["extension", "ext"],
  celular: ["celular", "movil"],
  ciudad: ["ciudad"],
  cobertura_despacho: ["cobertura_despacho", "cobertura de despacho", "despacha", "cobertura"],
  categoria: ["categoria"],
  materiales: ["materiales"],
  servicios: ["servicios"],
  marca: ["marca"],
  contacto_facturacion: ["contacto_facturacion", "contacto facturacion"],
  correo_facturacion: ["correo_facturacion", "correo de facturacion", "correo facturacion"],
  telefono_facturacion: ["telefono_facturacion", "telefono de facturacion", "telefono facturacion"],
};

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function cleanCell(value) {
  return String(value || "")
    .replace(/\r?\n+/g, " | ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCity(value) {
  const v = normalizeText(value);
  if (["b/manga", "bmanga", "bucaramanga"].includes(v)) return "Bucaramanga";
  if (v === "bogota" || v === "bogota d.c.") return "Bogota";
  return cleanCell(value);
}

function normalizeCoverage(value) {
  const v = normalizeText(value);
  if (v.includes("todo el pais") || v.includes("nacional")) return "TODO EL PAIS";
  return cleanCell(value);
}

function resolveSourceKey(raw, aliases) {
  const sourceKeys = Object.keys(raw || {});
  const sourceByNormalized = new Map(sourceKeys.map((k) => [normalizeText(k), k]));
  for (const alias of aliases) {
    const found = sourceByNormalized.get(normalizeText(alias));
    if (found) return found;
  }
  return null;
}

function mapRawToSupplier(raw) {
  const row = {};
  SUPPLIER_FIELDS.forEach((field) => {
    const source = resolveSourceKey(raw, HEADER_ALIASES[field] || [field]);
    row[field] = cleanCell(source ? raw[source] : "");
  });
  row.ciudad = normalizeCity(row.ciudad);
  row.cobertura_despacho = normalizeCoverage(row.cobertura_despacho);
  return row;
}

function initDb() {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('admin', 'provider'))
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS suppliers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo_sap TEXT,
        razon_social TEXT NOT NULL,
        nombre_comercial TEXT NOT NULL,
        contacto_comercial TEXT,
        cargo_comercial TEXT,
        correo_electronico TEXT,
        telefono_fijo TEXT,
        extension TEXT,
        celular TEXT,
        ciudad TEXT NOT NULL,
        cobertura_despacho TEXT NOT NULL,
        categoria TEXT NOT NULL,
        materiales TEXT,
        servicios TEXT,
        marca TEXT,
        contacto_facturacion TEXT,
        correo_facturacion TEXT,
        telefono_facturacion TEXT,
        searchable_text TEXT NOT NULL,
        created_by_role TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run("CREATE INDEX IF NOT EXISTS idx_suppliers_city ON suppliers(ciudad)");
    db.run("CREATE INDEX IF NOT EXISTS idx_suppliers_coverage ON suppliers(cobertura_despacho)");
    db.run("CREATE INDEX IF NOT EXISTS idx_suppliers_search ON suppliers(searchable_text)");
  });
}

function ensureDefaultUsers() {
  const defaults = [
    { username: "admin", password: "1234", role: "admin" },
    { username: "proveedor", password: "1234", role: "provider" },
  ];

  defaults.forEach((u) => {
    db.get("SELECT id FROM users WHERE username = ?", [u.username], async (err, row) => {
      if (err || row) return;
      const hash = await bcrypt.hash(u.password, 10);
      db.run("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)", [
        u.username,
        hash,
        u.role,
      ]);
    });
  });
}

function buildSearchableText(supplier) {
  return normalizeText(
    SUPPLIER_FIELDS.map((f) => supplier[f] || "")
      .join(" ")
      .replace(/\s+/g, " ")
  );
}

function validateSupplier(input) {
  const required = ["razon_social", "nombre_comercial", "ciudad", "cobertura_despacho", "categoria"];
  const missing = required.filter((f) => !String(input[f] || "").trim());
  return missing;
}

function requireAuth(role) {
  return (req, res, next) => {
    if (!req.session.user) return res.status(401).json({ error: "No autenticado" });
    if (role && req.session.user.role !== role) {
      return res.status(403).json({ error: "Sin permisos" });
    }
    next();
  };
}

app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body;
  db.get("SELECT * FROM users WHERE username = ?", [username], async (err, user) => {
    if (err || !user) return res.status(401).json({ error: "Credenciales invalidas" });
    const ok = await bcrypt.compare(String(password || ""), user.password_hash);
    if (!ok) return res.status(401).json({ error: "Credenciales invalidas" });
    req.session.user = { id: user.id, username: user.username, role: user.role };
    res.json({ user: req.session.user });
  });
});

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/auth/session", (req, res) => {
  res.json({ user: req.session.user || null });
});

app.get("/api/suppliers", (req, res) => {
  const query = String(req.query.q || "");
  const terms = normalizeText(query)
    .split(/\s+/)
    .filter(Boolean);

  let sql = `
    SELECT id, razon_social, nombre_comercial, ciudad, categoria, cobertura_despacho, contacto_comercial, correo_electronico, celular, correo_facturacion, telefono_facturacion
    FROM suppliers
    WHERE 1=1
  `;
  const params = [];
  terms.forEach((term) => {
    sql += " AND searchable_text LIKE ? ";
    params.push(`%${term}%`);
  });

  const cityTerm = terms.find((term) => term.length >= 3);
  if (cityTerm) {
    sql += `
      AND (
        searchable_text LIKE ?
        OR cobertura_despacho LIKE '%TODO EL PAIS%'
        OR cobertura_despacho LIKE '%NACIONAL%'
      )
    `;
    params.push(`%${cityTerm}%`);
  }

  sql += " ORDER BY razon_social ASC LIMIT 300";

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: "Error en busqueda" });
    res.json(rows);
  });
});

app.get("/api/suppliers/:id", (req, res) => {
  db.get("SELECT * FROM suppliers WHERE id = ?", [req.params.id], (err, row) => {
    if (err || !row) return res.status(404).json({ error: "Proveedor no encontrado" });
    res.json(row);
  });
});

app.post("/api/suppliers", requireAuth(), (req, res) => {
  if (!["admin", "provider"].includes(req.session.user.role)) {
    return res.status(403).json({ error: "Sin permisos" });
  }

  const supplier = {};
  SUPPLIER_FIELDS.forEach((f) => {
    supplier[f] = String(req.body[f] || "").trim();
  });
  const missing = validateSupplier(supplier);
  if (missing.length) return res.status(400).json({ error: `Faltan campos: ${missing.join(", ")}` });

  const searchableText = buildSearchableText(supplier);
  db.run(
    `
    INSERT INTO suppliers (
      codigo_sap, razon_social, nombre_comercial, contacto_comercial, cargo_comercial,
      correo_electronico, telefono_fijo, extension, celular, ciudad, cobertura_despacho,
      categoria, materiales, servicios, marca, contacto_facturacion, correo_facturacion,
      telefono_facturacion, searchable_text, created_by_role
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    [
      supplier.codigo_sap,
      supplier.razon_social,
      supplier.nombre_comercial,
      supplier.contacto_comercial,
      supplier.cargo_comercial,
      supplier.correo_electronico,
      supplier.telefono_fijo,
      supplier.extension,
      supplier.celular,
      supplier.ciudad,
      supplier.cobertura_despacho,
      supplier.categoria,
      supplier.materiales,
      supplier.servicios,
      supplier.marca,
      supplier.contacto_facturacion,
      supplier.correo_facturacion,
      supplier.telefono_facturacion,
      searchableText,
      req.session.user.role,
    ],
    function onInsert(err) {
      if (err) return res.status(500).json({ error: "No se pudo guardar" });
      res.status(201).json({ id: this.lastID });
    }
  );
});

app.put("/api/suppliers/:id", requireAuth("admin"), (req, res) => {
  const supplier = {};
  SUPPLIER_FIELDS.forEach((f) => {
    supplier[f] = String(req.body[f] || "").trim();
  });
  const missing = validateSupplier(supplier);
  if (missing.length) return res.status(400).json({ error: `Faltan campos: ${missing.join(", ")}` });

  db.run(
    `
    UPDATE suppliers
    SET codigo_sap = ?, razon_social = ?, nombre_comercial = ?, contacto_comercial = ?, cargo_comercial = ?,
        correo_electronico = ?, telefono_fijo = ?, extension = ?, celular = ?, ciudad = ?, cobertura_despacho = ?,
        categoria = ?, materiales = ?, servicios = ?, marca = ?, contacto_facturacion = ?, correo_facturacion = ?,
        telefono_facturacion = ?, searchable_text = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `,
    [
      supplier.codigo_sap,
      supplier.razon_social,
      supplier.nombre_comercial,
      supplier.contacto_comercial,
      supplier.cargo_comercial,
      supplier.correo_electronico,
      supplier.telefono_fijo,
      supplier.extension,
      supplier.celular,
      supplier.ciudad,
      supplier.cobertura_despacho,
      supplier.categoria,
      supplier.materiales,
      supplier.servicios,
      supplier.marca,
      supplier.contacto_facturacion,
      supplier.correo_facturacion,
      supplier.telefono_facturacion,
      buildSearchableText(supplier),
      req.params.id,
    ],
    function onUpdate(err) {
      if (err) return res.status(500).json({ error: "No se pudo actualizar" });
      if (!this.changes) return res.status(404).json({ error: "Proveedor no encontrado" });
      res.json({ ok: true });
    }
  );
});

app.post("/api/suppliers/import", requireAuth("admin"), upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Archivo requerido" });
  const name = req.file.originalname.toLowerCase();
  let rows = [];

  try {
    if (name.endsWith(".json")) {
      rows = JSON.parse(req.file.buffer.toString("utf-8"));
    } else if (name.endsWith(".csv") || name.endsWith(".tsv") || name.endsWith(".txt")) {
      const text = req.file.buffer.toString("utf-8");
      const delimiter = text.includes("\t") ? "\t" : ",";
      rows = parse(req.file.buffer.toString("utf-8"), {
        columns: true,
        skip_empty_lines: true,
        delimiter,
      });
    } else {
      return res.status(400).json({ error: "Formato no soportado. Usa CSV, TSV, TXT o JSON" });
    }
  } catch (_e) {
    return res.status(400).json({ error: "Archivo invalido" });
  }

  if (!Array.isArray(rows) || !rows.length) {
    return res.status(400).json({ error: "No hay registros para importar" });
  }

  let inserted = 0;
  db.serialize(() => {
    const stmt = db.prepare(`
      INSERT INTO suppliers (
        codigo_sap, razon_social, nombre_comercial, contacto_comercial, cargo_comercial,
        correo_electronico, telefono_fijo, extension, celular, ciudad, cobertura_despacho,
        categoria, materiales, servicios, marca, contacto_facturacion, correo_facturacion,
        telefono_facturacion, searchable_text, created_by_role
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'admin')
    `);

    rows.forEach((raw) => {
      const row = mapRawToSupplier(raw);
      if (validateSupplier(row).length) return;
      stmt.run([
        row.codigo_sap,
        row.razon_social,
        row.nombre_comercial,
        row.contacto_comercial,
        row.cargo_comercial,
        row.correo_electronico,
        row.telefono_fijo,
        row.extension,
        row.celular,
        row.ciudad,
        row.cobertura_despacho,
        row.categoria,
        row.materiales,
        row.servicios,
        row.marca,
        row.contacto_facturacion,
        row.correo_facturacion,
        row.telefono_facturacion,
        buildSearchableText(row),
      ]);
      inserted += 1;
    });
    stmt.finalize((err) => {
      if (err) return res.status(500).json({ error: "Error importando datos" });
      res.json({ inserted });
    });
  });
});

app.get("/health", (_req, res) => res.json({ ok: true }));

initDb();
ensureDefaultUsers();

const sampleCsv = path.join(__dirname, "data", "proveedores-ejemplo.csv");
if (!fs.existsSync(sampleCsv)) {
  const header = `${SUPPLIER_FIELDS.join(",")}\n`;
  fs.writeFileSync(sampleCsv, header);
}

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Servidor activo en http://localhost:${PORT}`);
});
