/** Integer minor-unit upper bound supported by PostgreSQL Int columns. */
export const MoneyLimits = { maxStoredCents: 2_147_483_647 } as const;
export function isStoredMoney(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= MoneyLimits.maxStoredCents;
}
export function checkedMoneySum(...amounts: number[]): number {
  let total = 0;
  for (const amount of amounts) {
    if (!isStoredMoney(amount)) throw new Error("INVALID_ORDER_AMOUNT");
    total += amount;
    if (!isStoredMoney(total)) throw new Error("ORDER_AMOUNT_LIMIT");
  }
  return total;
}
