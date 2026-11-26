const cache=new Map();
const pending=new Map();
const ttl=15*60*1000;
const fallback={Vanguard:[1,0,3],Duelist:[3,0,1],Strategist:[1,3,0]};
export async function heroStats(role,hero){
 const offline={scores:fallback[role]||[0,0,0],source:'role estimate'};
 const endpoint=process.env.FARM_HERO_STATS_URL;
 if(!endpoint)return offline;
 const k=role+':'+hero;
 const hit=cache.get(k);if(hit&&Date.now()<hit.expires)return hit.value;
 if(pending.has(k))return pending.get(k);
 const task=(async()=>{let value=offline;try{
 const url=new URL(endpoint);if(url.protocol!=='https:')throw Error('HTTPS required');
 url.searchParams.set('hero',hero);url.searchParams.set('role',role);
 const res=await fetch(url,{signal:AbortSignal.timeout(3000),redirect:'error',headers:{Accept:'application/json'}});
 if(!res.ok)throw Error('Provider unavailable');
 const data=await res.json();const scores=[data.damageScore,data.healingScore,data.blockingScore];
 if(!scores.every(x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=3))throw Error('Invalid normalized scores');
 value={scores,source:'provider estimate'};
 }catch{}finally{if(cache.size>=500)cache.delete(cache.keys().next().value);cache.set(k,{value,expires:Date.now()+(value===offline?60000:ttl)});}
 return value;})();
 pending.set(k,task);try{return await task;}finally{pending.delete(k);}
}
