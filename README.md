# Pardinitec Vantaggi

Sistema di fidelizzazione e vantaggi aziendali Pardinitec Vantaggi.

## Stato del Progetto

**ETAPA 1:** Struttura iniziale e configurazione dell'ambiente di base completata.
Nessuna logica di business, autenticazione o database è ancora implementata.

---

## Architettura

- **Frontend**: React + TypeScript + Vite (senza Tailwind, senza dipendenze superflue).
- **Backend**: PHP 8.x configurato come monolito modulare con standard PSR-4 via Composer.
- **Autoloading Backend**: Namespace `App\` mappato su `src/`.
- **Database (futuro)**: MySQL / InnoDB (struttura predisposta in `database/migrations`).
- **API Base URL**: `/api/v1/`.
- **Separazione**: Frontend e Backend completamente disaccoppiati.

---

## Struttura delle Cartelle

```text
vantaggi/
├── frontend/                     # Applicazione React + TypeScript con Vite
│   ├── src/
│   │   ├── App.tsx               # Schermata iniziale: Pardinitec Vantaggi / Sistema in preparazione
│   │   ├── App.css
│   │   ├── index.css
│   │   └── main.tsx
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
├── api/                          # Backend PHP 8.x Monolito Modulare
│   ├── public/
│   │   └── index.php             # Entrypoint con endpoint GET /api/v1/health
│   ├── src/
│   │   ├── Core/                 # Componenti trasversali del sistema
│   │   │   ├── Auth/
│   │   │   ├── Database/
│   │   │   ├── Http/
│   │   │   ├── Security/
│   │   │   └── Events/
│   │   └── Modules/              # Moduli di business (predisposti)
│   │       ├── Businesses/
│   │       ├── Customers/
│   │       ├── Cards/
│   │       ├── Points/
│   │       ├── Rewards/
│   │       ├── Offers/
│   │       ├── Vip/
│   │       ├── Campaigns/
│   │       └── Automations/
│   ├── config/                   # File di configurazione futura
│   └── composer.json             # Configurazione Composer PSR-4 ("App\\": "src/")
├── database/
│   └── migrations/               # Predisposizione per migrazioni future (MySQL/InnoDB)
├── .gitignore
└── README.md
```

---

## Avvio in Sviluppo

### 1. Frontend

```bash
cd frontend
npm install
npm run dev
```

### 2. Backend (API)

```bash
cd api
php -S localhost:8000 -t public
```

---

## Endpoint di Verifica (Health Check)

- **Richiesta**: `GET /api/v1/health`
- **Risposta JSON (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Pardinitec Vantaggi API",
    "status": "ok"
  }
  ```
