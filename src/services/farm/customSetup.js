import {balanceText,heroLabel} from './farmBalance.js';
import {heroRoster,resolveHero} from './heroRoster.js';
import {ActionRowBuilder,ButtonBuilder,ButtonStyle,ChannelSelectMenuBuilder,UserSelectMenuBuilder,ChannelType,StringSelectMenuBuilder,ModalBuilder,TextInputBuilder,TextInputStyle,MessageFlags,EmbedBuilder} from 'discord.js';
import {farmConfig,memberHasFarmRole} from './config.js';
import {withRecordLock} from './records.js';
const allowed=i=>i.inGuild()&&i.guildId===(process.env.TEST_GUILD_ID||farmConfig.guildId);
const host=i=>memberHasFarmRole(i.member,[...farmConfig.roles.host,...farmConfig.roles.manager]);
const manager=(i,s)=>i.user.id===s.owner||i.user.id===s.cohost||memberHasFarmRole(i.member,farmConfig.roles.manager);
const key=(g,id)=>farmConfig.databasePrefix+g+':custom:'+id;
const row=(...x)=>new ActionRowBuilder().addComponents(...x);
const button=(id,label)=>new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(ButtonStyle.Secondary);
const prefix=(s,a)=>'customfarm:'+s.id+':'+a;
const privateReply=(i,content)=>i.reply({content,flags:MessageFlags.Ephemeral});
const reserved=s=>(s.reserved||[]).filter(id=>!s.slots.some(p=>p?.user===id));
const blocked=(s,id)=>s.slots.filter(p=>!p).length<=Math.max(reserved(s).length,s.priority||0)&&!reserved(s).includes(id);
const roles=['Vanguard','Duelist','Strategist'];
const weights={Vanguard:[1,0,3],Duelist:[3,0,1],Strategist:[1,3,0]};
const clean=x=>String(x||'').replace(/[@`]/g,'').slice(0,60);
function panels(s){
 const count=s.slots.filter(Boolean).length;
 const balance=balanceText(s.slots);
 const e=title=>new EmbedBuilder().setColor(0xFFFFFF).setTitle(title);
 return [{embeds:[e('<a:001_sparkles:1575070315724279918> DIVINE — CUSTOM FARM').setDescription('<:gs_white_butterfly:1573946745577279608> **Host:** <@'+s.owner+'>\nCo-host: '+(s.cohost?'<@'+s.cohost+'>':'None')+'\n<:x_whitearrow:1575129831988002968> **Voice:** <#'+s.vc+'>\nType: '+s.type+'\n<:awhitestar:1573946665520337017> **Players:** '+count+'/12\nReserved slots: '+(s.reserved?.length||s.priority||0)+'/3\n\n**Farm balance · HP and tier points**\n'+balance)],components:[row(button(prefix(s,'join'),'Join Farm'),button(prefix(s,'leave'),'Leave'),button(prefix(s,'priority'),'Priority Slots'),button(prefix(s,'manage'),'Manage Teams'),button(prefix(s,'close'),'Close'))]},...[0,1].map(t=>({embeds:[e('<:gs_white_butterfly:1573946745577279608> TEAM '+(t+1)+' — '+s.slots.slice(t*6,t*6+6).filter(Boolean).length+'/6').setDescription(s.slots.slice(t*6,t*6+6).map((p,j)=>'<:x_whitearrow:1575129831988002968> **'+(t*6+j+1)+'.** '+(p?'<@'+p.user+'> · '+clean(p.ign)+' · '+clean(p.role)+' · '+heroLabel(p):'<:1CL_checkwhite:1575465471015260190> Available')).join('\n'))],components:[row(new StringSelectMenuBuilder().setCustomId(prefix(s,'slot')).setPlaceholder('Edit team slot').addOptions(Array.from({length:6},(_,j)=>({label:'Slot '+(t*6+j+1),value:String(t*6+j)}))))]}))];
}
export async function beginSetup(i,c){
 if(!allowed(i)||!host(i))return privateReply(i,'Host or Host Manager role required.');
 if(!c.db?.isAvailable?.())return privateReply(i,'Database unavailable.');
 await i.deferReply({flags:MessageFlags.Ephemeral});
 const co=i.options.getUser('cohost');if(co&&(co.bot||co.id===i.user.id||!await i.guild.members.fetch(co.id).catch(()=>null)))return i.editReply('Select another current human member.');
 const s={id:i.id,owner:i.user.id,cohost:co?.id||null,channel:i.channelId,created:Date.now(),slots:Array(12).fill(null),priority:0,messages:[]};
 await c.db.set(key(i.guildId,s.id),s);
 return i.editReply({content:'Choose a voice channel.',components:[row(new ChannelSelectMenuBuilder().setCustomId(prefix(s,'vc')).setChannelTypes(ChannelType.GuildVoice))]});
}
async function refresh(i,s){const ch=await i.guild.channels.fetch(s.channel);const p=panels(s);if(s.closed)for(const panel of p){panel.components=[];panel.embeds[0].setFooter({text:'Farm closed'});}await Promise.all(s.messages.map(async(id,j)=>(await ch.messages.fetch(id)).edit({...p[j],allowedMentions:{parse:[]}})));}
function modal(s,a,title,fields){return new ModalBuilder().setCustomId(prefix(s,a)).setTitle(title).addComponents(...fields.map(([id,label,max])=>row(new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(TextInputStyle.Short).setMaxLength(max).setRequired(true))));}
export async function handleCustomSetup(i,c){
 if(!allowed(i)||!c.db?.isAvailable?.())return privateReply(i,'Custom farm unavailable.');
 const [,id,a,n]=i.customId.split(':');if(!/^\d{17,20}$/.test(id))return privateReply(i,'Invalid setup.');
 return withRecordLock(c,i.guildId,'custom:'+id,async()=>{
 const k=key(i.guildId,id),s=await c.db.get(k,null);if(!s||s.closed||Date.now()-s.created>86400000)return privateReply(i,'Setup closed or expired.');
 const staff=manager(i,s);
 if(['vc','type','priority','prioritysave','close'].includes(a)&&!staff)return privateReply(i,'Host or co-host only.');
 if(a==='vc'&&!s.messages.length){s.vc=i.values[0];const vc=await i.guild.channels.fetch(s.vc).catch(()=>null);if(vc?.type!==ChannelType.GuildVoice)return privateReply(i,'Choose a voice channel.');await c.db.set(k,s);return i.update({content:'Choose farm type.',components:[row(new StringSelectMenuBuilder().setCustomId(prefix(s,'type')).addOptions([{label:'222 (30 min)',value:'222'},{label:'Hybrid (60 min)',value:'Hybrid'},{label:'336 Arcade (60 min)',value:'336 Arcade'}]))]});}
 if(a==='type'&&!s.messages.length&&s.vc){await i.deferUpdate();s.type=i.values[0];const ch=await i.guild.channels.fetch(s.channel);try{for(const p of panels(s)){const m=await ch.send({...p,allowedMentions:{parse:[]}});s.messages.push(m.id);}await c.db.set(k,s);}catch(error){await Promise.allSettled(s.messages.map(id=>ch.messages.delete(id)));s.messages=[];await c.db.set(k,s);throw error;}return i.editReply({content:'Custom farm panels posted.',components:[]});}
 if(s.messages.length!==3)return privateReply(i,'Setup is incomplete.');
 if(a==='rolepick'){
 const role=i.values[0];if(!roles.includes(role))return privateReply(i,'Invalid role.');
 return i.update({content:'Choose your hero.',components:Array.from({length:Math.ceil(heroRoster[role].length/25)},(_,page)=>row(new StringSelectMenuBuilder().setCustomId(prefix(s,'heropick:'+role+':'+page)).setPlaceholder('Select hero'+(heroRoster[role].length>25?' — list '+(page+1):'')).addOptions(heroRoster[role].slice(page*25,page*25+25).map(h=>({label:h,value:h})))))});
 }
 if(a==='heropick'){
 const role=n,hero=resolveHero(role,i.values[0]);if(!hero)return privateReply(i,'Invalid hero.');
 return i.showModal(modal(s,'pickjoin:'+roles.indexOf(role)+':'+heroRoster[role].indexOf(hero),'Enter your IGN',[['ign','In-game name',40]]));
 }
 if(a==='join'){if(s.slots.some(p=>p?.user===i.user.id))return privateReply(i,'Already joined. Edit your team slot.');if(blocked(s,i.user.id))return privateReply(i,'Remaining slots are reserved.');return i.reply({flags:MessageFlags.Ephemeral,content:'Choose your role.',components:[row(new StringSelectMenuBuilder().setCustomId(prefix(s,'rolepick')).setPlaceholder('Select role').addOptions(roles.map(r=>({label:r,value:r}))))]});}
 if(a==='priority')return i.reply({flags:MessageFlags.Ephemeral,content:'Select up to three priority members. Clear removes all reservations.',components:[row(new UserSelectMenuBuilder().setCustomId(prefix(s,'reserve')).setMinValues(1).setMaxValues(3)),row(button(prefix(s,'clearreserve'),'Clear'))]});
 if(a==='manage'){
 if(!staff)return privateReply(i,'Host or co-host only.');
 return i.showModal(modal(s,'managesave','Manage team slots',[['from','Source slot (1-12)',2],['to','Destination (1-12), or 0 to remove',2]]));
 }
 if(a==='slot'){const j=Number(i.values[0]),p=s.slots[j];if(!staff&&p?.user!==i.user.id)return privateReply(i,'You may edit only your own slot.');if(!p)return privateReply(i,'Use Join Farm to fill an empty slot.');return i.showModal(modal(s,'edit:'+j,'Edit hero and IGN',[['ign','In-game name',40],['role','Vanguard / Duelist / Strategist',20],['hero','Hero name',40]]));}
 if(a==='pickjoin'){
 const role=roles[Number(n)],hero=heroRoster[role]?.[Number(i.customId.split(':')[4])],ign=i.fields.getTextInputValue('ign').trim();
 if(!hero||!ign||s.slots.some(p=>p?.user===i.user.id)||blocked(s,i.user.id))return privateReply(i,'Invalid selection, already joined, or slots reserved.');
 const j=s.slots.findIndex(p=>!p);if(j<0)return privateReply(i,'Farm full.');s.slots[j]={user:i.user.id,ign,role,hero};
 }else if(a==='joinsave'||a==='edit'){
 const ign=i.fields.getTextInputValue('ign').trim(),hero=i.fields.getTextInputValue('hero').trim(),role=roles.find(r=>r.toLowerCase()===i.fields.getTextInputValue('role').trim().toLowerCase());if(!role||!ign||!hero)return privateReply(i,'Provide a valid role, hero and IGN.');
 const canonical=resolveHero(role,hero);if(!canonical)return privateReply(i,'Hero not in the baseline '+role+' catalog. Available: '+heroRoster[role].join(', ')+'.');
 let j=Number(n);if(a==='joinsave'){if(s.slots.some(p=>p?.user===i.user.id)||blocked(s,i.user.id))return privateReply(i,'Already joined or remaining slots reserved.');j=s.slots.findIndex(p=>!p);if(j<0)return privateReply(i,'Farm full.');}else if(!s.slots[j]||(!staff&&s.slots[j].user!==i.user.id))return privateReply(i,'Slot unavailable.');
 s.slots[j]={user:a==='joinsave'?i.user.id:s.slots[j].user,ign,role,hero:canonical};
 }else if(a==='leave'){s.slots=s.slots.map(p=>p?.user===i.user.id?null:p);}
 else if(a==='managesave'){if(!staff)return privateReply(i,'Host or co-host only.');const from=i.fields.getTextInputValue('from').trim(),to=i.fields.getTextInputValue('to').trim();if(!/^(?:[1-9]|1[0-2])$/.test(from)||!/^(?:[0-9]|1[0-2])$/.test(to))return privateReply(i,'Use slot numbers 1–12, or destination 0 to remove.');const x=Number(from)-1,y=Number(to)-1;if(!s.slots[x])return privateReply(i,'Source slot is empty.');if(y===-1)s.slots[x]=null;else [s.slots[x],s.slots[y]]=[s.slots[y],s.slots[x]];}
 else if(a==='reserve'||a==='clearreserve'){if(!staff)return privateReply(i,'Host or co-host only.');const ids=a==='reserve'?[...new Set(i.values)]:[];if(ids.length>3)return privateReply(i,'Maximum three members.');await i.deferReply({flags:MessageFlags.Ephemeral});for(const id of ids){const m=await i.guild.members.fetch(id).catch(()=>null);if(!m||m.user.bot)return i.editReply('Select current human members only.');}s.reserved=ids;s.priority=0;await c.db.set(k,s);await refresh(i,s);return i.editReply('Priority reservations updated.');}
 else if(a==='prioritysave'){const x=i.fields.getTextInputValue('count');if(!/^[0-3]$/.test(x))return privateReply(i,'Choose 0 to 3.');s.priority=Number(x);}
 else if(a==='close'){s.closed=true;}else return privateReply(i,'Invalid action.');
 await i.deferReply({flags:MessageFlags.Ephemeral});await c.db.set(k,s);await refresh(i,s);return i.editReply(s.closed?'Farm closed.':'Farm updated.');
 });
}
