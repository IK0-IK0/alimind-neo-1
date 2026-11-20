export function convertUsdToPhp(amountUsd: number, usdToPhp: number): number {
  return amountUsd * usdToPhp;
}

export function formatPhp(amountPhp: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(amountPhp);
}
