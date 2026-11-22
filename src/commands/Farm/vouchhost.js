import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { readRecords, appendRecord } from '../../services/farm/records.js';
import { farmConfig } from '../../services/farm/config.js';
export default {
 data:new SlashCommandBuilder().setName('vouchhost').setDescription('Rate a farm host from 1 to 5 stars')
 .addUserOption(o=>o.setName('host').setDescription('Host to rate').setRequired(true))
 .addIntegerOption(o=>o.setName('rating').setDescription('Stars').setRequired(true).setMinValue(1).setMaxValue(5))
 .addStringOption(o=>o.setName('comment').setDescription('Optional comment').setMaxLength(500)),
 async execute(interaction,guildConfig,client){
  if(!interaction.inGuild()) return interaction.reply({content:'Server only.',flags:MessageFlags.Ephemeral});
  const host=interaction.options.getUser('host');
  if(host.bot||host.id===interaction.user.id) return interaction.reply({content:'You cannot vouch for yourself or a bot.',flags:MessageFlags.Ephemeral});
  const logs=await readRecords(client,interaction.guildId,'hostLogs');
  if(!logs.some(x=>x.hostId===host.id||x.cohostId===host.id)) return interaction.reply({content:'This host does not have a recorded session yet.',flags:MessageFlags.Ephemeral});
  const record={id:`V-${interaction.id}`,hostId:host.id,voterId:interaction.user.id,rating:interaction.options.getInteger('rating'),comment:interaction.options.getString('comment')||null,timestamp:Date.now()};
  await appendRecord(client,interaction.guildId,'vouches',record);
  const channel=farmConfig.channels.hostVouch?await client.channels.fetch(farmConfig.channels.hostVouch).catch(()=>null):null;
  if(channel?.send&&channel.guildId===interaction.guildId) await channel.send({content:`⭐ <@${record.voterId}> rated <@${record.hostId}> ${record.rating}/5${record.comment?` — ${record.comment}`:''}`,allowedMentions:{parse:[]}}).catch(()=>{});
  return interaction.reply({content:'Your host vouch has been recorded.',flags:MessageFlags.Ephemeral});
 }
};
