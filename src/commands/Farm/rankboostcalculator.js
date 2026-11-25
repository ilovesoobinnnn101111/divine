import { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SectionBuilder, ThumbnailBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, SeparatorBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { memberHasFarmRole } from '../../services/farm/config.js';
const arrow='<:UtilityArrow:1575069345321582662>';
const line=(emoji,name)=>arrow+' '+emoji+' **'+name+'**';
const shop='1571956074008027145',purchase='1571956074008027143';
export default {
 data:new SlashCommandBuilder().setName('rankboostcalculator').setDescription('Post the Divine Rank Boost shop (Booster Manager only)')
 .addAttachmentOption(o=>o.setName('header').setDescription('Divine shop header image').setRequired(true))
 .addAttachmentOption(o=>o.setName('logo').setDescription('Divine Rank Boost logo').setRequired(true))
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
 '# <a:001_sparkles:1575070315724279918> Rank Boosting Shop <:gwhiteheart:1575080015794536510>',
 '**Why Choose Us?**',
 '<a:WhiteShootingStar:1575070732503879731> Fast Delivery <a:check:1575070249764528158>',
 '<:yg_exclaim:1573609297231876126> Safe & Verified <a:check:1575070249764528158>',
 '<:yg_exclaim:1573609297231876126> Flexible Schedule <a:check:1575070249764528158>',
 '', '## **<:white_sparkle:1575071348173316216> Types Of Boosting <:white_sparkle:1575071348173316216>**',
 arrow+' **SOLO BOOSTING** — A booster plays on your account. Coordinate arrangements with staff; never share passwords or authentication codes in Discord.',
 arrow+' **DUO BOOSTING** — Queue together with your booster; no account credentials needed.',
 '', '## **<:white_sparkle:1575071348173316216> Platforms Supported <:white_sparkle:1575071348173316216>**',
 line('<:steam:1575070382795399270>','Steam'),line('<:epicgames:1575070426839785522>','Epic Games'),line('<:playstation:1575070480182939788>','PlayStation'),line('<:xbox:1575070605957668885>','Xbox'),
 '', '## **<a:WhiteShootingStar:1575070732503879731> Rank Pricing <a:WhiteShootingStar:1575070732503879731>**',
 '<:bronze:1575085058426150912> <:silver:1575084402218897469> <:gold:1575084372665569371> **Bronze through Platinum (each full rank tier)**',
 arrow+' **SOLO** — $20',arrow+' **DUO** — $30',
 '\n**Platinum → <:diamondrank:1575084305699446854> Diamond**',arrow+' **SOLO** — $30',arrow+' **DUO** — $40',
 '\n<:diamondrank:1575084305699446854> **Diamond → Grandmaster**',arrow+' **SOLO** — $40',arrow+' **DUO** — $60',
 '\n**Grandmaster → <:celestial:1575084220768845836> Celestial**',arrow+' **SOLO** — $80',arrow+' **DUO** — $100',
 '\n<:celestial:1575084220768845836> **Celestial → <:eternity:1575084251521486848> Eternity**',arrow+' **SOLO** — Negotiable',arrow+' **DUO** — Negotiable',
 '<:oneaboveall:1575084187571068990> **One Above All — Negotiable**',
 '<:09_warningsign:1575061621406175272> **Custom Plans Available As Well.**',
 '', '## **<a:001_sparkles:1575070315724279918> Payment Methods Supported <a:001_sparkles:1575070315724279918>**',
 line('<:Venmo:1575071527555309608>','Venmo'),line('<:Zelle:1575071574640562176>','Zelle'),line('<:54735paypal:1575071618697269359>','PayPal'),line('<:eldorado:1575071660191776798>','Eldorado'),line('<:CashApp:1575070778855129098>','Cash App'),
 '', '**Rank Boost Calculator**','Click Estimate Your Order Cost below.',
 '', '## **<a:WhiteShootingStar:1575070732503879731> How To Order <a:WhiteShootingStar:1575070732503879731>**',
 arrow+' Open a ticket in <#'+purchase+'>',arrow+' Choose your desired rank',arrow+' Complete payment via your preferred method',arrow+' Coordinate order details with staff; never share passwords or authentication codes in Discord.',arrow+' Wait for your order to be finished',
 '', '<:09_warningsign:1575061621406175272> No refunds after purchase.'\n ].join('\n');
 const text=value=>new TextDisplayBuilder().setContent(value);
 const separator=()=>new SeparatorBuilder().setDivider(true);
 const calculator=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('rankcalc:open').setStyle(ButtonStyle.Primary).setLabel('Estimate Your Order Cost').setEmoji('1575084220768845836'));
 const order=new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Purchase Rank Boost Here').setURL('https://discord.com/channels/'+interaction.guildId+'/'+purchase));
 const sections=description.split('\n\n');
 const container=new ContainerBuilder().setAccentColor(0xF5A9D0)
 .addSectionComponents(new SectionBuilder().addTextDisplayComponents(text(sections[0])).setThumbnailAccessory(new ThumbnailBuilder().setURL('attachment://'+names[1])));
 for(const section of sections.slice(1)){
 if(section.startsWith('<:09_warningsign')&&section.includes('No refunds')){container.addTextDisplayComponents(text(section));continue;}
 container.addSeparatorComponents(separator()).addTextDisplayComponents(text(section));
 if(section.includes('**Rank Boost Calculator**'))container.addActionRowComponents(calculator);
 }
 container.addActionRowComponents(order).addSeparatorComponents(separator()).addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://'+names[2])));
 let headerMessage;
 try{
 headerMessage=await channel.send({files:[{attachment:assets[0].url,name:names[0]}],allowedMentions:{parse:[]}});
 await channel.send({flags:MessageFlags.IsComponentsV2,components:[container],files:assets.slice(1).map((a,i)=>({attachment:a.url,name:names[i+1]})),allowedMentions:{parse:[]}});
 return interaction.editReply('Shop posted in <#'+shop+'>.');
 }catch(e){if(headerMessage)await headerMessage.delete().catch(()=>{});return interaction.editReply('Could not post shop. Check channel permissions and image sizes.');}

 }
};
