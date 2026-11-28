import test from 'node:test';
import assert from 'node:assert/strict';
import { getDefaultProfile, saveDefaultProfile, rivalsRequest } from '../src/services/rivals/client.js';
test('default profile is scoped to member and guild',async()=>{
 const map=new Map();const client={db:{isAvailable:()=>true,get:async(k,d)=>map.get(k)??d,set:async(k,v)=>map.set(k,v)}};
 await saveDefaultProfile(client,'g','u',{uid:'123',name:'Example'});
 assert.equal((await getDefaultProfile(client,'g','u')).uid,'123');
 assert.equal(await getDefaultProfile(client,'g','other'),null);
 await assert.rejects(saveDefaultProfile(client,'g','u',{uid:'bad'}));
});
test('request uses authenticated service and encoded player',async()=>{
 const old=globalThis.fetch;const oldUrl=process.env.RIVALS_SERVICE_URL;const oldToken=process.env.RIVALS_SERVICE_TOKEN;
 try{process.env.RIVALS_SERVICE_URL='http://example.invalid';process.env.RIVALS_SERVICE_TOKEN='test';
 globalThis.fetch=async(url,opts)=>{assert.equal(url.searchParams.get('player'),'A & B');assert.equal(opts.headers.Authorization,'Bearer test');return {ok:true,json:async()=>({data:{level:10}})};};
 assert.equal((await rivalsRequest('profile','A & B')).data.level,10);
 }finally{globalThis.fetch=old;if(oldUrl===undefined)delete process.env.RIVALS_SERVICE_URL;else process.env.RIVALS_SERVICE_URL=oldUrl;if(oldToken===undefined)delete process.env.RIVALS_SERVICE_TOKEN;else process.env.RIVALS_SERVICE_TOKEN=oldToken;}
});
