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

## Modelo Funcional: Perfiles y Cuentas de Fidelización (Contrato Técnico v7)

> **Decisión Arquitectónica Fundamental:**
> **Punti**, **Vantaggi** y **VIP** **NO** son niveles acumulativos ni representan una progresión obligatoria. Son perfiles y programas de fidelización completamente independientes.

### Reglas Clave:
1. **Multi-cuenta por perfiles distintos**: Dentro del mismo negocio, un cliente puede tener:
   - solamente cuenta **Punti**;
   - solamente cuenta **Vantaggi**;
   - solamente cuenta **VIP**;
   - o múltiples cuentas activas simultáneamente (ej. **Punti + VIP**).
2. **Aislamiento de cuenta**: Cada `loyalty_account` pertenece a un único perfil (`card_profile_id`). Posee su propio saldo, historial y credencial de acceso.
3. **Unicidad por perfil**: Restricción MariaDB `UNIQUE KEY (business_id, customer_id, card_profile_id)`. Se impide únicamente que un cliente tenga dos cuentas del mismo perfil dentro del mismo negocio.
4. **Vistas de credencial según perfil**:
   - Una credencial **VIP** expone exclusivamente contenido VIP. No incluye Punti ni Vantaggi.
   - Una credencial **Punti** expone exclusivamente el saldo y movimientos de puntos.
   - Una credencial **Vantaggi** expone sus beneficios y contenidos habilitados.
5. **Máximo una credencial digital activa por cuenta**: Cada `loyalty_account` puede tener como máximo **una** credencial digital activa (`status = 'active'`). Para sustituirla debe utilizarse obligatoriamente la rotación segura (`rotate`), marcando la anterior como `replaced`.
6. **Seguridad y permisos**:
   - `/api/v1/card-profiles` requiere sesión autenticada.
   - El personal autorizado con rol `staff` en el comercio dispone de los permisos necesarios (`customer.edit`) para realizar el onboarding presencial de clientes.

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
