import {launcherRows} from '../../services/farm/trainerLauncher.js';
import { SlashCommandBuilder, MessageFlags, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
export default {
 data:new SlashCommandBuilder().setName('watcher-setup').setDescription('Post or update the trainer report panel').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
 async execute(interaction,guildConfig,client){
 if(!interaction.inGuild()||!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild))return interaction.reply({content:'Manage Server required.',flags:MessageFlags.Ephemeral});
 await interaction.deferReply({flags:MessageFlags.Ephemeral});
 const channel=await interaction.guild.channels.fetch('1571956074519601275').catch(()=>null);
 if(!channel?.isSendable?.())return interaction.editReply('Trainer panel channel is unavailable.');
 const commands=await interaction.guild.commands.fetch();
 const command=commands.find(c=>c.name==='watcher-report');
 if(!command)return interaction.editReply('Watcher report command is not registered in this server.');
 const mention='</watcher-report:'+command.id+'>';
 const embed=new EmbedBuilder().setColor(0xFFFFFF).setDescription('## <a:001_sparkles:1575070315724279918> Host Trainee Farm Report\nSubmit your trial host evaluation after completing a training session.\n\n<:gs_white_butterfly:1573946745577279608> **Farm Types**\n<:x_whitearrow:1575129831988002968> Hybrid or 222\n\n<:qw_pwhitekat:1575470985405010022> **Required Information**\n<:x_whitearrow:1575129831988002968> Trial host\n<:x_whitearrow:1575129831988002968> Training duration\n<:x_whitearrow:1575129831988002968> Evaluation notes\n<:x_whitearrow:1575129831988002968> Scoreboard screenshot\n\n<:1CL_checkwhite:1575465471015260190> **Submit your report**\nSelect your farm type below and press Next. Your training minutes will be recorded automatically.').setFooter({text:'Divine • Trainer Reports'});
 const key='watcherSetup:'+interaction.guildId;
 const oldId=await client.db.get(key,null);
 const old=oldId?await channel.messages.fetch(oldId).catch(()=>null):null;
 if(old&&old.author.id===client.user.id)await old.edit({embeds:[embed],components:launcherRows()});
 else {const message=await channel.send({embeds:[embed],components:launcherRows(),allowedMentions:{parse:[]}});await client.db.set(key,message.id);}
 return interaction.editReply('Trainer report panel is ready in <#'+channel.id+'>.');
 }
};
