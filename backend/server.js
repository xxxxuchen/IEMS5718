/* eslint-env node */
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();
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
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "/uploads/"],
        connectSrc: ["'self'"],
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

app.use(csrfProtection);

const dbPath = path.join(__dirname, "db", "shop.db");
const db = new sqlite3.Database(dbPath);

const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.use(
  cors({
    origin: ["https://s30.iems5718.iecuhk.cc"],
    credentials: true,
  }),
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
