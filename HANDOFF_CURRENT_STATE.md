# HANDOFF - STATO ATTUALE DEL PROGETTO & SPECIFICA PROSSIMA ETAPA

**Data aggiornamento**: 2026-09-20  
**Ultimo stato implementativo**: Tarjetas preprogramadas con token fijo + Bloqueo por sesión de escaneo (completado)  
**Database**: MariaDB / MySQL locale (`pardinitec_vantaggi_test` verificato), migrazioni applicate fino alla `0017`.

---

## 1. Stato Esatto Attuale del Sistema

### 1.1 Tarjetas NFC Preprogramadas con Token Fijo (Completado)
- **Ciclo di vita fisso**:
  - Il Super Admin genera e assegna lotti di tessere (`createCardInInventory` / `createBatchInInventory` / `assignCardsToBusiness`), emettendo la credenziale fisica permanente con token a 32 byte cifrato AES-256-GCM e hash SHA-256 memorizzato (`loyalty_account_id` inizialmente `NULL`).
  - **Attivazione al banco senza rotazione**: `activateCard` in `CardService.php` aggiorna atomicamente `loyalty_account_id` sulla credenziale fisica esistente via `updatePhysicalCredentialLinks` senza generare né revocare il token stampato sulla tessera.
  - **Sospensione e Riattivazione conservativa**: `suspendCard` sospende la credenziale; `reactivateCard` riattiva direttamente la credenziale esistente (`reactivatePhysicalCredentialForCard`) conservando il token senza richiedere riprogrammazione.
  - **Sostituzione sicura**: `replaceCard` revoca la vecchia tessera (`replaced`) e collega la nuova tessera preprogrammata alla stessa `loyalty_account`, mantenendo intatta la credenziale digitale e lo storico contabile.
  - **Pannello di attivazione operatore in `/c/{token}`**: quando un operatore autenticato del punto vendita apre una tessera vergine (`state: 'issued'`, `can_activate: true`), visualizza il pannello rapido per cercare un cliente, selezionare il conto fedeltà e attivare la carta in 1 clic.

### 1.2 Una Sola Acreditación por Apertura / Escaneo (Bloqueo por Escaneo - Completado)
- **`scan_session_id`**: generato univocamente ad ogni apertura della scheda `/c/{token}`.
- **Blocco operativo immediato**: dopo il successo di qualsiasi accredito (`+1 pt`, `+5 pt`, `+10 pt`, `Altro importo`, o `Da acquisto`), tutti i controlli di accredito vengono disabilitati e nascosti.
- **Messaggio canonico visualizzato**:
  > *"Punti registrati correttamente. Rimuovi e riavvicina la carta per effettuare una nuova operazione."*
- **Sblocco automatico**: una nuova apertura (nuovo tocco NFC o scansione QR) genera un nuovo `scan_session_id` e riabilita i controlli.
- **Idempotenza garantita**: ogni chiamata include `operation_id` correlato alla sessione, impedendo doppi accrediti da retry HTTP o doppi clic.

### 1.3 Separazione Prodotti & Archiviazione
- Prodotti segregati: Punti, Vantaggi, VIP (mai più "Offerte Vantaggi & VIP" unificate).
- Eliminazione fisica se 0 utilizzi storici; archiviazione in "Contenuti archiviati" se presenti utilizzi storici.
- Vantaggio testuale libero (`text`) senza percentuale né importo obbligatorio.
- Accredito rapido nel Dashboard e nella Ficha Operativa `/c/{token}` con isolamento multi-tenant rigoroso (403 Forbidden per cross-tenant).

### 1.4 Suite di Test e Build
- **Vitest**: 17 suite di test / **87 test unitari e di integrazione superati con successo (100% OK)**.
- **Build Frontend**: `npm run build` completata con 0 errori TypeScript e bundle Vite generato.
- **Lint Backend**: `php -l` eseguito con 0 errori su tutti i file PHP.
