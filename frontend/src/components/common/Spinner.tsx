import React from 'react';

export const Spinner: React.FC<{ size?: 'sm' | 'md' | 'lg'; text?: string }> = ({
  size = 'md',
  text,
}) => {
  const dim = size === 'sm' ? '1rem' : size === 'lg' ? '2.5rem' : '1.5rem';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', gap: '0.75rem' }}>
      <div className="spinner" style={{ width: dim, height: dim }} aria-hidden="true" />
      {text && <span className="page-subtitle">{text}</span>}
    </div>
  );
};
