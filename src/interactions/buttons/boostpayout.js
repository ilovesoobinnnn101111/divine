import {MessageFlags,ActionRowBuilder,ButtonBuilder,ButtonStyle} from 'discord.js';
import {requestManager} from '../../services/farm/boostRequests.js';
import {isEligibleBooster} from '../../services/farm/boosterSecurity.js';
import {payoutView,payoutQuote,markPayout} from '../../services/farm/boosterPayout.js';
import {money} from '../../services/farm/boosterEarnings.js';
import {notifyBooster} from '../../services/farm/boosterNotifications.js';
export default {name:'boostpayout',async execute(i,client,args){
 const [action,target,a,b]=args,manager=requestManager(i.member);
 if(!i.inGuild()||(process.env.TEST_GUILD_ID&&i.guildId!==process.env.TEST_GUILD_ID)||!/^\d{17,20}$/.test(target)||(!manager&&(!isEligibleBooster(i.member)||i.user.id!==target)))return i.reply({content:'Access denied.',flags:MessageFlags.Ephemeral});
 if(action==='select'){
 if(!manager)return i.reply({content:'Manager only.',flags:MessageFlags.Ephemeral});
 await i.deferUpdate();
 const id=i.values[0],cents=await payoutQuote(client,i.guildId,target,id);
 if(cents===null)return i.editReply(await payoutView(client,i.guildId,target,manager));
 return i.editReply({content:'Confirm that you already transferred '+money(cents)+' to <@'+target+'> for '+id+'.',embeds:[],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('boostpayout:confirm:'+target+':'+id+':'+cents).setLabel('Confirm paid').setStyle(ButtonStyle.Success),new ButtonBuilder().setCustomId('boostpayout:refresh:'+target+':0:0').setLabel('Cancel').setStyle(ButtonStyle.Secondary))],allowedMentions:{parse:[]}});
 }
 if(action==='confirm'){
 if(!manager)return i.reply({content:'Manager only.',flags:MessageFlags.Ephemeral});
 await i.deferUpdate();
 const cents=Number(b);
 const ok=await markPayout(client,i.guildId,target,a,cents,i.user.id);
 if(ok)await notifyBooster(client,i.guildId,{orderId:a,recipientId:target,type:'payout_recorded',message:'Manager recorded your payout of '+money(cents)+' for '+a+'.'});
 return i.editReply({...(await payoutView(client,i.guildId,target,manager)),content:ok?'Payout recorded.':'Order changed or already paid; no new payout recorded.'});
 }
 await i.deferUpdate();
 return i.editReply({...(await payoutView(client,i.guildId,target,manager,action==='toggle'?b!=='1':b==='1',(Number(a)||0)+(action==='next'?1:action==='prev'?-1:0))),content:null});
}};
