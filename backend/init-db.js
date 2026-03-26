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
