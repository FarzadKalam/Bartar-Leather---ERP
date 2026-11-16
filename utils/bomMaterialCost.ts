/** The secondary quantity is the converted base usage, before waste. */
export function materialCostPerItem(mainPrice: number, finalUsage: number, subPrice: number, baseSubUsage: number, wastePercent: number) {
  return mainPrice > 0 ? mainPrice * finalUsage : subPrice * baseSubUsage * (1 + wastePercent / 100);
}
