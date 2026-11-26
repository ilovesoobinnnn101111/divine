import { SlashCommandBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { readRecords } from '../../services/farm/records.js';
export default {
 data:new SlashCommandBuilder().setName('altstats').setDescription('View account screening statistics').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
 async execute(i,g,c){
 if(!i.inGuild()||i.guildId!==(process.env.TEST_GUILD_ID||process.env.GUILD_ID)||!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild))return i.reply({content:'Manage Server permission required.',flags:MessageFlags.Ephemeral});
 await i.deferReply({flags:MessageFlags.Ephemeral});
 if(!c.db?.isAvailable?.())return i.editReply('Database unavailable.');
 const [logs,whitelist]=await Promise.all([readRecords(c,i.guildId,'altScreeningLogs'),readRecords(c,i.guildId,'altWhitelist')]);
 const rows=logs.filter(r=>r&&r.memberId),now=Date.now(),recent=days=>rows.filter(r=>Number(r.timestamp)>=now-days*86400000&&Number(r.timestamp)<=now).length;
 const arrow='<:x_whitearrow:1575129831988002968>',sparkle='<a:001_sparkles:1575070315724279918>',cat='<:qw_pwhitekat:1575470985405010022>',butterfly='<:gs_white_butterfly:1573946745577279608>';
 const embed=new EmbedBuilder().setColor(0xFFFFFF).setDescription('## '+sparkle+' Account Screening Statistics').addFields(
 {name:sparkle+' Total Alerts',value:String(rows.length),inline:true},
 {name:butterfly+' Unique Flagged Accounts',value:String(new Set(rows.map(r=>r.memberId)).size),inline:true},
 {name:butterfly+' Whitelisted Accounts',value:String(new Set(whitelist.filter(r=>r?.memberId).map(r=>r.memberId)).size),inline:true},
 {name:cat+' Screening Breakdown',value:arrow+' **High:** '+rows.filter(r=>r.level==='High').length+'\n'+arrow+' **Moderate:** '+rows.filter(r=>r.level==='Moderate').length},
 {name:sparkle+' Recent Activity',value:arrow+' **Past 24 hours:** '+recent(1)+'\n'+arrow+' **Past 7 days:** '+recent(7)+'\n'+arrow+' **Past 30 days:** '+recent(30)}
 ).setFooter({text:'Stored automatic alerts only • Not confirmed alternate accounts'}).setTimestamp();
 return i.editReply({embeds:[embed],allowedMentions:{parse:[]}});
 }
};
