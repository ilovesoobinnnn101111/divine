import { SlashCommandBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits } from 'discord.js';
export default {
 data:new SlashCommandBuilder().setName('altcheck').setDescription('Review account screening indicators').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).addUserOption(o=>o.setName('member').setDescription('Server member to screen').setRequired(true)),
 async execute(interaction,guildConfig,client){
 if(!interaction.inGuild()||interaction.guildId!==(process.env.TEST_GUILD_ID||process.env.GUILD_ID)||!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild))return interaction.reply({content:'Manage Server permission required in the configured server.',flags:MessageFlags.Ephemeral});
 await interaction.deferReply({flags:MessageFlags.Ephemeral});
 const user=interaction.options.getUser('member',true);
 const member=await interaction.guild.members.fetch(user.id).catch(()=>null);
 if(!member||user.bot)return interaction.editReply('Select a current non-bot server member.');
 const age=(Date.now()-user.createdTimestamp)/86400000;
 let score=0;const reasons=[];
 if(age<1){score+=50;reasons.push('Account created less than 24 hours ago');}
 else if(age<7){score+=30;reasons.push('Account younger than 7 days');}
 else if(age<30){score+=15;reasons.push('Account younger than 30 days');}
 if(!user.avatar){score+=10;reasons.push('Default profile picture');}
 const arrow='<:x_whitearrow:1575129831988002968>',sparkle='<a:001_sparkles:1575070315724279918>',cat='<:qw_pwhitekat:1575470985405010022>';
 const embed=new EmbedBuilder().setColor(0xFFFFFF).setThumbnail(user.displayAvatarURL()).setDescription('## '+sparkle+' Account Screening').addFields(
 {name:arrow+' Member',value:'<@'+user.id+'>'},
 {name:arrow+' Account Created',value:'<t:'+Math.floor(user.createdTimestamp/1000)+':R>',inline:true},
 {name:arrow+' Server Joined',value:member.joinedTimestamp?'<t:'+Math.floor(member.joinedTimestamp/1000)+':R>':'Unknown',inline:true},
 {name:arrow+' Avatar',value:user.avatar?'Custom':'Default',inline:true},
 {name:arrow+' Screening Score',value:(score>=60?'High':score>=30?'Moderate':'Low')+' — '+score+' points'},
 {name:cat+' Indicators',value:reasons.length?reasons.map(r=>arrow+' '+r).join('\n'):'No account indicators detected'}
 ).setFooter({text:'Manual check excludes join bursts • Not proof of alt ownership'}).setTimestamp();
 return interaction.editReply({embeds:[embed],allowedMentions:{parse:[]}});
 }
};
