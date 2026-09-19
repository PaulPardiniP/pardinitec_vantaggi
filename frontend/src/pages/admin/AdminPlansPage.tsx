import { useEffect, useState } from 'react';
import { apiRequest } from '../../api/client';
export const AdminPlansPage = () => {
    const [plans, setPlans] = useState([]);
    const [loading, setLoading] = useState(true);
        const [error, setError] = useState('');
    useEffect(() => {
        apiRequest('/api/v1/admin/plans')
            .then(res => setPlans(res.data.plans || []))
            .catch(err => setError(err.message))
            .finally(() => setLoading(false));
    }, []);
        if (loading) return <div>Cargando planes...</div>;
    if (error) return <div className="error">{error}</div>;
    return (
        <div className="p-4">
            <h1 className="text-2xl font-bold mb-4">Planes de SuscripciÃƒÂ³n</h1>
            {plans.length === 0 ? <p>No hay planes disponibles.</p> : (
                <ul className="space-y-2">
                    {plans.map((p: any) => <li key={p.id} className="border p-2 rounded">{p.name} - Ã¢â€šÂ¬{p.price_eur}</li>)}
                </ul>
            )}
        </div>
    );
};
