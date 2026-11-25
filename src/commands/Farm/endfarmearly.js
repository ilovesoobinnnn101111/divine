import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { getActiveFarm, completeFarm, earlyReasons } from '../../services/farm/sessionService.js';
export default {
 data:new SlashCommandBuilder().setName('endfarmearly').setDescription('End a farm early (hosts only)')
 .addStringOption(o=>o.setName('reason').setDescription('Reason').setRequired(true).addChoices(...Object.entries(earlyReasons).map(([value,name])=>({name,value})))),
 async execute(interaction,guildConfig,client){
  if(!interaction.inGuild()) return interaction.reply({content:'Server only.',flags:MessageFlags.Ephemeral});
  const session=await getActiveFarm(client,interaction.guildId,interaction.user.id);
  if(!session) return interaction.reply({content:'No active farm.',flags:MessageFlags.Ephemeral});
  if(session.hostId!==interaction.user.id) return interaction.reply({content:'Only the host who started this farm can end it early.',flags:MessageFlags.Ephemeral});
  const reason=interaction.options.getString('reason');
  if(!Object.hasOwn(earlyReasons,reason))return interaction.reply({content:'Invalid reason.',flags:MessageFlags.Ephemeral});
  await interaction.deferReply({flags:MessageFlags.Ephemeral});
  if(!await completeFarm(client,interaction.guildId,session,'EARLY',reason))return interaction.editReply('Farm is no longer active.');
  const channel=await client.channels.fetch(session.channelId).catch(()=>null);
  const message=await channel?.messages.fetch(session.messageId).catch(()=>null);
  if(message) await message.edit({content:`Farm has ended early. Reason: ${earlyReasons[reason]}`,embeds:[],components:[]}).catch(()=>{});
  return interaction.editReply(`Farm has ended early: ${earlyReasons[reason]}`);
 }
};
