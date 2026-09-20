import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { businessApi } from '../../api/services';
import type { Member, BusinessInvitation } from '../../types';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Select } from '../../components/common/Select';
import { Modal } from '../../components/common/Modal';
import { Alert } from '../../components/common/Alert';
import { Spinner } from '../../components/common/Spinner';
import { EmptyState } from '../../components/common/EmptyState';

export const MembersPage: React.FC = () => {
  const { activeBusiness, user, hasPermission } = useAuth();

  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<BusinessInvitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modale Invito Collaboratore
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteFirstName, setInviteFirstName] = useState('');
  const [inviteLastName, setInviteLastName] = useState('');
  const [inviteRole, setInviteRole] = useState<'staff' | 'manager'>('staff');
  const [createdInviteUrl, setCreatedInviteUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modale Rimozione Membro
  const [memberToRemove, setMemberToRemove] = useState<Member | null>(null);

  // Azioni su inviti (reinvia / annulla)
  const [actionInvitationId, setActionInvitationId] = useState<number | null>(null);

  const canManageMembers = hasPermission('members.manage');

  const loadData = async () => {
    if (!activeBusiness) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const [membersList, invitationsList] = await Promise.all([
        businessApi.listMembers(activeBusiness.id),
        businessApi.listInvitations(activeBusiness.id).catch(() => []),
      ]);
      setMembers(membersList);
      setInvitations(invitationsList);
    } catch {
      setMembers([]);
      setInvitations([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeBusiness]);

  const handleCreateInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBusiness || !inviteEmail) return;

    setIsSubmitting(true);
    setFeedback(null);
    setCreatedInviteUrl(null);

    try {
      const res = await businessApi.createInvitation(activeBusiness.id, {
        email: inviteEmail.trim().toLowerCase(),
        first_name: inviteFirstName.trim() || undefined,
        last_name: inviteLastName.trim() || undefined,
        role: inviteRole,
      });

      const absoluteUrl = res.invitation_url
        ? new URL(res.invitation_url, window.location.origin).toString()
        : null;

      setCreatedInviteUrl(absoluteUrl);
      setFeedback({
        type: 'success',
        message: `Invito creato con successo per "${inviteEmail}" (${inviteRole.toUpperCase()}).`,
      });

      await loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Errore durante la creazione dell\'invito.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendInvitation = async (inv: BusinessInvitation) => {
    if (!activeBusiness) return;
    setActionInvitationId(inv.id);
    setFeedback(null);
    try {
      const res = await businessApi.resendInvitation(activeBusiness.id, inv.id);
      const absoluteUrl = res.invitation_url
        ? new URL(res.invitation_url, window.location.origin).toString()
        : null;

      setFeedback({
        type: 'success',
        message: `Invito per "${inv.email}" reinviato con successo.${absoluteUrl ? ` Nuovo link: ${absoluteUrl}` : ''}`,
      });
      await loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Errore durante il reinvio dell\'invito.' });
    } finally {
      setActionInvitationId(null);
    }
  };

  const handleCancelInvitation = async (inv: BusinessInvitation) => {
    if (!activeBusiness) return;
    if (!window.confirm(`Sei sicuro di voler annullare l'invito per "${inv.email}"?`)) return;

    setActionInvitationId(inv.id);
    setFeedback(null);
    try {
      await businessApi.cancelInvitation(activeBusiness.id, inv.id);
      setFeedback({
        type: 'success',
        message: `Invito per "${inv.email}" annullato con successo.`,
      });
      await loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Errore durante l\'annullamento dell\'invito.' });
    } finally {
      setActionInvitationId(null);
    }
  };

  const handleRemoveMember = async () => {
    if (!activeBusiness || !memberToRemove) return;
    setIsSubmitting(true);
    setFeedback(null);
    try {
      await businessApi.removeMember(activeBusiness.id, memberToRemove.user_id);
      setFeedback({ type: 'success', message: `Membro "${memberToRemove.email}" rimosso dal punto vendita.` });
      setMemberToRemove(null);
      await loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Errore durante la rimozione del membro.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) return <Spinner size="lg" text="Caricamento staff e collaboratori..." />;

  const pendingInvitations = invitations.filter((i) => i.role !== 'owner');

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Gestione Staff & Collaboratori</h1>
          <p className="page-subtitle">Autorizza, invita e gestisci gli operatori abilitati al punto vendita.</p>
        </div>
        {canManageMembers && (
          <Button
            variant="primary"
            onClick={() => {
              setIsInviteOpen(true);
              setCreatedInviteUrl(null);
              setInviteEmail('');
              setInviteFirstName('');
              setInviteLastName('');
              setInviteRole('staff');
            }}
          >
            ➕ Invita Collaboratore
          </Button>
        )}
      </div>

      {feedback && <Alert type={feedback.type} message={feedback.message} onDismiss={() => setFeedback(null)} />}

      {/* 1. Collaboratori Attivi */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2 className="card-title">Collaboratori Attivi</h2>
        <p className="page-subtitle" style={{ marginBottom: '1rem' }}>
          Utenti che hanno già completato l'onboarding e hanno accesso operativo al punto vendita.
        </p>

        {members.length === 0 ? (
          <EmptyState
            title="Nessun membro attivo trovato"
            description="Invita operatori di cassa o manager al tuo punto vendita."
          />
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Email Operatore</th>
                  <th>Ruolo</th>
                  <th>Stato</th>
                  <th>Data Inclusione</th>
                  <th style={{ textAlign: 'right' }}>Azioni</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const isSelf = user?.id === m.user_id;
                  return (
                    <tr key={m.id}>
                      <td>
                        <strong>{m.email}</strong>
                        {isSelf && <span style={{ marginLeft: '0.5rem', color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>(Tu)</span>}
                      </td>
                      <td>
                        <span className={`badge ${m.role === 'owner' ? 'badge-primary' : m.role === 'manager' ? 'badge-success' : 'badge-warning'}`}>
                          {m.role.toUpperCase()}
                        </span>
                      </td>
                      <td>
                        <span className="badge badge-success">{m.status}</span>
                      </td>
                      <td>{new Date(m.joined_at).toLocaleDateString('it-IT')}</td>
                      <td style={{ textAlign: 'right' }}>
                        {canManageMembers && !isSelf && (
                          <Button variant="danger" size="sm" onClick={() => setMemberToRemove(m)}>
                            Rimuovi
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 2. Inviti Collaboratori Pendenti / Gestiti */}
      {canManageMembers && (
        <div className="card">
          <h2 className="card-title">Inviti Collaboratori</h2>
          <p className="page-subtitle" style={{ marginBottom: '1rem' }}>
            Stato degli inviti inviati per ruoli Staff e Manager in attesa di accettazione o scaduti.
          </p>

          {pendingInvitations.length === 0 ? (
            <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
              Nessun invito in sospeso. Clicca su "➕ Invita Collaboratore" per autorizzare un nuovo operatore.
            </p>
          ) : (
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Email Invitata</th>
                    <th>Nome / Cognome</th>
                    <th>Ruolo</th>
                    <th>Stato</th>
                    <th>Scadenza Invito</th>
                    <th style={{ textAlign: 'right' }}>Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingInvitations.map((inv) => {
                    const isPending = inv.status === 'pending';
                    return (
                      <tr key={inv.id}>
                        <td><strong>{inv.email}</strong></td>
                        <td>{inv.first_name || inv.last_name ? `${inv.first_name || ''} ${inv.last_name || ''}`.trim() : '-'}</td>
                        <td>
                          <span className={`badge ${inv.role === 'manager' ? 'badge-success' : 'badge-warning'}`}>
                            {inv.role.toUpperCase()}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${inv.status === 'accepted' ? 'badge-success' : inv.status === 'pending' ? 'badge-warning' : 'badge-danger'}`}>
                            {inv.status === 'pending' ? 'In attesa' : inv.status === 'accepted' ? 'Accettato' : inv.status === 'expired' ? 'Scaduto' : 'Annullato'}
                          </span>
                        </td>
                        <td>{new Date(inv.expires_at).toLocaleString('it-IT')}</td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '0.5rem' }}>
                            {inv.status !== 'accepted' && (
                              <Button
                                variant="secondary"
                                size="sm"
                                isLoading={actionInvitationId === inv.id}
                                onClick={() => handleResendInvitation(inv)}
                                title="Genera un nuovo token valido 7 giorni"
                              >
                                🔄 Reinvia
                              </Button>
                            )}
                            {isPending && (
                              <Button
                                variant="danger"
                                size="sm"
                                isLoading={actionInvitationId === inv.id}
                                onClick={() => handleCancelInvitation(inv)}
                                title="Annulla questo invito"
                              >
                                ❌ Annulla
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modale Invita Collaboratore */}
      <Modal
        isOpen={isInviteOpen}
        title="Invita Collaboratore al Negozio"
        onClose={() => {
          setIsInviteOpen(false);
          setCreatedInviteUrl(null);
        }}
      >
        {createdInviteUrl ? (
          <div>
            <Alert
              type="success"
              message={`Invito generato con successo per ${inviteEmail}!`}
            />
            <div style={{ marginTop: '1rem', padding: '1rem', background: '#f8fafc', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
              <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Link di attivazione per il collaboratore:</div>
              <input
                type="text"
                readOnly
                className="form-control"
                value={createdInviteUrl}
                style={{ fontSize: '0.85rem', marginBottom: '0.75rem', background: '#ffffff' }}
              />
              <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>
                Il link è monouso ed ha validità di 7 giorni. Il collaboratore potrà attivare il proprio profilo ed operare nel punto vendita.
              </p>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(createdInviteUrl);
                  alert('Link copiato negli appunti!');
                }}
              >
                📋 Copia Link Invito
              </Button>
            </div>
            <div className="modal-actions" style={{ marginTop: '1.25rem' }}>
              <Button
                variant="secondary"
                onClick={() => {
                  setIsInviteOpen(false);
                  setCreatedInviteUrl(null);
                }}
              >
                Chiudi
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleCreateInvitation}>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
              Invia un invito sicuro per inserire un nuovo operatore di cassa o manager.
              Non è richiesto che l'utente sia già registrato prima dell'invio.
            </p>

            <Input
              label="Email del Collaboratore *"
              type="email"
              required
              placeholder="collaboratore@negozio.it"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
            />

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <Input
                label="Nome"
                placeholder="es. Giulia"
                value={inviteFirstName}
                onChange={(e) => setInviteFirstName(e.target.value)}
                style={{ flex: 1 }}
              />
              <Input
                label="Cognome"
                placeholder="es. Bianchi"
                value={inviteLastName}
                onChange={(e) => setInviteLastName(e.target.value)}
                style={{ flex: 1 }}
              />
            </div>

            <Select
              label="Ruolo Operativo *"
              options={[
                { label: 'Staff (Operatore di Cassa: punti, sconti, canje)', value: 'staff' },
                { label: 'Manager (Gestione catalogo, clienti, offerte)', value: 'manager' },
              ]}
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as any)}
            />

            <div className="modal-actions" style={{ marginTop: '1.25rem' }}>
              <Button type="button" variant="secondary" onClick={() => setIsInviteOpen(false)} disabled={isSubmitting}>
                Annulla
              </Button>
              <Button type="submit" variant="primary" isLoading={isSubmitting}>
                Invia Invito
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Modale Conferma Rimozione Membro */}
      <Modal isOpen={Boolean(memberToRemove)} title="Rimuovi Membro" onClose={() => setMemberToRemove(null)}>
        {memberToRemove && (
          <div>
            <p>
              Sei sicuro di voler revocare l'accesso al punto vendita per l'utente <strong>"{memberToRemove.email}"</strong>?
            </p>
            <div className="modal-actions" style={{ marginTop: '1.25rem' }}>
              <Button variant="secondary" onClick={() => setMemberToRemove(null)} disabled={isSubmitting}>
                Annulla
              </Button>
              <Button variant="danger" onClick={handleRemoveMember} isLoading={isSubmitting}>
                Conferma Rimozione
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
