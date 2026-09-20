import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiRequest } from '../../api/client';
import { Spinner } from '../../components/common/Spinner';
import { EmptyState } from '../../components/common/EmptyState';

export const CampaignsPage: React.FC = () => {
  const { activeBusiness } = useAuth();
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!activeBusiness) {
      setLoading(false);
      return;
    }
    setLoading(true);
    apiRequest(`/api/v1/businesses/${activeBusiness.id}/campaigns`)
      .then((res: any) => setCampaigns(res.data?.data || []))
      .catch((err: any) => setError(err.message))
      .finally(() => setLoading(false));
  }, [activeBusiness]);

  if (loading) return <Spinner size="lg" text="Caricamento campagne..." />;
  if (!activeBusiness) {
    return <EmptyState title="Nessun commercio selezionato" description="Seleziona un commercio per visualizzare le campagne." />;
  }
  if (error) return <div className="error">{error}</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Campagne</h1>
          <p className="page-subtitle">Gestisci e visualizza le comunicazioni e le promozioni inviate ai clienti.</p>
        </div>
      </div>

      {campaigns.length === 0 ? (
        <EmptyState
          title="Nessuna campagna disponibile."
          description="Non ci sono campagne di comunicazione attive o programmate per questo punto vendita."
        />
      ) : (
        <ul className="space-y-2">
          {campaigns.map((c: any) => (
            <li key={c.id} className="border p-2 rounded">
              {c.name} ({c.status})
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
