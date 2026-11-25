import { appendRecord } from '../../services/farm/records.js';
import { SlashCommandBuilder, EmbedBuilder, MessageFlags, escapeMarkdown } from 'discord.js';
const ROLE = '1571956072862851094';
const CHANNEL = '1571956074184179783';
const TITLE = '<:Icon_2GreyStars:1575057259099324549>';
const STAR = '<:star:1575057103171747963>';
export default {
 data: new SlashCommandBuilder().setName('vouch').setDescription('Review your boosting order')
 .addUserOption(o=>o.setName('booster').setDescription('The booster who completed your order').setRequired(true))
 .addIntegerOption(o=>o.setName('rating').setDescription('Rate your experience from 1 to 5').setMinValue(1).setMaxValue(5).setRequired(true))
 .addStringOption(o=>o.setName('review').setDescription('Describe your order experience').setMinLength(3).setMaxLength(1000).setRequired(true)),
 async execute(interaction,guildConfig,client){
 const guildId=process.env.TEST_GUILD_ID || process.env.GUILD_ID;
 if(!interaction.inGuild() || interaction.guildId!==guildId || !interaction.member.roles.cache.has(ROLE)) return interaction.reply({content:'You need the vouch role to submit a review.',flags:MessageFlags.Ephemeral});
 const booster=interaction.options.getUser('booster',true);
 if(booster.bot || booster.id===interaction.user.id) return interaction.reply({content:'Choose another server member.',flags:MessageFlags.Ephemeral});
 const rating=interaction.options.getInteger('rating',true);
 const review=interaction.options.getString('review',true).trim();
 if(review.length<3)return interaction.reply({content:'Please provide a review.',flags:MessageFlags.Ephemeral});
 await interaction.deferReply({flags:MessageFlags.Ephemeral});
 const member=await interaction.guild.members.fetch(booster.id).catch(()=>null);
 if(!member)return interaction.editReply('Choose a member of this server.');
 const channel=await interaction.guild.channels.fetch(process.env.BOOST_VOUCH_CHANNEL_ID||CHANNEL).catch(()=>null);
 if(!channel?.isTextBased() || !channel.isSendable())return interaction.editReply('The vouch channel is unavailable. Contact staff.');
 const embed=new EmbedBuilder().setColor(0xFFFFFF)
 .setThumbnail(booster.displayAvatarURL({size:256}))
 .setDescription('# '+TITLE+' **New Vouch** '+TITLE+'\n\n> ╰ **From <@'+interaction.user.id+'>**\n> ╰ **For <@'+booster.id+'>**')
 .addFields({name:'Rating',value:'> '+Array(rating).fill(STAR).join(' ')+'  **'+rating+'/5**'},{name:'Review',value:review.split(/\r?\n/).map(line=>'> **'+escapeMarkdown(line)+'**').join('\n').slice(0,1024)})
 .setFooter({text:'Thank You For Your Feedback 𓂃˖ ࣪⊹'}).setTimestamp();
 try{const posted=await channel.send({embeds:[embed],allowedMentions:{parse:[]}});try{await appendRecord(client,interaction.guildId,'boostVouches',{id:posted.id,boosterId:booster.id,voterId:interaction.user.id,rating,comment:review,timestamp:Date.now()});}catch(error){await posted.delete().catch(()=>{});throw error;}}catch{return interaction.editReply('Your vouch could not be posted. Please contact staff.');}
 return interaction.editReply('Your vouch has been posted in <#'+CHANNEL+'>.');
 }
};
