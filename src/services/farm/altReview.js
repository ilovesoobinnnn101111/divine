import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { readRecords, withRecordLock } from './records.js';
import { farmConfig } from './config.js';
export function altReviewRow(disabled=false){
 return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('alt_review:acknowledged').setLabel('Acknowledge').setStyle(ButtonStyle.Secondary).setDisabled(disabled),new ButtonBuilder().setCustomId('alt_review:dismissed').setLabel('Dismiss').setStyle(ButtonStyle.Secondary).setDisabled(disabled));
}
export async function handleAltReview(i,c){
 if(!i.isButton()||!i.inGuild()||i.guildId!==(process.env.TEST_GUILD_ID||process.env.GUILD_ID)||i.channelId!=='1571956074008027137'||i.message.author.id!==c.user.id||!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild))return i.reply({content:'Not authorized.',flags:MessageFlags.Ephemeral});
 const status=i.customId.split(':')[1];
 if(!['acknowledged','dismissed'].includes(status))return i.reply({content:'Invalid review.',flags:MessageFlags.Ephemeral});
 await i.deferReply({flags:MessageFlags.Ephemeral});
 if(!c.db?.isAvailable?.())return i.editReply('Database unavailable.');
 const kind='altScreeningLogs';
 const result=await withRecordLock(c,i.guildId,kind,async()=>{
 const rows=await readRecords(c,i.guildId,kind),record=rows.find(r=>r.messageId===i.message.id);
 if(!record)return null;
 if(!record.review){record.review={status,reviewerId:i.user.id,timestamp:Date.now()};await c.db.set(farmConfig.databasePrefix+i.guildId+':'+kind,rows);}
 return record.review;
 });
 if(!result)return i.editReply('No stored alert found. Try again later.');
 const embed=EmbedBuilder.from(i.message.embeds[0]);
 embed.setFields(...embed.data.fields.filter(f=>f.name!=='Review'),{name:'Review',value:result.status+' by <@'+result.reviewerId+'> • <t:'+Math.floor(result.timestamp/1000)+':f>'});
 try{await i.message.edit({embeds:[embed],components:[altReviewRow(true)],allowedMentions:{parse:[]}});}catch{return i.editReply('Review saved, but alert display could not be updated.');}
 return i.editReply('Stored review: '+result.status+'. No punishment applied.');
}
