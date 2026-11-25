import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { readRecords, withRecordLock } from '../../services/farm/records.js';
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
  const sessions=(await readRecords(client,interaction.guildId,'completedSessions'))
    .filter(x=>x.hostId===host.id && x.playerIds?.includes(interaction.user.id) && x.reason!=='CANCELLED')
    .sort((a,b)=>b.endedAt-a.endedAt);
  if(!sessions.length) return interaction.reply({content:'You can only vouch for a host after participating in one of their completed farms.',flags:MessageFlags.Ephemeral});
  const result=await withRecordLock(client,interaction.guildId,'vouches',async()=>{
    if(!client.db?.isAvailable?.()) throw new Error('PostgreSQL unavailable.');
    const existing=await readRecords(client,interaction.guildId,'vouches');
    const eligible=sessions.find(x=>!existing.some(v=>v.sessionId===x.id && v.voterId===interaction.user.id));
    if(!eligible) return null;
    const record={id:`V-${interaction.id}`,sessionId:eligible.id,hostId:host.id,voterId:interaction.user.id,rating:interaction.options.getInteger('rating'),comment:interaction.options.getString('comment')||null,timestamp:Date.now()};
    await client.db.set(`${farmConfig.databasePrefix}${interaction.guildId}:vouches`,[...existing,record]);
    return record;
  });
  if(!result) return interaction.reply({content:'You have already vouched for every eligible farm session with this host.',flags:MessageFlags.Ephemeral});
  const record=result;
  const channel=farmConfig.channels.hostVouch?await client.channels.fetch(farmConfig.channels.hostVouch).catch(()=>null):null;
  if(channel?.send&&channel.guildId===interaction.guildId) await channel.send({content:`⭐ <@${record.voterId}> rated <@${record.hostId}> ${record.rating}/5${record.comment?` — ${record.comment}`:''}`,allowedMentions:{parse:[]}}).catch(()=>{});
  return interaction.reply({content:'Your host vouch has been recorded.',flags:MessageFlags.Ephemeral});
 }
};
