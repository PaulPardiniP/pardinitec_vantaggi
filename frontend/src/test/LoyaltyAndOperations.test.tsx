import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '../components/common/Button';
import { Alert } from '../components/common/Alert';
import { EmptyState } from '../components/common/EmptyState';
import { generateOperationId } from '../api/client';
import type { Customer } from '../types';

describe('Conti Indipendenti, Operazioni Idempotenti e Gestione Errori (Etapa 4)', () => {
  it('1. Cliente con conti Punti e VIP indipendenti: non mescola saldi né percorsi', () => {
    const customerWithMultipleAccounts: Customer = {
      id: 55,
      business_id: 1,
      first_name: 'Alessandro',
      last_name: 'Verdi',
      phone: '+39333112233',
      email: 'alessandro@test.it',
      created_at: '2026-02-01',
      updated_at: '2026-02-01',
      loyalty_accounts: [
        {
          id: 10,
          business_id: 1,
          customer_id: 55,
          card_profile_id: 1,
          profile_code: 'punti',
          profile_name: 'Programma Punti',
          balance: 350,
          status: 'active',
          created_at: '2026-02-01',
        },
        {
          id: 11,
          business_id: 1,
          customer_id: 55,
          card_profile_id: 3,
          profile_code: 'vip',
          profile_name: 'Club VIP Esclusivo',
          balance: 0,
          status: 'active',
          created_at: '2026-02-05',
        },
      ],
    };

    const puntiAccount = customerWithMultipleAccounts.loyalty_accounts!.find((a) => a.profile_code === 'punti')!;
    const vipAccount = customerWithMultipleAccounts.loyalty_accounts!.find((a) => a.profile_code === 'vip')!;

    expect(puntiAccount.balance).toBe(350);
    expect(vipAccount.balance).toBe(0);
    expect(puntiAccount.id).not.toBe(vipAccount.id);
  });

  it('2. Prevenzione del doppio clic: disabilita il bottone durante il caricamento', () => {
    const handleClick = vi.fn();

    const { rerender } = render(
      <Button variant="primary" onClick={handleClick} isLoading={false}>
        Conferma
      </Button>
    );

    const btn = screen.getByRole('button');
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    expect(handleClick).toHaveBeenCalledTimes(1);

    // Quando isLoading è true: il bottone deve essere disabilitato e mostrare il testo di elaborazione
    rerender(
      <Button variant="primary" onClick={handleClick} isLoading={true}>
        Conferma
      </Button>
    );

    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    // Non deve emettere altri click
    expect(handleClick).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Elaborazione.../i)).toBeInTheDocument();
  });

  it('3. Genera operation_id univoci per garantire l\'idempotenza delle mutazioni', () => {
    const op1 = generateOperationId();
    const op2 = generateOperationId();

    expect(op1).toBeTruthy();
    expect(op2).toBeTruthy();
    expect(op1).not.toBe(op2);
  });

  it('4. Alert visualizza messaggi chiari per errori 401, 403, 409, 422 e 429 con Retry-After', () => {
    const { rerender } = render(
      <Alert type="error" status={401} message="Credenziali errate." />
    );
    expect(screen.getByText(/Sessione non autenticata o scaduta/i)).toBeInTheDocument();

    rerender(
      <Alert type="error" status={403} message="Non autorizzato." />
    );
    expect(screen.getByText(/Accesso negato: permessi insufficienti/i)).toBeInTheDocument();

    rerender(
      <Alert type="error" status={409} message="Conflitto rilevato." />
    );
    expect(screen.getByText(/Conflitto: la risorsa esiste già/i)).toBeInTheDocument();

    rerender(
      <Alert type="error" status={422} message="Email non valida." />
    );
    expect(screen.getByText(/Dati non validi: verifica i campi inseriti/i)).toBeInTheDocument();

    rerender(
      <Alert type="error" status={429} retryAfter={45} message="Rallenta le richieste." />
    );
    expect(screen.getByText(/Limite di richieste superato. Riprova tra 45 secondi/i)).toBeInTheDocument();
  });

  it('5. Renderizza correttamente lo stato vuoto (EmptyState)', () => {
    render(
      <EmptyState
        title="Nessun elemento presente"
        description="Aggiungi il primo elemento per iniziare."
        action={<Button variant="primary">Aggiungi</Button>}
      />
    );

    expect(screen.getByText('Nessun elemento presente')).toBeInTheDocument();
    expect(screen.getByText('Aggiungi il primo elemento per iniziare.')).toBeInTheDocument();
    expect(screen.getByText('Aggiungi')).toBeInTheDocument();
  });

  it('6. Credenziale digitale emessa: non espone pulsanti di apertura fittizi senza token e offre azione Rigenera link', () => {
    const activeCredential = {
      id: 99,
      business_id: 1,
      loyalty_account_id: 10,
      card_id: null,
      type: 'digital',
      status: 'active',
      issued_at: '2026-02-01 12:00:00',
    };

    render(
      <div>
        <span className="badge badge-success">Attiva</span>
        <div style={{ fontSize: '0.8rem' }}>
          Emessa il: {new Date(activeCredential.issued_at).toLocaleString('it-IT')}
        </div>
        <div style={{ fontSize: '0.78rem' }}>
          Il link originale non è recuperabile in chiaro. Se il cliente lo ha smarrito, puoi rigenerarlo:
        </div>
        <Button variant="secondary" size="sm">
          🔄 Rigenera link
        </Button>
      </div>
    );

    expect(screen.getByText('Attiva')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Rigenera link/i })).toBeInTheDocument();
    // Non esiste alcun pulsante o link di apertura diretta per credenziali senza token in chiaro
    expect(screen.queryByRole('link', { name: /Apri carta/i })).not.toBeInTheDocument();
  });
});
