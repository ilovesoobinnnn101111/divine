import {EmbedBuilder,ActionRowBuilder,ButtonBuilder,ButtonStyle,StringSelectMenuBuilder} from 'discord.js';
import {readRecords,withRecordLock} from './records.js';
import {farmConfig} from './config.js';
import {money} from './boosterEarnings.js';
const eligible=o=>o.status==='Completed'&&Number.isSafeInteger(o.customer_paid_cents)&&Number.isSafeInteger(o.booster_earnings_cents)&&o.booster_earnings_cents>0;
async function orders(client,guildId){
 const [a,b]=await Promise.all(['boosterOrdersArchive','boosterOrders'].map(k=>readRecords(client,guildId,k)));
 return [...new Map([...a,...b].map(o=>[o.order_id,o])).values()];
}
export async function payoutView(client,guildId,target,manager,history=false,page=0){
 const [all,ledger]=await Promise.all([orders(client,guildId),readRecords(client,guildId,'boosterPayouts')]);
 const paid=new Set(ledger.map(p=>p.order_id));
 const due=all.filter(o=>o.booster_id===target&&eligible(o)&&!paid.has(o.order_id));
 const rows=history?ledger.filter(p=>p.booster_id===target):due;
 const pages=Math.max(1,Math.ceil(rows.length/10));page=Math.max(0,Math.min(page,pages-1));
 const visible=rows.slice(page*10,page*10+10);
 const embed=new EmbedBuilder().setColor(0x2ECC71).setTitle(history?'Booster Payout History':'Booster Outstanding Payouts').setDescription('**Booster:** <@'+target+'>\n**Outstanding:** '+money(due.reduce((s,o)=>s+o.booster_earnings_cents,0))+' · '+due.length+' orders\n\n'+(visible.map(o=>o.order_id+' · '+String(o.hero||'Boost').slice(0,65)+' · '+money(history?o.cents:o.booster_earnings_cents)+(history?' · <t:'+Math.floor(o.at/1000)+':d>':'')).join('\n')||'No orders.')).setFooter({text:'Page '+(page+1)+'/'+pages+' · External payment records only'});
 const button=(action,label,disabled=false)=>new ButtonBuilder().setCustomId('boostpayout:'+action+':'+target+':'+page+':'+Number(history)).setLabel(label).setStyle(ButtonStyle.Secondary).setDisabled(disabled);
 const components=[new ActionRowBuilder().addComponents(button('toggle',history?'Outstanding':'Payout History'),button('refresh','Refresh'),button('prev','Previous',page===0),button('next','Next',page>=pages-1))];
 if(manager&&!history&&visible.length)components.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('boostpayout:select:'+target).setPlaceholder('Select order to mark paid').addOptions(visible.map(o=>({label:(String(o.hero||'Boost')+' · '+money(o.booster_earnings_cents)).slice(0,100),description:o.order_id,value:o.order_id})))));
 return {embeds:[embed],components,allowedMentions:{parse:[]}};
}
export async function markPayout(client,guildId,target,id,cents,by){
 return withRecordLock(client,guildId,'boosterOrders',()=>withRecordLock(client,guildId,'boosterPayouts',async()=>{
 const ledger=await readRecords(client,guildId,'boosterPayouts');
 const o=(await orders(client,guildId)).find(o=>o.order_id===id);
 if(!o||o.booster_id!==target||!eligible(o)||o.booster_earnings_cents!==cents||ledger.some(p=>p.order_id===id))return false;
 ledger.push({order_id:id,booster_id:target,hero:o.hero,cents,at:Date.now(),by});
 await client.db.set(farmConfig.databasePrefix+guildId+':boosterPayouts',ledger);return true;
 }));
}
export async function payoutQuote(client,guildId,target,id){
 const [all,ledger]=await Promise.all([orders(client,guildId),readRecords(client,guildId,'boosterPayouts')]);
 const o=all.find(o=>o.order_id===id&&o.booster_id===target);
 return o&&eligible(o)&&!ledger.some(p=>p.order_id===id)?o.booster_earnings_cents:null;
}
