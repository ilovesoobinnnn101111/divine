import {earningsText} from './boosterEarnings.js';
import { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { readRecords } from './records.js';
import { availabilityRows, availabilityOf, availabilityIcon } from './boosterAvailability.js';
import { safeRequest } from './boostRequests.js';

const validId = id => /^ORD-\d{17,20}$/.test(String(id||''));
const mention = id => /^\d{17,20}$/.test(String(id||'')) ? `<@${id}>` : 'Unassigned';
const deadline = order => {
 const value=Number(order.deadline_at);
 return Number.isFinite(value)&&value>0?value:null;
};
export async function renderBoosterDashboard(client,guildId,view='active',selectedId=null){
 const orders=await readRecords(client,guildId,'boosterOrders');
 const availabilities=await availabilityRows(client,guildId);
 const active=orders.filter(o=>o.status==='Pending'||o.status==='In Progress');
 const now=Date.now();
 const unassigned=active.filter(o=>!/^\d{17,20}$/.test(String(o.booster_id||'')));
 const overdue=active.filter(o=>deadline(o)!==null&&deadline(o)<now);
 const workload=new Map();
 for(const order of active){
  if(/^\d{17,20}$/.test(String(order.booster_id||'')))
   workload.set(order.booster_id,(workload.get(order.booster_id)||0)+1);
 }
 const modes={active,unassigned,overdue};
 const filtered=(modes[view]||active).slice().sort((a,b)=>(b.updated_at||b.created_at||0)-(a.updated_at||a.created_at||0));
 const selected=filtered.find(o=>o.order_id===selectedId)||filtered[0];
 const top=[...workload.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8)
  .map(([id,count])=>`${mention(id)} — **${count}** active`).join('\n')||'No boosters currently assigned';
 const embed=new EmbedBuilder().setColor(overdue.length?0xE67E22:0x5865F2)
  .setTitle('📊 Booster Management Dashboard')
  .setDescription(`**Active:** ${active.length} · **Pending:** ${active.filter(o=>o.status==='Pending').length} · **In Progress:** ${active.filter(o=>o.status==='In Progress').length}\n**Unassigned:** ${unassigned.length} · **Overdue:** ${overdue.length}\n**Current view:** ${view==='unassigned'?'Unassigned':view==='overdue'?'Overdue':'All active'} (${filtered.length} orders)`)
  .addFields({name:'👥 Booster Workload',value:top.slice(0,1024),inline:false});
 if(selected){
  const due=deadline(selected);
  embed.addFields({name:'🔎 Selected Order',value:[
   `**ID:** \`${safeRequest(selected.order_id,45)}\``,
   `**Status:** ${safeRequest(selected.status,35)}`,
   `**Assignment response:** ${safeRequest(selected.assignment_response||'Not tracked (legacy)',50)}`,
   `**Booster:** ${mention(selected.booster_id)}`,
   `**Availability:** ${availabilityIcon(availabilityOf(availabilities,selected.booster_id))} ${availabilityOf(availabilities,selected.booster_id)}`,
   `**Customer:** ${/^\d{17,20}$/.test(String(selected.customer_id||''))?mention(selected.customer_id):safeRequest(selected.customer||'Not specified',80)}`,
   `**Boost:** ${safeRequest(selected.hero||'Not specified',120)}`,
   `**Level:** ${safeRequest(selected.level||'Not specified',120)}`,
   `**Booster earnings:** ${earningsText(selected)}`,
   `**Deadline:** ${due?`<t:${Math.floor(due/1000)}:F>${due<now?' ⚠️ Overdue':''}`:'Not set'}`
  ].join('\n').slice(0,1024),inline:false});
 }else embed.addFields({name:'🔎 Selected Order',value:'No orders in this view.',inline:false});
 const buttons=new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId('boostdashboard:view:active').setLabel('Active').setStyle(view==='active'?ButtonStyle.Primary:ButtonStyle.Secondary),
  new ButtonBuilder().setCustomId('boostdashboard:view:unassigned').setLabel('Unassigned').setStyle(view==='unassigned'?ButtonStyle.Primary:ButtonStyle.Secondary),
  new ButtonBuilder().setCustomId('boostdashboard:view:overdue').setLabel('Overdue').setStyle(view==='overdue'?ButtonStyle.Primary:ButtonStyle.Secondary),
  new ButtonBuilder().setCustomId(`boostdashboard:refresh:${view}`).setLabel('Refresh').setEmoji('🔄').setStyle(ButtonStyle.Secondary)
 );
 const components=[buttons];
 if(filtered.length){
  const visible=filtered.slice(0,25).filter(o=>validId(o.order_id));
  if(visible.length)components.push(new ActionRowBuilder().addComponents(
   new StringSelectMenuBuilder().setCustomId('boostdashboard:select:'+view)
    .setPlaceholder('Select an order for details')
    .addOptions(visible.map(o=>({label:`${o.order_id} · ${o.status}`.slice(0,100),value:o.order_id,
      description:safeRequest(o.hero||'Boost order',90),default:o.order_id===selected?.order_id})))
  ));
 }
 embed.setFooter({text:'Manager only · Live PostgreSQL data · Up to 25 selectable orders per view'}).setTimestamp();
 return {embeds:[embed],components,allowedMentions:{parse:[]}};
}
