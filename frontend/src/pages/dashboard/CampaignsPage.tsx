import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiRequest } from '../../api/client';
import { Spinner } from '../../components/common/Spinner';
import { EmptyState } from '../../components/common/EmptyState';

export const CampaignsPage: React.FC = () => {
    const { activeBusiness } = useAuth();
    const [campaigns, setCampaigns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!activeBusiness) {
            setLoading(false);
            return;
        }
        setLoading(true);
        apiRequest(`/api/v1/businesses/${activeBusiness.id}/campaigns`)
            .then(res => setCampaigns(res.data?.data || []))
            .catch(err => setError(err.message))
            .finally(() => setLoading(false));
    }, [activeBusiness]);

    if (loading) return <Spinner size="lg" text="Caricamento campagne..." />;
    if (!activeBusiness) {
        return <EmptyState title="Nessun commercio selezionato" description="Seleziona un commercio per visualizzare le campagne." />;
    }
    if (error) return <div className="error">{error}</div>;
    return (
        <div className="p-4">
            <h1 className="text-2xl font-bold mb-4">CampaÃƒÂ±as</h1>
            {campaigns.length === 0 ? <p>No hay campaÃƒÂ±as.</p> : (
                <ul className="space-y-2">
                    {campaigns.map((c: any) => <li key={c.id} className="border p-2 rounded">{c.name} ({c.status})</li>)}
                </ul>
            )}
        </div>
    );
};
