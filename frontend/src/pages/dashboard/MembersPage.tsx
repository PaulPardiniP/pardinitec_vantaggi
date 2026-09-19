import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { businessApi } from '../../api/services';
import type { Member } from '../../types';
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
  const [isLoading, setIsLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modale Aggiunta Membro
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<'staff' | 'manager' | 'owner'>('staff');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modale Rimozione Membro
  const [memberToRemove, setMemberToRemove] = useState<Member | null>(null);

  const canManageMembers = hasPermission('members.manage');

  const loadMembers = async () => {
    if (!activeBusiness) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const list = await businessApi.listMembers(activeBusiness.id);
      setMembers(list);
    } catch {
      setMembers([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadMembers();
  }, [activeBusiness]);

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBusiness || !newEmail) return;
    setIsSubmitting(true);
    setFeedback(null);
    try {
      await businessApi.addMember(activeBusiness.id, {
        email: newEmail.trim(),
        role: newRole,
      });
      setFeedback({ type: 'success', message: `Operatore "${newEmail}" aggiunto con successo con ruolo ${newRole}.` });
      setIsAddOpen(false);
      setNewEmail('');
      setNewRole('staff');
      await loadMembers();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Errore durante l\'aggiunta del membro.' });
    } finally {
      setIsSubmitting(false);
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
      await loadMembers();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Errore durante la rimozione del membro.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) return <Spinner size="lg" text="Caricamento staff e collaboratori..." />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Gestione Staff & Membri</h1>
          <p className="page-subtitle">Autorizza e gestisci gli operatori abilitati al punto vendita.</p>
        </div>
        {canManageMembers && (
          <Button variant="primary" onClick={() => setIsAddOpen(true)}>
            ➕ Aggiungi Membro
          </Button>
        )}
      </div>

      {feedback && <Alert type={feedback.type} message={feedback.message} onDismiss={() => setFeedback(null)} />}

      {members.length === 0 ? (
        <EmptyState
          title="Nessun membro trovato"
          description="Aggiungi operatori di cassa o manager al tuo punto vendita."
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
                        {m.role}
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

      {/* Modale Aggiungi Membro */}
      <Modal isOpen={isAddOpen} title="Aggiungi Collaboratore al Negozio" onClose={() => setIsAddOpen(false)}>
        <form onSubmit={handleAddMember}>
          <Input
            label="Email dell'Utente Registrato *"
            type="email"
            required
            placeholder="collaboratore@negozio.it"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
          />

          <Select
            label="Ruolo Operativo *"
            options={[
              { label: 'Staff (Operatore di Cassa)', value: 'staff' },
              { label: 'Manager (Gestione catalogo e clienti)', value: 'manager' },
              { label: 'Owner (Titolare con pieni permessi)', value: 'owner' },
            ]}
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as any)}
          />

          <div className="modal-actions">
            <Button type="button" variant="secondary" onClick={() => setIsAddOpen(false)} disabled={isSubmitting}>
              Annulla
            </Button>
            <Button type="submit" variant="primary" isLoading={isSubmitting}>
              Aggiungi Membro
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modale Conferma Rimozione */}
      <Modal isOpen={Boolean(memberToRemove)} title="Rimuovi Membro" onClose={() => setMemberToRemove(null)}>
        {memberToRemove && (
          <div>
            <p>
              Sei sicuro di voler revocare l'accesso al punto vendita per l'utente <strong>"{memberToRemove.email}"</strong>?
            </p>
            <div className="modal-actions">
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
