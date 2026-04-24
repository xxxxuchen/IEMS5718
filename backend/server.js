/* eslint-env node */
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();
const crypto = require("crypto");
const multer = require("multer");
const sharp = require("sharp");
const helmet = require("helmet");
const validator = require("validator");
const session = require("express-session");
const cookieParser = require("cookie-parser");
const csurf = require("csurf");
const bcrypt = require("bcrypt");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy if behind Nginx (required for secure cookies)
app.set("trust proxy", 1);

// Security Middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "https://www.paypal.com",
          "https://www.sandbox.paypal.com",
          "https://www.paypalobjects.com",
        ],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: [
          "'self'",
          "data:",
          "/uploads/",
          "https://www.paypal.com",
          "https://www.sandbox.paypal.com",
          "https://www.paypalobjects.com",
        ],
        connectSrc: [
          "'self'",
          "https://www.paypal.com",
          "https://www.sandbox.paypal.com",
          "https://www.paypalobjects.com",
        ],
        frameSrc: [
          "'self'",
          "https://www.paypal.com",
          "https://www.sandbox.paypal.com",
        ],
      },
    },
  }),
);

app.use(cookieParser(process.env.COOKIE_SECRET || "default-cookie-secret"));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "default-session-secret",
    resave: false,
    saveUninitialized: false, // Changed to false for better security
    name: "session_id",
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production", // set to true if using https
      sameSite: "lax",
      maxAge: 3 * 24 * 60 * 60 * 1000, // 3 days
    },
  }),
);

// Middleware to check if user is admin
function isAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.isAdmin) {
    return next();
  }
  res.status(403).json({ error: "Admin access required" });
}

// Middleware to check if user is logged in
function isLoggedIn(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  res.status(401).json({ error: "Login required" });
}

const csrfProtection = csurf({ cookie: true });

