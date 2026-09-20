/**
 * Formatta la descrizione automatica del beneficio di un'offerta.
 * Esempi:
 * - Percentuale 10 -> "Sconto 10%"
 * - Percentuale 15.5 -> "Sconto 15,5%"
 * - Importo fisso 40 -> "Sconto €40,00"
 * - Importo fisso 5 -> "Sconto €5,00"
 */
export const formatOfferBenefit = (discountType: 'percentage' | 'fixed' | 'text' | string, discountValue?: number | null): string => {
  if (discountType === 'text') {
    return 'Vantaggio libero';
  }

  if (discountValue === undefined || discountValue === null || isNaN(discountValue) || discountValue <= 0) {
    return '';
  }

  if (discountType === 'percentage') {
    const formatted = Number.isInteger(discountValue)
      ? discountValue.toString()
      : discountValue.toString().replace('.', ',');
    return `Sconto ${formatted}%`;
  }

  // Importo fisso
  const parts = discountValue.toFixed(2).split('.');
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const decPart = parts[1];
  return `Sconto €${intPart},${decPart}`;
};

/**
 * Formatta l'etichetta dei destinatari dell'offerta.
 */
export const formatTargetAudience = (audience?: 'vantaggi' | 'vip' | 'vantaggi_vip' | 'all' | string, isVip?: boolean, _cardProfileId?: number | null): string => {
  if (audience === 'vip' || isVip) {
    return 'Destinatari: VIP';
  }
  if (audience === 'vantaggi') {
    return 'Destinatari: Vantaggi';
  }
  return 'Destinatari: Vantaggi e VIP';
};