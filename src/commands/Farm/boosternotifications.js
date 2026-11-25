import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { readRecords } from '../../services/farm/records.js';
import { requestManager } from '../../services/farm/boostRequests.js';
export default {
 data:new SlashCommandBuilder().setName('boosternotifications').setDescription('View recent booster DM delivery history (manager only)')
 .addStringOption(o=>o.setName('order_id').setDescription('Filter by order ID').setRequired(false)),
 async execute(interaction,guildConfig,client){
  if(!interaction.inGuild()||(process.env.TEST_GUILD_ID&&interaction.guildId!==process.env.TEST_GUILD_ID))
   return interaction.reply({content:'Test server only.',flags:MessageFlags.Ephemeral});
  if(!requestManager(interaction.member))return interaction.reply({content:'Booster Manager role required.',flags:MessageFlags.Ephemeral});
  if(!client.db?.isAvailable?.())return interaction.reply({content:'PostgreSQL unavailable.',flags:MessageFlags.Ephemeral});
  await interaction.deferReply({flags:MessageFlags.Ephemeral});
  try{
   const id=interaction.options.getString('order_id');
   const rows=(await readRecords(client,interaction.guildId,'boosterNotifications')).filter(x=>!id||x.order_id===id);
   const lines=rows.slice(-15).reverse().map(x=>`${x.status==='Delivered'?'✅':'❌'} \`${String(x.order_id).slice(0,40)}\` · ${String(x.type).slice(0,35)} · ${x.status} · <t:${Math.floor(x.created_at/1000)}:R>${x.error?' · '+String(x.error).slice(0,90):''}`);
   const embed=new EmbedBuilder().setTitle('📨 Booster Notification History').setColor(0x5865F2)
    .setDescription((lines.join('\n')||'No notification attempts recorded.').slice(0,4000))
    .setFooter({text:`Showing latest 15 of ${rows.length} attempts · DM failures do not revert orders`});
   return interaction.editReply({embeds:[embed],allowedMentions:{parse:[]}});
  }catch{return interaction.editReply('Unable to load notification history.');}
 }
};