const dbPath = path.join(__dirname, "db", "shop.db");
const db = new sqlite3.Database(dbPath);

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function ensureTables() {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS orders (
        order_id INTEGER PRIMARY KEY AUTOINCREMENT,
        userid INTEGER,
        status TEXT NOT NULL,
        currency TEXT NOT NULL,
        merchant_email TEXT NOT NULL,
        salt TEXT NOT NULL,
        digest TEXT NOT NULL,
        total REAL NOT NULL,
        paypal_order_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        paid_at DATETIME,
        FOREIGN KEY (userid) REFERENCES users(userid)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS order_items (
        order_item_id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        pid INTEGER NOT NULL,
        name TEXT NOT NULL,
        price REAL NOT NULL,
        qty INTEGER NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders(order_id),
        FOREIGN KEY (pid) REFERENCES products(pid)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS payments (
        payment_id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        provider TEXT NOT NULL,
        paypal_order_id TEXT,
        capture_id TEXT UNIQUE,
        status TEXT,
        payer_email TEXT,
        amount REAL,
        currency TEXT,
        processed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (order_id) REFERENCES orders(order_id)
      )
    `);

    db.run(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_paypal_order_id ON orders(paypal_order_id)`,
    );
    db.run(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_capture_id ON payments(capture_id)`,
    );
  });
}

ensureTables();

app.use((req, res, next) => {
  if (req.path === "/api/paypal/webhook") return next();
  return csrfProtection(req, res, next);
});

const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.use(
  cors({
    origin: [
      "https://s30.iems5718.iecuhk.cc",
      "http://localhost:5173",
      "http://127.0.0.1:5173",
    ],
    credentials: true,
  }),
);

const PAYPAL_API_BASE =
  process.env.PAYPAL_API_BASE || "https://api-m.sandbox.paypal.com";

let payPalTokenCache = null;

async function getPayPalAccessToken() {
  const now = Date.now();
  if (payPalTokenCache && payPalTokenCache.expiresAt > now + 30_000) {
    return payPalTokenCache.token;
  }

  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("PayPal client credentials missing");
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const resp = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  const data = await resp.json();
  if (!resp.ok) {
    throw new Error("PayPal token request failed");
  }

  payPalTokenCache = {
    token: data.access_token,
    expiresAt: now + (data.expires_in || 0) * 1000,
  };
  return payPalTokenCache.token;
}

function normalizeCartItems(items) {
  if (!Array.isArray(items)) return [];
  const normalized = [];
  for (const it of items) {
    const pid = parseInt(it?.pid, 10);
    const qty = parseInt(it?.qty, 10);
    if (!Number.isInteger(pid) || pid <= 0) return null;
    if (!Number.isInteger(qty) || qty <= 0 || qty > 99) return null;
    normalized.push({ pid, qty });
  }
  const byPid = new Map();
  for (const it of normalized) {
    byPid.set(it.pid, (byPid.get(it.pid) || 0) + it.qty);
  }
  return Array.from(byPid.entries())
    .map(([pid, qty]) => ({ pid, qty }))
    .sort((a, b) => a.pid - b.pid);
}

function computeOrderDigest({ currency, merchantEmail, salt, lines, total }) {
  const parts = [currency, merchantEmail, salt];
  for (const l of lines) {
    parts.push(`${l.pid}:${l.qty}:${Number(l.price).toFixed(2)}`);
  }
  parts.push(Number(total).toFixed(2));
  return crypto.createHash("sha256").update(parts.join("|")).digest("hex");
}

async function verifyWebhookSignature(reqHeaders, webhookEvent) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) return false;

  const transmissionId = reqHeaders["paypal-transmission-id"];
  const transmissionTime = reqHeaders["paypal-transmission-time"];
  const certUrl = reqHeaders["paypal-cert-url"];
  const authAlgo = reqHeaders["paypal-auth-algo"];
  const transmissionSig = reqHeaders["paypal-transmission-sig"];

  if (
    !transmissionId ||
    !transmissionTime ||
    !certUrl ||
    !authAlgo ||
    !transmissionSig
  ) {
    return false;
  }

  const token = await getPayPalAccessToken();
  const resp = await fetch(
    `${PAYPAL_API_BASE}/v1/notifications/verify-webhook-signature`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        transmission_id: transmissionId,
        transmission_time: transmissionTime,
        cert_url: certUrl,
        auth_algo: authAlgo,
        transmission_sig: transmissionSig,
        webhook_id: webhookId,
        webhook_event: webhookEvent,
      }),
    },
  );

  const data = await resp.json();
  return resp.ok && data.verification_status === "SUCCESS";
}

app.post(
  "/api/paypal/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    let webhookEvent;
    try {
      webhookEvent = JSON.parse(req.body.toString("utf8"));
    } catch {
      res.status(400).json({ error: "Invalid JSON" });
      return;
    }

    try {
      const ok = await verifyWebhookSignature(req.headers, webhookEvent);
      if (!ok) {
        res.status(400).json({ error: "Invalid signature" });
        return;
      }

      const eventType = webhookEvent?.event_type;
      if (eventType !== "PAYMENT.CAPTURE.COMPLETED") {
        res.json({ ok: true });
        return;
      }

      const resource = webhookEvent?.resource;
      const captureId = resource?.id;
      const paypalOrderId = resource?.supplementary_data?.related_ids?.order_id;
      const amountValue = resource?.amount?.value;
      const currency = resource?.amount?.currency_code;

      if (!captureId || !paypalOrderId) {
        res.json({ ok: true });
        return;
      }

      const existing = await dbGet(
        "SELECT payment_id FROM payments WHERE capture_id = ?",
        [captureId],
      );
      if (existing) {
        res.json({ ok: true });
        return;
      }

      const order = await dbGet(
        "SELECT * FROM orders WHERE paypal_order_id = ?",
        [paypalOrderId],
      );
      if (!order) {
        res.json({ ok: true });
        return;
      }

      const totalNum = Number(order.total);
      if (
        Number.isFinite(totalNum) &&
        Number.isFinite(Number(amountValue)) &&
        Math.abs(totalNum - Number(amountValue)) > 0.01
      ) {
        res.status(400).json({ error: "Amount mismatch" });
        return;
      }

      await dbRun(
        `INSERT INTO payments (order_id, provider, paypal_order_id, capture_id, status, payer_email, amount, currency)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          order.order_id,
          "paypal",
          paypalOrderId,
          captureId,
          resource?.status || null,
          resource?.payer?.email_address || null,
          Number(amountValue) || null,
          currency || order.currency,
        ],
      );

      await dbRun(
        `UPDATE orders SET status = ?, paid_at = CURRENT_TIMESTAMP WHERE order_id = ?`,
        ["PAID", order.order_id],
      );

      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Webhook handling failed" });
    }
  },
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(uploadsDir));

