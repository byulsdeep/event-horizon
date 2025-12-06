# EVENT HORIZON
### Private Real-Time Telemetry & Communication Uplink

![Version](https://img.shields.io/badge/VERSION-1.0-ff5f1f?style=for-the-badge)
![Status](https://img.shields.io/badge/SYSTEM-OPERATIONAL-000000?style=for-the-badge)
![Tech](https://img.shields.io/badge/REACT-VITE-blue?style=for-the-badge)

> **"The boundary beyond which events cannot affect an observer."**

**Event Horizon** is a private, team-based Progressive Web App (PWA) designed for secure, real-time data transmission. Built with a physics-based UI inspired by the M87 black hole, it prioritizes aesthetics, speed, and data persistence without the bloat of modern frameworks.

---

## 🚀 Operational Capabilities

### 📡 Core Systems
*   **Real-Time Uplink:** Instant messaging and signal transmission powered by **Appwrite Realtime**.
*   **Visual Telemetry:** High-fidelity image sharing with integrated archival downloads.
*   **Signal Persistence:** Messages are stored securely in Appwrite Cloud Database.

### ⚛️ The Singularity Engine (UI/UX)
*   **Dynamic Input:** The "Singularity" send button grows and reacts to the "weight" of your text input (using `transform: scale` physics).
*   **Local Telemetry Caching:** Drafts are saved automatically per room. If you retreat from a channel, your input is restored precisely upon return.
*   **Zero-Flicker Entry:** Smart scrolling and DOM painting logic ensure a seamless visual entry into chat rooms.
*   **Void Aesthetics:** Custom "Glassmorphism" headers, physics-based scrolling, and a stark Black/Orange/Gold palette inspired by the M87 accretion disk.

### 📱 Deployment
*   **PWA Standard:** Fully installable on iOS and Android as a native-feeling app.
*   **Offline Capable:** Caches assets for rapid loading in low-connectivity environments.

---

## 🛠️ Technical Schematic

**Frontend:**
*   React 19
*   Vite (Build Tool)
*   Pure CSS (No frameworks, high performance)

**Backend:**
*   Appwrite Cloud (Auth, Database, Storage)

**Infrastructure:**
*   GitHub Pages (Hosting)

---

## 📂 Directory Structure

```text
Event-Horizon/
├── public/              # Static Assets (Manifest icons, SVGs)
├── src/
│   ├── lib/             # Appwrite Configuration & Constants
│   ├── App.css          # The Core Stylesheet (Void Theme)
│   ├── App.jsx          # Auth & Routing Logic
│   ├── Chat.jsx         # The Message Engine & Logic
│   └── main.jsx         # Entry Point
└── vite.config.js       # PWA & Build Configuration
```

---

## 🔌 Configuration Protocol

1.  **Clone the Coordinates:**
    ```bash
    git clone https://github.com/byulsdeep/event-horizon.git
    cd event-horizon
    ```

**CRITICAL:** This system requires a backend connection. Direct cloning will not yield a functional link until you establish your own coordinates.

2.  **Environment Setup:**
    Create a `.env` file in the project root. Populate it with your specific Appwrite credentials:

    ```env
    VITE_APPWRITE_ENDPOINT="https://cloud.appwrite.io/v1"
    VITE_APPWRITE_PROJECT_ID="[YOUR_PROJECT_ID]"
    VITE_APPWRITE_PROJECT_NAME="Event Horizon"
    VITE_APPWRITE_DATABASE_ID="[YOUR_DATABASE_ID]"
    VITE_APPWRITE_COLLECTION_ID="messages"
    VITE_APPWRITE_BUCKET_ID="[YOUR_STORAGE_BUCKET_ID]"
    VITE_APPWRITE_ADMIN_USER_ID="[YOUR_ADMIN_ID]"
    VITE_APPWRITE_APP_VERSION="1.0"
    ```

3.  **Appwrite Console Setup:**
    *   **Database:** Create a Database and a Collection (ID: `messages`).
    *   **Storage:** Create a Storage Bucket for media.
    *   **Auth:** Enable Email/Password Session.
    *   **Permissions:** Ensure your Collection and Bucket allow `role:team` access for reading and writing data.

4.  **Install Dependencies:**
    ```bash
    npm install
    ```

6.  **Ignite:**
    ```bash
    npm run dev
    ```

---

## 🚀 Deployment Sequence

This project is configured for automated deployment to GitHub Pages.

1.  **Tag Release:**
    ```bash
    git add .
    git commit -m "something"
    git push -u origin <branch-name>
    ```

2.  **Deploy:**
    ```bash
    npm run deploy
    ```

---

## ⚖️ License

**MIT License** - Open for modification and distribution.

> *Transmission End.*