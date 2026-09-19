import { useEffect, useState } from 'react';
import { apiRequest } from '../../api/client';
export const AdminAuditPage = () => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
        const [error, setError] = useState('');
    useEffect(() => {
        apiRequest('/api/v1/admin/audit-logs')
            .then(res => setLogs(res.data.logs || []))
            .catch(err => setError(err.message))
            .finally(() => setLoading(false));
    }, []);
        if (loading) return <div>Cargando auditorÃƒÂ­a...</div>;
    if (error) return <div className="error">{error}</div>;
    return (
        <div className="p-4">
            <h1 className="text-2xl font-bold mb-4">Log de AuditorÃƒÂ­a Global</h1>
            {logs.length === 0 ? <p>No hay registros.</p> : (
                <ul className="space-y-2">
                    {logs.map((l: any) => <li key={l.id} className="border p-2 rounded">{l.created_at}: {l.action} by {l.actor_email}</li>)}
                </ul>
            )}
        </div>
    );
};