// Admin Panel Routes
app.use(
  "/admin",
  express.static(path.join(__dirname, "public"), { index: "admin.html" }),
);

// CSRF Token API
app.get("/api/csrf-token", (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

/* ---------- Authentication APIs ---------- */

// login
app.post("/api/login", csrfProtection, (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "Email and password required" });

  db.get("SELECT * FROM users WHERE email = ?", [email], (err, user) => {
    if (err) return res.status(500).json({ error: "Database error" });
    if (!user)
      return res.status(401).json({ error: "Invalid email or password" });

    bcrypt.compare(password, user.password, (err, match) => {
      if (err) return res.status(500).json({ error: "Bcrypt error" });
      if (!match)
        return res.status(401).json({ error: "Invalid email or password" });

      // Rotate session ID upon successful login
      req.session.regenerate((err) => {
        if (err)
          return res.status(500).json({ error: "Session regeneration failed" });

        req.session.user = {
          userid: user.userid,
          email: user.email,
          isAdmin: !!user.isAdmin,
        };
        res.json({ success: true, user: req.session.user });
      });
    });
  });
});

// register
app.post("/api/register", csrfProtection, (req, res) => {
  const { email, password, confirmPassword } = req.body;
  if (!email || !password || !confirmPassword) {
    return res.status(400).json({ error: "All fields are required" });
  }
  if (password !== confirmPassword) {
    return res.status(400).json({ error: "Passwords do not match" });
  }

  // Basic email validation
  if (!validator.isEmail(email)) {
    return res.status(400).json({ error: "Invalid email format" });
  }

  bcrypt.hash(password, 10, (err, hash) => {
    if (err) return res.status(500).json({ error: "Hashing failed" });

    db.run(
      "INSERT INTO users (email, password) VALUES (?, ?)",
      [email, hash],
      function (err) {
        if (err) {
          if (err.message.includes("UNIQUE")) {
            return res.status(400).json({ error: "Email already exists" });
          }
          return res.status(500).json({ error: "Registration failed" });
        }
        res.json({ success: true, userid: this.lastID });
      },
    );
  });
});

// logout
app.post("/api/logout", csrfProtection, (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: "Logout failed" });
    res.clearCookie("session_id");
    res.json({ success: true });
  });
});

// check current user status
app.get("/api/user", (req, res) => {
  if (req.session && req.session.user) {
    res.json({ loggedIn: true, user: req.session.user });
  } else {
    res.json({ loggedIn: false });
  }
});

// change password
app.post("/api/change-password", isLoggedIn, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Current and new password required" });
  }

  const userid = req.session.user.userid;
  db.get(
    "SELECT password FROM users WHERE userid = ?",
    [userid],
    (err, user) => {
      if (err || !user)
        return res.status(500).json({ error: "Database error" });

      bcrypt.compare(currentPassword, user.password, (err, match) => {
        if (err || !match)
          return res.status(401).json({ error: "Incorrect current password" });

        bcrypt.hash(newPassword, 10, (err, hash) => {
          if (err) return res.status(500).json({ error: "Hashing failed" });

          db.run(
            "UPDATE users SET password = ? WHERE userid = ?",
            [hash, userid],
            (err) => {
              if (err) return res.status(500).json({ error: "Update failed" });

              // Logout user after password change
              req.session.destroy(() => {
                res.clearCookie("session_id");
                res.json({
                  success: true,
                  message: "Password changed successfully, please login again",
                });
              });
            },
          );
        });
      });
    },
  );
});

// Apply CSRF protection to all mutation routes

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

