import { SlashCommandBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { farmConfig } from '../../services/farm/config.js';
import { withRecordLock } from '../../services/farm/records.js';
export default {
 data:new SlashCommandBuilder().setName('altsettings').setDescription('Configure automatic account screening').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
 .addSubcommand(s=>s.setName('view').setDescription('View current settings'))
 .addSubcommand(s=>s.setName('update').setDescription('Update screening settings').addBooleanOption(o=>o.setName('enabled').setDescription('Enable automatic alerts')).addIntegerOption(o=>o.setName('moderate').setDescription('Moderate threshold').setMinValue(30).setMaxValue(84)).addIntegerOption(o=>o.setName('high').setDescription('High threshold').setMinValue(31).setMaxValue(85)))
 .addSubcommand(s=>s.setName('reset').setDescription('Restore default settings')),
 async execute(i,g,c){
 if(!i.inGuild()||i.guildId!==(process.env.TEST_GUILD_ID||process.env.GUILD_ID)||!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild))return i.reply({content:'Manage Server permission required.',flags:MessageFlags.Ephemeral});
 await i.deferReply({flags:MessageFlags.Ephemeral});
 if(!c.db?.isAvailable?.())return i.editReply('Database unavailable.');
 const defaults={enabled:true,moderate:30,high:60},key=farmConfig.databasePrefix+i.guildId+':altSettings',action=i.options.getSubcommand();
 const result=await withRecordLock(c,i.guildId,'altSettings',async()=>{
 const current={...defaults,...await c.db.get(key,{})};
 const next=action==='reset'?defaults:action==='update'?{enabled:i.options.getBoolean('enabled')??current.enabled,moderate:i.options.getInteger('moderate')??current.moderate,high:i.options.getInteger('high')??current.high}:current;
 if(next.high<=next.moderate)return null;
 if(action!=='view')await c.db.set(key,next);
 return next;
 });
 if(!result)return i.editReply('High threshold must exceed moderate threshold.');
 const arrow='<:x_whitearrow:1575129831988002968>',sparkle='<a:001_sparkles:1575070315724279918>';
 const embed=new EmbedBuilder().setColor(0xFFFFFF).setDescription('## '+sparkle+' Account Screening Settings').addFields({name:arrow+' Automatic Alerts',value:result.enabled?'Enabled':'Disabled'},{name:arrow+' Moderate Threshold',value:String(result.moderate),inline:true},{name:arrow+' High Threshold',value:String(result.high),inline:true},{name:arrow+' Automatic Punishments',value:'Disabled'}).setFooter({text:'Manual checks remain available'}).setTimestamp();
 return i.editReply({embeds:[embed]});
 }
};
