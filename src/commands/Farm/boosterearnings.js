import {payoutView} from '../../services/farm/boosterPayout.js';
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
  return interaction.editReply(await payoutView(client,interaction.guildId,target.id,manager));
 }
};