function sanitizeText(value) {
  if (typeof value !== "string") return "";
  return validator.escape(validator.trim(value));
}

function sanitizePrice(value) {
  const strVal = String(value);
  if (!validator.isFloat(strVal, { min: 0.01 })) return null;
  return parseFloat(strVal);
}

/* ---------- Category APIs ---------- */

// get all categories
app.get("/api/categories", (req, res) => {
  db.all("SELECT * FROM categories ORDER BY catid", [], (err, rows) => {
    if (err) return res.status(500).json({ error: "Database error" });
    res.json(rows);
  });
});

// add category
app.post("/api/categories", isAdmin, csrfProtection, (req, res) => {
  const name = sanitizeText(req.body.name);
  if (!name || name.length > 50) {
    return res.status(400).json({ error: "Invalid category name" });
  }

  db.run("INSERT INTO categories (name) VALUES (?)", [name], function (err) {
    if (err) return res.status(500).json({ error: "Insert failed" });
    res.json({ success: true, catid: this.lastID });
  });
});

// update category
app.put("/api/categories/:catid", isAdmin, csrfProtection, (req, res) => {
  const catid = parseInt(req.params.catid, 10);
  const name = sanitizeText(req.body.name);

  if (!catid || !name || name.length > 50) {
    return res.status(400).json({ error: "Invalid input" });
  }

  db.run(
    "UPDATE categories SET name = ? WHERE catid = ?",
    [name, catid],
    function (err) {
      if (err) return res.status(500).json({ error: "Update failed" });
      res.json({ success: true, changes: this.changes });
    },
  );
});

// delete category
app.delete("/api/categories/:catid", isAdmin, csrfProtection, (req, res) => {
  const catid = parseInt(req.params.catid, 10);
  if (!catid) return res.status(400).json({ error: "Invalid catid" });

  db.run("DELETE FROM categories WHERE catid = ?", [catid], function (err) {
    if (err) return res.status(500).json({ error: "Delete failed" });
    res.json({ success: true, changes: this.changes });
  });
});

/* ---------- Product APIs ---------- */

// get products by category
app.get("/api/products", (req, res) => {
  const catid = parseInt(req.query.catid, 10);

  if (catid) {
    db.all(
      "SELECT * FROM products WHERE catid = ? ORDER BY pid",
      [catid],
      (err, rows) => {
        if (err) return res.status(500).json({ error: "Database error" });
        res.json(rows);
      },
    );
  } else {
    db.all("SELECT * FROM products ORDER BY pid", [], (err, rows) => {
      if (err) return res.status(500).json({ error: "Database error" });
      res.json(rows);
    });
  }
});

// get product detail
app.get("/api/products/:pid", (req, res) => {
  const pid = parseInt(req.params.pid, 10);
  if (!pid) return res.status(400).json({ error: "Invalid pid" });

  db.get("SELECT * FROM products WHERE pid = ?", [pid], (err, row) => {
    if (err) return res.status(500).json({ error: "Database error" });
    if (!row) return res.status(404).json({ error: "Product not found" });
    res.json(row);
  });
});

