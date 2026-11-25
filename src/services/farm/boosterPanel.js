import {earningsText,money} from './boosterEarnings.js';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import { readRecords } from './records.js';
import { requestManager, safeRequest } from './boostRequests.js';

export async function renderBoosterPanel(client,interaction,selectedId=null){
 const all=await readRecords(client,interaction.guildId,'boosterOrders');
 const manager=requestManager(interaction.member);
 const active=all.filter(o=>['Pending','In Progress'].includes(o.status)&&(manager||o.booster_id===interaction.user.id))
  .sort((a,b)=>(b.updated_at||0)-(a.updated_at||0));
 const selected=active.find(o=>o.order_id===selectedId)||active[0];
 const embed=new EmbedBuilder().setColor(0x5865F2).setTitle('🎮 Booster Order Control Panel')
  .setDescription(active.length
   ?`**Active orders:** ${active.length} ${active.length>25?'(showing 25 most recent)':''}\n**Selected:** \`${selected.order_id}\`\n**Status:** ${selected.status}\n**Booster:** <@${selected.booster_id}>\n**Boost:** ${safeRequest(selected.hero,120)}\n**Level:** ${safeRequest(selected.level,120)}\n**Booster earnings:** ${earningsText(selected)}`
   :'No active orders available. Use Refresh Orders to check again.')
  .setFooter({text:manager?'Manager view · select any active order':'Showing your assigned active orders'}).setTimestamp();
 const rows=[];
 if(active.length){
  const options=active.slice(0,25).map(o=>({
   label:`${o.order_id} · ${o.status}`.slice(0,100),value:o.order_id,
   description:safeRequest(o.hero||'Boost order',95),default:o.order_id===selected.order_id
  }));
  rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('boosterpanel:select').setPlaceholder('Select an active order').addOptions(options)));
  rows.push(new ActionRowBuilder().addComponents(
   new ButtonBuilder().setCustomId('boosterpanel:start:'+selected.order_id).setLabel('Start Order').setStyle(ButtonStyle.Primary).setDisabled(selected.status!=='Pending'),
   new ButtonBuilder().setCustomId('boosterpanel:note:'+selected.order_id).setLabel('Update Progress').setStyle(ButtonStyle.Secondary),
   new ButtonBuilder().setCustomId('boosterpanel:complete:'+selected.order_id).setLabel('Complete Order').setStyle(ButtonStyle.Success).setDisabled(selected.status!=='In Progress')
  ));
 }
 rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('boosterpanel:refresh'+(selected?':'+selected.order_id:'')).setLabel('Refresh Orders').setStyle(ButtonStyle.Secondary).setEmoji('🔄')));
 return {embeds:[embed],components:rows,allowedMentions:{parse:[]}};
}
