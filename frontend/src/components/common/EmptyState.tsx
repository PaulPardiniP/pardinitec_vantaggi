import React from 'react';

export const EmptyState: React.FC<{
  title: string;
  description?: string;
  action?: React.ReactNode;
}> = ({ title, description, action }) => (
  <div style={{ textAlign: 'center', padding: '3rem 1.5rem', background: '#ffffff', borderRadius: 'var(--radius-lg)', border: '1px dashed var(--color-border)' }}>
    <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem', opacity: 0.6 }}>📭</div>
    <h3 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '0.5rem' }}>{title}</h3>
    {description && <p className="page-subtitle" style={{ maxWidth: '400px', margin: '0 auto 1.25rem' }}>{description}</p>}
    {action && <div>{action}</div>}
  </div>
);