// add product with image upload
app.post(
  "/api/products",
  isAdmin,
  csrfProtection,
  upload.single("image"),
  (req, res) => {
    const catid = parseInt(req.body.catid, 10);
    const name = sanitizeText(req.body.name);
    const price = sanitizePrice(req.body.price);
    const description = sanitizeText(req.body.description);

    if (
      !catid ||
      !name ||
      !price ||
      !description ||
      name.length > 100 ||
      description.length > 1000
    ) {
      return res.status(400).json({ error: "Invalid input" });
    }

    db.run(
      `INSERT INTO products (catid, name, price, description, image, image_thumb)
     VALUES (?, ?, ?, ?, '', '')`,
      [catid, name, price, description],
      function (err) {
        if (err) return res.status(500).json({ error: "Insert failed" });

        const pid = this.lastID;

        // if no file uploaded, keep default images
        if (!req.file) {
          db.run(
            `UPDATE products
           SET image = ?, image_thumb = ?
           WHERE pid = ?`,
            ["/uploads/default_large.jpg", "/uploads/default_thumb.jpg", pid],
            (updateErr) => {
              if (updateErr)
                return res.status(500).json({ error: "Update failed" });
              res.json({ success: true, pid });
            },
          );
          return;
        }

        const largeFilename = `${pid}.jpg`;
        const thumbFilename = `${pid}_thumb.jpg`;

        const largePath = path.join(uploadsDir, largeFilename);
        const thumbPath = path.join(uploadsDir, thumbFilename);

        sharp(req.file.buffer)
          .resize(800, 800, { fit: "inside" })
          .jpeg({ quality: 85 })
          .toFile(largePath)
          .then(() => {
            return sharp(req.file.buffer)
              .resize(200, 200, { fit: "cover" })
              .jpeg({ quality: 80 })
              .toFile(thumbPath);
          })
          .then(() => {
            db.run(
              `UPDATE products
             SET image = ?, image_thumb = ?
             WHERE pid = ?`,
              [`/uploads/${largeFilename}`, `/uploads/${thumbFilename}`, pid],
              (updateErr) => {
                if (updateErr) {
                  return res
                    .status(500)
                    .json({ error: "Image path update failed" });
                }
                res.json({ success: true, pid });
              },
            );
          })
          .catch(() => {
            res.status(500).json({ error: "Image processing failed" });
          });
      },
    );
  },
);

// update product
app.put("/api/products/:pid", isAdmin, csrfProtection, (req, res) => {
  const pid = parseInt(req.params.pid, 10);
  const catid = parseInt(req.body.catid, 10);
  const name = sanitizeText(req.body.name);
  const price = sanitizePrice(req.body.price);
  const description = sanitizeText(req.body.description);

  if (
    !pid ||
    !catid ||
    !name ||
    !price ||
    !description ||
    name.length > 100 ||
    description.length > 1000
  ) {
    return res.status(400).json({ error: "Invalid input" });
  }

  db.run(
    `UPDATE products
     SET catid = ?, name = ?, price = ?, description = ?
     WHERE pid = ?`,
    [catid, name, price, description, pid],
    function (err) {
      if (err) return res.status(500).json({ error: "Update failed" });
      res.json({ success: true, changes: this.changes });
    },
  );
});

// delete product
app.delete("/api/products/:pid", isAdmin, csrfProtection, (req, res) => {
  const pid = parseInt(req.params.pid, 10);
  if (!pid) return res.status(400).json({ error: "Invalid pid" });

  const largePath = path.join(uploadsDir, `${pid}.jpg`);
  const thumbPath = path.join(uploadsDir, `${pid}_thumb.jpg`);

  db.run("DELETE FROM products WHERE pid = ?", [pid], function (err) {
    if (err) return res.status(500).json({ error: "Delete failed" });

    if (fs.existsSync(largePath)) fs.unlinkSync(largePath);
    if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);

    res.json({ success: true, changes: this.changes });
  });
});

app.get("/api/paypal/client-id", (req, res) => {
  const clientId = process.env.PAYPAL_CLIENT_ID || "";
  const currency = process.env.PAYPAL_CURRENCY || "USD";
  res.json({ clientId, currency });
});

