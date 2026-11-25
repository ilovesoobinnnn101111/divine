import {SlashCommandBuilder,EmbedBuilder,MessageFlags} from 'discord.js';
import {readRecords} from '../../services/farm/records.js';
import {requestManager} from '../../services/farm/boostRequests.js';
import {isEligibleBooster} from '../../services/farm/boosterSecurity.js';
import {money,commission,earningsText} from '../../services/farm/boosterEarnings.js';
const recorded=o=>Number.isSafeInteger(o.booster_earnings_cents)&&o.booster_earnings_cents>=0;
const estimate=o=>typeof o.estimated_price==='number'&&Number.isFinite(o.estimated_price)&&o.estimated_price>=0;
const sum=rows=>rows.reduce((s,o)=>s+o.booster_earnings_cents,0);
const completedAt=o=>Number(o.completed_at)||Math.max(0,...(Array.isArray(o.status_history)?o.status_history:[]).filter(h=>h.status==='Completed').map(h=>Number(h.timestamp)||0));
export default {
 data:new SlashCommandBuilder().setName('boosterearnings').setDescription('View private booster commission totals')
 .addUserOption(o=>o.setName('booster').setDescription('View another booster (manager only)')),
 async execute(interaction,guildConfig,client){
  if(!interaction.inGuild()||(process.env.TEST_GUILD_ID&&interaction.guildId!==process.env.TEST_GUILD_ID))return interaction.reply({content:'Authorized server only.',flags:MessageFlags.Ephemeral});
  const manager=requestManager(interaction.member),target=interaction.options.getUser('booster')||interaction.user;
  if(!manager&&(!isEligibleBooster(interaction.member)||target.id!==interaction.user.id))return interaction.reply({content:'You may only view your own booster earnings.',flags:MessageFlags.Ephemeral});
  await interaction.deferReply({flags:MessageFlags.Ephemeral});
  let live,archive;
  try{[live,archive]=await Promise.all(['boosterOrders','boosterOrdersArchive'].map(k=>readRecords(client,interaction.guildId,k)));}catch{return interaction.editReply('Earnings records unavailable. Please try again later.');}
  const unique=new Map();
  for(const o of [...archive,...live])if(o.order_id)unique.set(o.order_id,o);
  const orders=[...unique.values()].filter(o=>o.booster_id===target.id);
  const active=orders.filter(o=>['Pending','In Progress'].includes(o.status));
  const completed=orders.filter(o=>o.status==='Completed');
  const earned=completed.filter(recorded);
  const unpaid=[...active,...completed].filter(o=>!recorded(o));
  const now=new Date(),month=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1),week=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()-(now.getUTCDay()+6)%7);
  const recent=[...active,...completed].sort((a,b)=>(b.updated_at||0)-(a.updated_at||0)).slice(0,8);
  const embed=new EmbedBuilder().setColor(0x2ECC71).setTitle('💵 Booster Earnings')
  .setDescription('**Booster:** <@'+target.id+'>\n**Completed, paid orders:** '+earned.length+'\n**Total recorded commission:** '+money(sum(earned)))
  .addFields(
   {name:'Active order commission',value:money(sum(active.filter(recorded))),inline:true},
   {name:'Estimated unpaid commission',value:money(unpaid.filter(estimate).reduce((s,o)=>s+commission(Math.round(o.estimated_price*100)),0)),inline:true},
   {name:'Completed this week (UTC)',value:money(sum(earned.filter(o=>completedAt(o)>=week&&completedAt(o)<=now.getTime()))),inline:true},
   {name:'Completed this month (UTC)',value:money(sum(earned.filter(o=>completedAt(o)>=month&&completedAt(o)<=now.getTime()))),inline:true},
   {name:'Unpaid orders without estimate',value:String(unpaid.filter(o=>!estimate(o)).length),inline:true},
   {name:'Recent orders',value:recent.map(o=>String(o.order_id).slice(0,40)+' · '+String(o.hero||'Boost').slice(0,40)+' · '+earningsText(o)).join('\n').slice(0,1024)||'No orders.'}
  ).setFooter({text:'Commission records only — not payout confirmation. Includes archived orders; excludes cancelled/failed.'}).setTimestamp();
  return interaction.editReply({embeds:[embed],allowedMentions:{parse:[]}});
 }
};
