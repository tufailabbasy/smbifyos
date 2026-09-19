export const currencyOptions = ["USD", "EUR", "GBP", "AED", "PKR"];

export function formatCurrencyAmount(currency: string, amount: number) {
  const normalizedCurrency = (currency || "USD").toUpperCase();

  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: normalizedCurrency,
      maximumFractionDigits: 0,
    }).format(amount || 0);
  } catch {
    return `${normalizedCurrency} ${(amount || 0).toFixed(0)}`;
  }
}
