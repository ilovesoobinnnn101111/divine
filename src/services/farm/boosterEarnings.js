export const money=cents=>'$'+(cents/100).toFixed(2);
export const earningsText=order=>Number.isSafeInteger(order.booster_earnings_cents)?money(order.booster_earnings_cents):typeof order.estimated_price==='number'&&Number.isFinite(order.estimated_price)&&order.estimated_price>=0?money(commission(Math.round(order.estimated_price*100)))+' (estimated; payment pending)':'Payment pending — estimate unavailable';
export const commission=cents=>Math.round(cents*40/100);
