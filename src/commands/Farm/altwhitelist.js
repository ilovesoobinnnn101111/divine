import { SlashCommandBuilder, MessageFlags, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { readRecords, withRecordLock } from '../../services/farm/records.js';
import { farmConfig } from '../../services/farm/config.js';
export default {
 data:new SlashCommandBuilder().setName('altwhitelist').setDescription('Manage trusted account screening exemptions').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
 .addSubcommand(s=>s.setName('add').setDescription('Exempt a member').addUserOption(o=>o.setName('member').setDescription('Trusted member').setRequired(true)))
 .addSubcommand(s=>s.setName('remove').setDescription('Remove an exemption').addUserOption(o=>o.setName('member').setDescription('Member').setRequired(true)))
 .addSubcommand(s=>s.setName('list').setDescription('View exemptions').addIntegerOption(o=>o.setName('page').setDescription('Page').setMinValue(1))),
 async execute(i,g,c){
 if(!i.inGuild()||i.guildId!==(process.env.TEST_GUILD_ID||process.env.GUILD_ID)||!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild))return i.reply({content:'Manage Server permission required.',flags:MessageFlags.Ephemeral});
 await i.deferReply({flags:MessageFlags.Ephemeral});
 if(!c.db?.isAvailable?.())return i.editReply('Database unavailable.');
 const kind='altWhitelist',action=i.options.getSubcommand();
 if(action==='list'){
 const rows=await readRecords(c,i.guildId,kind),pages=Math.max(1,Math.ceil(rows.length/20)),page=Math.min(pages,i.options.getInteger('page')||1);
 const embed=new EmbedBuilder().setColor(0xFFFFFF).setDescription('## <:gs_white_butterfly:1573946745577279608> Screening Whitelist\n'+(rows.slice((page-1)*20,page*20).map(r=>'<:x_whitearrow:1575129831988002968> <@'+r.memberId+'>').join('\n')||'No exemptions.')).setFooter({text:'Page '+page+'/'+pages+' | Total: '+rows.length});
 return i.editReply({embeds:[embed],allowedMentions:{parse:[]}});
 }
 const user=i.options.getUser('member',true);
 if(action==='add'&&!(await i.guild.members.fetch(user.id).catch(()=>null)))return i.editReply('Select a current server member.');
 const result=await withRecordLock(c,i.guildId,kind,async()=>{
 const rows=await readRecords(c,i.guildId,kind),exists=rows.some(r=>r.memberId===user.id);
 if(action==='add'&&exists)return 'Already exempt.';
 if(action==='remove'&&!exists)return 'No exemption found.';
 const next=action==='add'?[...rows,{memberId:user.id,addedBy:i.user.id,timestamp:Date.now()}]:rows.filter(r=>r.memberId!==user.id);
 await c.db.set(farmConfig.databasePrefix+i.guildId+':'+kind,next);
 return action==='add'?'Screening exemption added.':'Screening exemption removed.';
 });
 return i.editReply(result);
 }
};
