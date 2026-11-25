import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { readRecords, withRecordLock } from './records.js';
import { farmConfig } from './config.js';
export const reviewWindow=21600000;
export const star='<:Icon_2GreyStars:1575057259099324549>';
export async function reviewEligibility(client,guildId,id,userId){
 const session=(await readRecords(client,guildId,'completedSessions')).find(s=>id && String(s.id)===String(id));
 if(!session){console.warn('[farmReview] session missing',{guildId,id});return 'Review session not found. Please contact staff.';}
 const endedAt=Number(session.endedAt);
 if(!Number.isFinite(endedAt)||endedAt<=0)return 'Review session timestamp unavailable. Please contact staff.';
 if(session.reason==='CANCELLED'||Date.now()>=endedAt+reviewWindow)return 'This review has closed.';
 if(session.hostId===userId||!session.playerIds?.includes(userId))return 'Only farm participants can review the host.';
 if((await readRecords(client,guildId,'vouches')).some(v=>String(v.sessionId)===String(id)&&v.voterId===userId))return 'You already reviewed this farm.';
 return session;
}
export async function postReviewPanel(client,guildId,session,channelId){
 const channel=await client.channels.fetch(channelId);
 if((channel.guildId??channel.guild?.id)!==guildId||!channel.send)return;
 const host=await client.users.fetch(session.hostId).catch(()=>null);
 const embed=new EmbedBuilder().setColor(0xffffff).setDescription('## '+star+' Review <@'+session.hostId+'>\n> **Host:** <@'+session.hostId+'>\n> **Rate:** pick stars, then write a short review\n\nOne review per person • closes <t:'+Math.floor((session.endedAt+reviewWindow)/1000)+':R>');
 if(host)embed.setThumbnail(host.displayAvatarURL());
 const row=new ActionRowBuilder().addComponents(...[1,2,3,4,5].map(n=>new ButtonBuilder().setCustomId('farm_review_'+n).setLabel(n+'⭐').setStyle(n===5?ButtonStyle.Success:ButtonStyle.Secondary)));
 // The panel message references the original farm ID in its footer for exact session lookup.
 embed.setFooter({text:'Farm '+session.id});
 await channel.send({embeds:[embed],components:[row],allowedMentions:{parse:[]}});
}
export async function submitReview(client,guildId,id,userId,rating,comment,interactionId){
 return withRecordLock(client,guildId,'vouches',async()=>{
 const session=await reviewEligibility(client,guildId,id,userId);
 if(typeof session==='string')return session;
 const records=await readRecords(client,guildId,'vouches');
 const record={id:'V-'+interactionId,sessionId:id,hostId:session.hostId,voterId:userId,rating,comment,timestamp:Date.now()};
 const channel=await client.channels.fetch(process.env.FARM_REVIEW_CHANNEL_ID||farmConfig.channels.hostVouch||'1573919674146758686').catch(()=>null);
 if(!channel?.send||(channel.guildId??channel.guild?.id)!==guildId)return 'Review log channel unavailable. Please try again later.';
 const embed=new EmbedBuilder().setColor(0xffffff).setDescription(star+' **Host Review**\n**Host:** <@'+session.hostId+'>\n**Reviewer:** <@'+userId+'>\n**Rating:** '+'⭐'.repeat(rating)+' ('+rating+'/5)\n**Review:** '+comment).setTimestamp();
 const message=await channel.send({embeds:[embed],allowedMentions:{parse:[]}});
 try{await client.db.set(farmConfig.databasePrefix+guildId+':vouches',[...records,record]);}catch(error){await message.delete().catch(()=>{});throw error;}
 return null;
 });
}
