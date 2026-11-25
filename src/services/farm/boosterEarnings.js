export const money=cents=>'$'+(cents/100).toFixed(2);
export const earningsText=order=>Number.isSafeInteger(order.booster_earnings_cents)?money(order.booster_earnings_cents):'Payment pending';
export const commission=cents=>Math.round(cents*40/100);
