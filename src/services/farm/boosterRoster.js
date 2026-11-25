import { EmbedBuilder,ActionRowBuilder,ButtonBuilder,ButtonStyle } from 'discord.js';
import { readRecords } from './records.js';
import { availabilityRows,availabilityOf,availabilityIcon } from './boosterAvailability.js';
const filters=['all','Available','Busy','Offline','Not Set'];
export async function renderBoosterRoster(client,guildId,filter='all',page=0){
 const [statuses,orders]=await Promise.all([availabilityRows(client,guildId),readRecords(client,guildId,'boosterOrders')]);
 const active=orders.filter(o=>['Pending','In Progress'].includes(o.status));
 const people=new Set([...statuses.map(s=>s.booster_id),...orders.map(o=>o.booster_id)].filter(id=>/^\d{17,20}$/.test(String(id||''))));
 const entries=[...people].map(id=>({id,status:availabilityOf(statuses,id),count:active.filter(o=>o.booster_id===id).length,
  updated:statuses.find(s=>s.booster_id===id)?.updated_at||null}))
  .filter(x=>filter==='all'||x.status===filter)
  .sort((a,b)=>a.status==='Available'&&b.status!=='Available'?-1:b.status==='Available'&&a.status!=='Available'?1:a.count-b.count||a.id.localeCompare(b.id));
 const perPage=12,totalPages=Math.max(1,Math.ceil(entries.length/perPage)),current=Math.min(Math.max(0,page),totalPages-1);
 const counts=Object.fromEntries(filters.slice(1).map(f=>[f,[...people].filter(id=>availabilityOf(statuses,id)===f).length]));
 const lines=entries.slice(current*perPage,(current+1)*perPage).map(x=>
  `${availabilityIcon(x.status)} <@${x.id}> — **${x.status}** · **${x.count}** active${x.updated?` · Updated <t:${Math.floor(x.updated/1000)}:R>`:''}`);
 const embed=new EmbedBuilder().setColor(0x5865F2).setTitle('👥 Booster Availability Roster')
  .setDescription(`**Known boosters:** ${people.size}\n🟢 Available: ${counts.Available} · 🟡 Busy: ${counts.Busy} · 🔴 Offline: ${counts.Offline} · ⚪ Not Set: ${counts['Not Set']}\n**Filter:** ${filter} · **Page:** ${current+1}/${totalPages}\n\n${lines.join('\n')||'No boosters match this filter.'}`)
  .setFooter({text:'Includes boosters with availability records or order history · Refresh for latest data'}).setTimestamp();
 const filterRow=new ActionRowBuilder().addComponents(filters.map(f=>new ButtonBuilder()
  .setCustomId(`boostroster:filter:${f.replace(' ','_')}`).setLabel(f==='all'?'All':f).setStyle(f===filter?ButtonStyle.Primary:ButtonStyle.Secondary)));
 const navRow=new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId(`boostroster:page:${filter.replace(' ','_')}:${current-1}`).setLabel('Previous').setStyle(ButtonStyle.Secondary).setDisabled(current===0),
  new ButtonBuilder().setCustomId(`boostroster:page:${filter.replace(' ','_')}:${current+1}`).setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(current>=totalPages-1),
  new ButtonBuilder().setCustomId(`boostroster:page:${filter.replace(' ','_')}:${current}`).setLabel('Refresh').setEmoji('🔄').setStyle(ButtonStyle.Secondary)
 );
 return {embeds:[embed],components:[filterRow,navRow],allowedMentions:{parse:[]}};
}
