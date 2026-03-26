# IEMS5718 Web Programming and Internet Security Project

## 📖 Project Overview

This project is a secure, full-stack e-commerce web application developed for the IEMS5718 course. It features a modern React frontend, a robust Node.js backend, and implements comprehensive security measures against common web vulnerabilities.

**Key Features:**
- 🛒 **Shopping Interface:** Responsive, modern UI built with React.
- 🛍️ **Shopping Cart:** AJAX-powered cart with `localStorage` persistence.
- 🛡️ **Admin Panel:** Secure dashboard for category and product management.
- 🖼️ **Image Processing:** Automatic image resizing and thumbnail generation.
- 🔒 **Security Hardened:** Protection against XSS, SQL Injection, and CSRF.

---

## 🌐 Live URLs

- **Main Website (HTTPS):** [https://s30.iems5718.iecuhk.cc/](https://s30.iems5718.iecuhk.cc/)
- **Admin Panel:** [https://s30.iems5718.iecuhk.cc/admin/](https://s30.iems5718.iecuhk.cc/admin/)
- **API Endpoint Example:** [https://s30.iems5718.iecuhk.cc/api/categories](https://s30.iems5718.iecuhk.cc/api/categories)

---

## 🛠️ Tech Stack

### Frontend
- **Framework:** React 18, Vite
- **Styling:** Custom CSS with responsive design
- **State Management:** React Context API

### Backend
- **Runtime:** Node.js (v20+)
- **Framework:** Express.js
- **Database:** SQLite3 (Parameterized Queries)
- **Authentication:** `express-session`, `bcrypt`
- **Security:** `helmet`, `csurf`, `validator`
- **File Handling:** `multer`, `sharp`

### DevOps & Infrastructure
- **Server:** AWS EC2 (Ubuntu)
- **Reverse Proxy:** Nginx
- **Process Manager:** PM2
- **SSL/TLS:** Let's Encrypt (Certbot)
- **Deployment:** Automated Bash Script (`deploy.sh`)

---

## 🛡️ Security Implementation

This project strictly adheres to web security best practices:
1. **XSS Protection:** Implemented Content Security Policy (CSP) via `helmet` and input sanitization using `validator`.
2. **SQL Injection Prevention:** 100% usage of Parameterized Queries in SQLite.
3. **CSRF Protection:** Synchronizer Token Pattern implemented using `csurf`.
4. **Secure Authentication:** Passwords hashed with `bcrypt`. Session IDs are rotated upon login.
5. **Secure Cookies:** `httpOnly`, `SameSite=lax`, and `Secure` flags are enforced in production.
6. **HTTPS Only:** Nginx enforces automatic HTTP to HTTPS redirection.

---

## 📁 Project Structure

```text
iems5718/
├── src/                  # React frontend components and context
├── backend/
│   ├── db/               # SQLite database file (shop.db)
│   ├── public/           # Admin panel static files (admin.html, admin.js)
│   ├── uploads/          # Product images and thumbnails
│   ├── init-db.js        # Database initialization script
│   ├── server.js         # Express server and API routes
│   └── .env              # Cryptographically secure secrets (not in VCS)
├── deploy.sh             # Automated deployment script for EC2
├── vite.config.js        # Vite configuration and proxy setup
└── package.json          # Frontend dependencies
```

---

## 🚀 How to Run Locally

### 1. Backend Setup

```bash
# Navigate to the backend directory
cd backend

# Install dependencies
npm install

# Initialize the SQLite database (creates db/shop.db)
npm run init-db

# Create a .env file based on the required secrets (SESSION_SECRET, CSRF_SECRET)
# Start the development server
npm start
```
*Backend runs on `http://localhost:3000`*

### 2. Frontend Setup

```bash
# Open a new terminal in the project root
cd iems5718

# Install dependencies
npm install

# Start the Vite development server
npm run dev
```
*Frontend runs on `http://localhost:5173`*

### Local Access URLs
- **Main Site:** [http://localhost:5173/](http://localhost:5173/)
- **Admin Panel:** [http://localhost:3000/admin/](http://localhost:3000/admin/)

---

## 🚢 Deployment

The project includes an automated deployment script (`deploy.sh`) that handles building the frontend, packaging the backend, transferring files via SCP/Rsync to the AWS EC2 instance, installing production dependencies, and restarting PM2 and Nginx.

```bash
# with the correct SSH key and permissions
./deploy.sh
```
