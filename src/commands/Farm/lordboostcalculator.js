import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { memberHasFarmRole } from '../../services/farm/config.js';
import { tiers } from '../../services/farm/lordPricing.js';
const arrow='<:UtilityArrow:1575069345321582662>';
const ranks=['<:agent:1575070122878443692>','<:knight:1575070055144890398>','<:captain:1575070014556610622>','<:Centurion:1575069968645619822>','<:lord:1575069926618566716>','<:r_1count:1575069857907474484>','<:r_2colonel:1575069808880525413>','<:r_3warrior:1575069770322280558>','<:r_5elite:1575069387143127051>','<:r_4guardian:1575069662134272040>','<:Champion:1575069508853301359>'];
const line=(emoji,name)=>arrow+' '+emoji+' **'+name+'**';
const shop='1571956074008027144',purchase='1571956074008027143';
export default {
 data:new SlashCommandBuilder().setName('lordboostcalculator').setDescription('Post the Divine Lord Boost shop (Booster Manager only)')
 .addAttachmentOption(o=>o.setName('header').setDescription('Divine shop header image').setRequired(true))
 .addAttachmentOption(o=>o.setName('logo').setDescription('Divine Lord Boost logo').setRequired(true))
 .addAttachmentOption(o=>o.setName('banner').setDescription('Animated footer banner').setRequired(true)),
 async execute(interaction){
 if(!interaction.inGuild()||interaction.guildId!==(process.env.TEST_GUILD_ID||process.env.GUILD_ID))return interaction.reply({content:'Configured server only.',flags:MessageFlags.Ephemeral});
 if(!memberHasFarmRole(interaction.member,(process.env.BOOSTER_MANAGER_ROLE_ID||'').split(',').map(x=>x.trim()).filter(Boolean)))return interaction.reply({content:'Booster Manager role required.',flags:MessageFlags.Ephemeral});
 await interaction.deferReply({flags:MessageFlags.Ephemeral});
 const channel=await interaction.guild.channels.fetch(shop).catch(()=>null);
 if(!channel?.isSendable())return interaction.editReply('Shop channel unavailable.');
 const assets=['header','logo','banner'].map(n=>interaction.options.getAttachment(n,true));
 if(assets.some(a=>!['image/png','image/jpeg','image/gif','image/webp'].includes(a.contentType)||a.size>8000000))return interaction.editReply('Use PNG, JPEG, GIF or WebP images under 8 MB each.');
 const names=assets.map((a,i)=>['header','logo','banner'][i]+'.'+({'image/png':'png','image/jpeg':'jpg','image/gif':'gif','image/webp':'webp'}[a.contentType]));
 const description=[
 '## <a:001_sparkles:1575070315724279918> Lord Boosting Shop <:gwhiteheart:1575080015794536510>',
 '**Why Choose Us?**',
 '<a:WhiteShootingStar:1575070732503879731> Fast Delivery <a:check:1575070249764528158>',
 '<:yg_exclaim:1573609297231876126> Safe & Verified <a:check:1575070249764528158>',
 '<:yg_exclaim:1573609297231876126> Flexible Schedule <a:check:1575070249764528158>',
 '', '**<:white_sparkle:1575071348173316216> Platforms Supported <:white_sparkle:1575071348173316216>**',
 line('<:steam:1575070382795399270>','Steam'),line('<:epicgames:1575070426839785522>','Epic Games'),line('<:playstation:1575070480182939788>','PlayStation'),line('<:xbox:1575070605957668885>','Xbox'),
 '', '**<a:WhiteShootingStar:1575070732503879731> Proficiency Levels <a:WhiteShootingStar:1575070732503879731>**',
 ...tiers.slice(0,11).map(([name,price],i)=>line(ranks[i],name)+' — '+(i===0?'**Starting Level**':'$'+price)),
 '', '🗳️ **Full Package (Agent → Champion) — $230**','<:09_warningsign:1575061621406175272> **Every 5 Levels After Level 50 — $60**','Prices may vary for certain characters.',
 '', '**<a:001_sparkles:1575070315724279918> Payment Methods Supported <a:001_sparkles:1575070315724279918>**',
 line('<:Venmo:1575071527555309608>','Venmo'),line('<:Zelle:1575071574640562176>','Zelle'),line('<:54735paypal:1575071618697269359>','PayPal'),line('<:eldorado:1575071660191776798>','Eldorado'),line('<:CashApp:1575070778855129098>','Cash App'),
 '', '**Lord Boost Calculator**','Click Estimate Your Order Cost below.',
 '', '**<a:WhiteShootingStar:1575070732503879731> How To Order <a:WhiteShootingStar:1575070732503879731>**',
 arrow+' Open a ticket in <#'+purchase+'>',arrow+' Choose your desired proficiency level',arrow+' Complete payment via your preferred method',arrow+' Coordinate order details with staff; never share passwords or authentication codes in Discord.',arrow+' Wait for your order to be finished',
 '', '<:09_warningsign:1575061621406175272> No refunds after purchase.'
 ].join('\n');
 const embeds=[new EmbedBuilder().setColor(0xF5A9D0).setImage('attachment://'+names[0]),new EmbedBuilder().setColor(0xF5A9D0).setDescription(description).setThumbnail('attachment://'+names[1]).setImage('attachment://'+names[2])];
 const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('lordcalc:open').setStyle(ButtonStyle.Primary).setLabel('Estimate Your Order Cost').setEmoji('1575069926618566716'),new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Purchase Lord Boost Here').setURL('https://discord.com/channels/'+interaction.guildId+'/'+purchase));
 try{await channel.send({embeds,components:[row],files:assets.map((a,i)=>({attachment:a.url,name:names[i]})),allowedMentions:{parse:[]}});return interaction.editReply('Shop posted in <#'+shop+'>.');}catch(e){return interaction.editReply('Could not post shop. Check channel permissions and image sizes.');}
 }
};
