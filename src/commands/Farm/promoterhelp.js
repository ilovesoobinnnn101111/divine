import {SlashCommandBuilder,MessageFlags,EmbedBuilder} from 'discord.js';
const sections=[["Promoter commands",["promoterlog","mypromotions","link"]],["Promoter manager commands",["promotioncheck","searchpromotions","overdue","resetpromotions"]]];
export default {
 data:new SlashCommandBuilder().setName('promoterhelp').setDescription('Show promoter system commands'),
 async execute(interaction,guildConfig,client){
 if(!interaction.inGuild()||(process.env.TEST_GUILD_ID&&interaction.guildId!==process.env.TEST_GUILD_ID))return interaction.reply({content:'Authorized server only.',flags:MessageFlags.Ephemeral});
 const embeds=[];
 for(const [heading,names] of sections){
 const lines=names.map(name=>{const cmd=client.commands.get(name);return cmd?'**/'+name+'** — '+cmd.data.description:null;}).filter(Boolean);
 if(!lines.length)continue;
 embeds.push(new EmbedBuilder().setColor(0xD95387).setTitle(heading).setDescription(lines.join('\n')).setFooter({text:'Command permissions still apply.'}));
 }
 return interaction.reply({embeds,flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]}});
 }
};
