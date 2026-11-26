import { SlashCommandBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { readRecords } from '../../services/farm/records.js';
export default {
 data:new SlashCommandBuilder().setName('altlogs').setDescription('View account screening history').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).addUserOption(o=>o.setName('member').setDescription('Filter by member')).addIntegerOption(o=>o.setName('page').setDescription('History page').setMinValue(1)),
 async execute(interaction,guildConfig,client){
 if(!interaction.inGuild()||interaction.guildId!==(process.env.TEST_GUILD_ID||process.env.GUILD_ID)||!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild))return interaction.reply({content:'Manage Server permission required in the configured server.',flags:MessageFlags.Ephemeral});
 await interaction.deferReply({flags:MessageFlags.Ephemeral});
 if(!client.db?.isAvailable?.())return interaction.editReply('Screening history is temporarily unavailable.');
 const user=interaction.options.getUser('member');
 const records=(await readRecords(client,interaction.guildId,'altScreeningLogs')).filter(r=>r&&(!user||r.memberId===user.id)).sort((a,b)=>Number(b.timestamp)-Number(a.timestamp));
 const size=5,pages=Math.max(1,Math.ceil(records.length/size)),page=Math.min(pages,interaction.options.getInteger('page')||1);
 const arrow='<:x_whitearrow:1575129831988002968>',sparkle='<a:001_sparkles:1575070315724279918>';
 const embed=new EmbedBuilder().setColor(0xFFFFFF).setDescription('## '+sparkle+' Account Screening History\n'+(user?'Member: <@'+user.id+'>\n':'')+'**Total alerts:** '+records.length).setFooter({text:'Page '+page+'/'+pages+' • Indicators only, not proof of alt ownership'}).setTimestamp();
 for(const r of records.slice((page-1)*size,page*size)){
 const reasons=Array.isArray(r.reasons)?r.reasons.map(x=>arrow+' '+String(x)).join('\n'):'No recorded indicators';
 embed.addFields({name:arrow+' '+String(r.level)+' — '+String(r.score)+' points',value:('<@'+r.memberId+'>\n<t:'+Math.floor(Number(r.timestamp)/1000)+':f>\n'+reasons).slice(0,1024)});
 }
 if(!records.length)embed.addFields({name:arrow+' History',value:'No screening alerts found.'});
 return interaction.editReply({embeds:[embed],allowedMentions:{parse:[]}});
 }
};