app.post("/api/checkout/prepare", csrfProtection, async (req, res) => {
  try {
    const items = normalizeCartItems(req.body?.items);
    if (!items || items.length === 0 || items.length > 50) {
      res.status(400).json({ error: "Invalid cart items" });
      return;
    }

    const merchantEmail = process.env.PAYPAL_MERCHANT_EMAIL || "";
    const currency = process.env.PAYPAL_CURRENCY || "USD";
    if (!merchantEmail) {
      res.status(500).json({ error: "Merchant email not configured" });
      return;
    }

    const pids = items.map((i) => i.pid);
    const placeholders = pids.map(() => "?").join(",");
    const products = await dbAll(
      `SELECT pid, name, price FROM products WHERE pid IN (${placeholders})`,
      pids,
    );
    if (products.length !== pids.length) {
      res.status(400).json({ error: "Product not found" });
      return;
    }

    const productMap = new Map(products.map((p) => [p.pid, p]));
    const lines = items.map((i) => ({
      pid: i.pid,
      qty: i.qty,
      price: Number(productMap.get(i.pid).price),
      name: productMap.get(i.pid).name,
    }));

    const total = lines.reduce((sum, l) => sum + l.price * l.qty, 0);
    const salt = crypto.randomBytes(16).toString("hex");
    const digest = computeOrderDigest({
      currency,
      merchantEmail,
      salt,
      lines,
      total,
    });

    const userid = req.session?.user?.userid || null;

    await dbRun("BEGIN TRANSACTION");
    try {
      const orderRes = await dbRun(
        `INSERT INTO orders (userid, status, currency, merchant_email, salt, digest, total)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [userid, "CREATED", currency, merchantEmail, salt, digest, total],
      );

      for (const l of lines) {
        await dbRun(
          `INSERT INTO order_items (order_id, pid, name, price, qty)
           VALUES (?, ?, ?, ?, ?)`,
          [orderRes.lastID, l.pid, l.name, l.price, l.qty],
        );
      }

      await dbRun("COMMIT");
      res.json({
        orderId: orderRes.lastID,
        digest,
        currency,
        total: Number(total.toFixed(2)),
      });
    } catch (e) {
      await dbRun("ROLLBACK");
      throw e;
    }
  } catch {
    res.status(500).json({ error: "Order preparation failed" });
  }
});

app.post("/api/paypal/create-order", csrfProtection, async (req, res) => {
  try {
    const orderId = parseInt(req.body?.orderId, 10);
    const digest = String(req.body?.digest || "");
    if (!orderId || !digest) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }

    const order = await dbGet("SELECT * FROM orders WHERE order_id = ?", [
      orderId,
    ]);
    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    if (order.status === "PAID") {
      res.status(400).json({ error: "Order already paid" });
      return;
    }
    if (order.digest !== digest) {
      res.status(400).json({ error: "Digest mismatch" });
      return;
    }

    const items = await dbAll(
      "SELECT pid, qty, price FROM order_items WHERE order_id = ? ORDER BY pid",
      [orderId],
    );
    const computed = computeOrderDigest({
      currency: order.currency,
      merchantEmail: order.merchant_email,
      salt: order.salt,
      lines: items,
      total: order.total,
    });
    if (computed !== order.digest) {
      res.status(400).json({ error: "Order integrity check failed" });
      return;
    }

    if (order.paypal_order_id) {
      res.json({ paypalOrderId: order.paypal_order_id });
      return;
    }

    const token = await getPayPalAccessToken();
    const resp = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            amount: {
              currency_code: order.currency,
              value: Number(order.total).toFixed(2),
            },
            custom_id: String(orderId),
          },
        ],
      }),
    });

    const data = await resp.json();
    if (!resp.ok || !data?.id) {
      res.status(500).json({ error: "PayPal create order failed" });
      return;
    }

    await dbRun(
      "UPDATE orders SET paypal_order_id = ?, status = ? WHERE order_id = ?",
      [data.id, "PAYPAL_CREATED", orderId],
    );

    res.json({ paypalOrderId: data.id });
  } catch {
    res.status(500).json({ error: "PayPal order creation failed" });
  }
});

app.post("/api/paypal/capture-order", csrfProtection, async (req, res) => {
  try {
    const orderId = parseInt(req.body?.orderId, 10);
    const digest = String(req.body?.digest || "");
    const paypalOrderId = String(req.body?.paypalOrderId || "");
    if (!orderId || !digest || !paypalOrderId) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }

    const order = await dbGet("SELECT * FROM orders WHERE order_id = ?", [
      orderId,
    ]);
    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    if (order.digest !== digest) {
      res.status(400).json({ error: "Digest mismatch" });
      return;
    }
    if (order.paypal_order_id && order.paypal_order_id !== paypalOrderId) {
      res.status(400).json({ error: "PayPal order mismatch" });
      return;
    }

    const token = await getPayPalAccessToken();
    const resp = await fetch(
      `${PAYPAL_API_BASE}/v2/checkout/orders/${paypalOrderId}/capture`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
    );

    const data = await resp.json();
    if (!resp.ok) {
      res.status(500).json({ error: "PayPal capture failed" });
      return;
    }

    const capture = data?.purchase_units?.[0]?.payments?.captures?.[0] || null;
    const captureId = capture?.id || null;
    const status = capture?.status || data?.status || null;
    const payerEmail = data?.payer?.email_address || null;
    const amountValue = capture?.amount?.value || null;
    const currency = capture?.amount?.currency_code || order.currency;

    if (captureId) {
      const existing = await dbGet(
        "SELECT payment_id FROM payments WHERE capture_id = ?",
        [captureId],
      );
      if (!existing) {
        await dbRun(
          `INSERT INTO payments (order_id, provider, paypal_order_id, capture_id, status, payer_email, amount, currency)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            orderId,
            "paypal",
            paypalOrderId,
            captureId,
            status,
            payerEmail,
            amountValue ? Number(amountValue) : null,
            currency,
          ],
        );
      }
    }

    await dbRun(
      `UPDATE orders SET status = ?, paypal_order_id = ?, paid_at = CURRENT_TIMESTAMP WHERE order_id = ?`,
      ["PAID", paypalOrderId, orderId],
    );

    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "PayPal capture failed" });
  }
});

