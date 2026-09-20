# HANDOFF - STATO ATTUALE DEL PROGETTO (UX & SEPARAZIONE PRODOTTI)

Data aggiornamento: 2026-09-20
Stato: Completata la semplificazione definitiva della UX, la separazione rigorosa dei prodotti Punti, Vantaggi e VIP, e il rafforzamento dei controlli di sicurezza e capacità.

---

## 1. Separazione Rigorosa dei 3 Prodotti

La vecchia voce unificata "Offerte Vantaggi & VIP" è stata **completamente eliminata**. I tre prodotti sono ora navigabili e gestibili in modo distinto in base al piano contrattualizzato e ai permessi operatore:

1. **Punti**:
   - **Accredito punti** (`/dashboard/points`): Schermata intuitiva per esercenti e personale con ricerca clienti per nome, cognome, telefono, email o ID numerico diretto (`#925`), calcolo automatico dei punti da importo scontrino, rettifica manuale (per ruoli abilitati), selettore del conto (se multipli) e storico completo delle transazioni del punto vendita con causale, saldo e variazione (`+pt` / `-pt`).
   - **Premi con punti** (`/dashboard/rewards`): Gestione esclusiva del catalogo premi riscattabili con punti fedeltà. Forzato su profilo `punti`, senza menu a tendina o confusione di profili.
2. **Vantaggi** (`/dashboard/vantaggi`):
   - Gestione promozioni e sconti riservati ai clienti Vantaggi (`+ Nuovo vantaggio`).
   - Input numerico per lo sconto con step centesimale (`step="0.01"`).
   - Checkbox opzionale *"Mostra anche ai clienti VIP"* visibile solo se il negozio ha il modulo VIP abilitato (`target_audience = 'vantaggi_vip'`).
   - Modalità di riscatto/verifica promozioni in cassa con ricerca cliente e validazione immediata.
3. **VIP** (`/dashboard/vip`):
   - Gestione benefici ed esperienze riservate ai clienti VIP (`+ Nuovo beneficio VIP`).
   - Sezione dedicata per le promozioni esclusive VIP e vista separata delle promozioni Vantaggi condivise con i VIP.
   - Modalità di applicazione beneficio rapida in cassa.

---

## 2. Architettura Backend & API

### Controlli di Capacità (CapabilityService)
Tutti gli endpoint applicano controlli di capability per garantire che i negozi non possano gestire o accedere a moduli non contrattualizzati (restituendo HTTP 403):
- **Punti**: `points` (per accredito, calcolo e storico transazioni) e `rewards` (per catalogo premi).
- **Vantaggi**: `offers` (per promozioni Vantaggi).
- **VIP**: `vip_offers` (per benefici VIP) e verifica congiunta per `vantaggi_vip`.

### Nuovi Endpoint & Miglioramenti
- **`GET /api/v1/businesses/{id}/points/transactions`**: Restituisce la cronologia paginata delle transazioni di punti registrate per l'esercizio commerciale, con ID cliente, nome, telefono, profilo e operatore.
- **Ricerca Clienti**: Ricerca ottimizzata che riconosce se il parametro è un ID cliente numerico esatto (`ctype_digit`), trovando istantaneamente il cliente per ID o eseguendo ricerca parziale per testo.
- **Calcolo Punti**: L'endpoint `/points/calculate` restituisce sia `calculated_points` sia `points` per compatibilità retroattiva, validando la presenza di regole attive.
- **Calcolo Progresso Premio**: Calcolo uniforme della percentuale di avanzamento verso il prossimo premio: `min(100, max(0, floor(($balance / $cost) * 100)))`.

---

## 3. Frontend & UX

- **Gestione CSRF & Sessioni**: `client.ts` gestisce il rinnovo automatico del token CSRF (retry trasparente su scadenza 403) con messaggi di errore localizzati e comprensibili in italiano.
- **Badge ID Cliente**:
  - `QrModal`: visualizzazione in chiaro dell'ID Cliente (`ID Cliente: #925`) nell'intestazione e nel layout di stampa del biglietto cartaceo.
  - `PublicCardPage`: visualizzazione badge ID cliente per agevolare il riconoscimento visivo al banco da parte degli operatori.
- **Overview & Layout**:
  - `DashboardLayout.tsx` e `OverviewPage.tsx` mostrano esclusivamente i tab contrattualizzati (`Clienti`, `Accredito punti`, `Premi con punti`, `Vantaggi`, `VIP`, `Carte fisiche`, `Membri`, `Campagne`, `Impostazioni`).

---

## 4. Verifica e Integrità

- **Frontend**: 15 file di test / 72 test unitari superati con successo (`vitest run`). Build Vite e TypeScript completata con 0 errori (`tsc -b && vite build`).
- **Backend**: Sintassi PHP validata (`php -l`) su tutti i file modificati (0 errori).
- **Sicurezza**: Nessun token o chiave crittografica (`TOKEN_ENCRYPTION_KEY`, `.env`, backup `.sql`) esposto o tracciato nei commit.
