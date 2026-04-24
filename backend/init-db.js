const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const dbDir = path.join(__dirname, "db");
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, "shop.db");
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run("DROP TABLE IF EXISTS products");
  db.run("DROP TABLE IF EXISTS categories");
  db.run("DROP TABLE IF EXISTS users");
  db.run("DROP TABLE IF EXISTS order_items");
  db.run("DROP TABLE IF EXISTS payments");
  db.run("DROP TABLE IF EXISTS orders");

  db.run(`
    CREATE TABLE users (
      userid INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      isAdmin INTEGER DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE categories (
      catid INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE products (
      pid INTEGER PRIMARY KEY AUTOINCREMENT,
      catid INTEGER NOT NULL,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      description TEXT,
      image TEXT,
      image_thumb TEXT,
      FOREIGN KEY (catid) REFERENCES categories(catid)
    )
  `);

  db.run(`
    CREATE TABLE orders (
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
    CREATE TABLE order_items (
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
    CREATE TABLE payments (
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

  db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_paypal_order_id ON orders(paypal_order_id)`);
  db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_capture_id ON payments(capture_id)`);

  db.run(`INSERT INTO categories (name) VALUES (?)`, ["Electronics"]);
  db.run(`INSERT INTO categories (name) VALUES (?)`, ["Accessories"]);

  db.run(`INSERT INTO users (email, password, isAdmin) VALUES (?, ?, ?)`, [
    "admin@example.com",
    "$2b$10$OneNnWnU25dE55z1E7Wvlub5EVU2GChqdWvE/UNB3ooNET2vMKylK",
    1,
  ]);
  db.run(`INSERT INTO users (email, password, isAdmin) VALUES (?, ?, ?)`, [
    "user@example.com",
    "$2b$10$ugM5WKxpOPZzIx.T59xjl.bfhK/c.0C.OMEe6sjsKda6ANUUoj1Oi",
    0,
  ]);

  db.run(
    `INSERT INTO products (catid, name, price, description, image, image_thumb)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      1,
      "Wireless Headphones",
      99,
      "High-quality wireless headphones with noise cancellation.",
      "/uploads/default_large.jpg",
      "/uploads/default_thumb.jpg",
    ],
  );

  db.run(
    `INSERT INTO products (catid, name, price, description, image, image_thumb)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      1,
      "Digital Camera",
      399,
      "Capture stunning photos with this compact digital camera.",
      "/uploads/default_large.jpg",
      "/uploads/default_thumb.jpg",
    ],
  );

  db.run(
    `INSERT INTO products (catid, name, price, description, image, image_thumb)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      2,
      "Smart Watch",
      149,
      "A smart watch to track your fitness and daily activities.",
      "/uploads/default_large.jpg",
      "/uploads/default_thumb.jpg",
    ],
  );

  db.run(
    `INSERT INTO products (catid, name, price, description, image, image_thumb)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      2,
      "Phone Case",
      29,
      "A protective phone case with a clean design.",
      "/uploads/default_large.jpg",
      "/uploads/default_thumb.jpg",
    ],
  );
});

db.close(() => {
  console.log("Database initialized at:", dbPath);
});