app.get("/api/orders/my", isLoggedIn, async (req, res) => {
  try {
    const userid = req.session.user.userid;
    const orders = await dbAll(
      `SELECT order_id, status, currency, total, paypal_order_id, created_at, paid_at
       FROM orders
       WHERE userid = ?
       ORDER BY datetime(created_at) DESC
       LIMIT 5`,
      [userid],
    );

    if (orders.length === 0) {
      res.json([]);
      return;
    }

    const orderIds = orders.map((o) => o.order_id);
    const placeholders = orderIds.map(() => "?").join(",");
    const items = await dbAll(
      `SELECT order_id, pid, name, price, qty
       FROM order_items
       WHERE order_id IN (${placeholders})
       ORDER BY order_id DESC, pid ASC`,
      orderIds,
    );
    const grouped = new Map();
    for (const it of items) {
      if (!grouped.has(it.order_id)) grouped.set(it.order_id, []);
      grouped.get(it.order_id).push(it);
    }

    res.json(
      orders.map((o) => ({
        ...o,
        items: grouped.get(o.order_id) || [],
      })),
    );
  } catch {
    res.status(500).json({ error: "Failed to load orders" });
  }
});

app.get("/api/admin/orders", isAdmin, async (req, res) => {
  try {
    const orders = await dbAll(
      `SELECT o.order_id, o.userid, o.status, o.currency, o.total, o.paypal_order_id, o.created_at, o.paid_at,
              p.capture_id AS capture_id, p.status AS payment_status, p.payer_email AS payer_email, p.amount AS paid_amount, p.currency AS paid_currency
       FROM orders o
       LEFT JOIN payments p ON p.order_id = o.order_id
       ORDER BY datetime(o.created_at) DESC
       LIMIT 200`,
      [],
    );

    if (orders.length === 0) {
      res.json([]);
      return;
    }

    const orderIds = orders.map((o) => o.order_id);
    const placeholders = orderIds.map(() => "?").join(",");
    const items = await dbAll(
      `SELECT order_id, pid, name, price, qty
       FROM order_items
       WHERE order_id IN (${placeholders})
       ORDER BY order_id DESC, pid ASC`,
      orderIds,
    );
    const grouped = new Map();
    for (const it of items) {
      if (!grouped.has(it.order_id)) grouped.set(it.order_id, []);
      grouped.get(it.order_id).push(it);
    }

    res.json(
      orders.map((o) => ({
        ...o,
        items: grouped.get(o.order_id) || [],
      })),
    );
  } catch {
    res.status(500).json({ error: "Failed to load admin orders" });
  }
});

// Error handling for CSRF
app.use((err, req, res, next) => {
  if (err.code === "EBADCSRFTOKEN") {
    res.status(403).json({ error: "Invalid CSRF token" });
  } else {
    next(err);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
