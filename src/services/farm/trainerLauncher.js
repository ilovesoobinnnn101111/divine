import {ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, LabelBuilder, FileUploadBuilder, UserSelectMenuBuilder, EmbedBuilder} from 'discord.js';
import {authorized} from '../../commands/Farm/watcher-panel.js';
import report from '../../commands/Farm/watcher-report.js';
const selections=new Map();
export function launcherRows(){
 return [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('trainer_launch:type').setPlaceholder('Choose a farm type').addOptions({label:'222 Farm',value:'222'},{label:'Hybrid',value:'Hybrid'})),new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('trainer_launch:next').setLabel('Next').setStyle(ButtonStyle.Primary))];
}
export async function handleTrainerLauncher(i,client){
 if(!i.inGuild()||(process.env.TEST_GUILD_ID&&i.guildId!==process.env.TEST_GUILD_ID)||!authorized(i.member))return i.reply({content:'Trainer role required.',flags:MessageFlags.Ephemeral});
 const key=i.guildId+':'+i.user.id;
 const action=i.customId.split(':')[1];
 const s=selections.get(key);
 if(action==='host'||['rules','dc','grief'].includes(action)){
 if(!s||s.expires<Date.now()||i.customId.split(':')[2]!==s.token)return i.reply({content:'Evaluation expired. Start again.',flags:MessageFlags.Ephemeral});
 if(action==='host')s.host=i.values[0];else s[action]=i.values[0];
 return i.update(evaluation(s));
 }
 if(i.isStringSelectMenu()){
 const type=i.values[0];if(!['222','Hybrid'].includes(type))return i.reply({content:'Invalid farm type.',flags:MessageFlags.Ephemeral});
 selections.set(key,{type,expires:Date.now()+900000,token:i.id});return i.reply({content:'Selected '+type+'. Press Next on the panel.',flags:MessageFlags.Ephemeral});
 }
 if(i.isButton()){
 if(!s||s.expires<Date.now())return i.reply({content:'Select a farm type first.',flags:MessageFlags.Ephemeral});
 if(action==='next')return i.reply({...evaluation(s),flags:MessageFlags.Ephemeral});
 if(action!=='details'||i.customId.split(':')[2]!==s.token||!s.host||!s.rules||!s.dc||!s.grief)return i.reply({content:'Complete every verification field first.',flags:MessageFlags.Ephemeral});
 const field=(id,label,style=TextInputStyle.Short)=>new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(true));
 const modal=new ModalBuilder().setCustomId('trainer_launch:form:'+s.token).setTitle('Watcher Trial Evaluation').addComponents(field('minutes','Training time (minutes)'),field('notes','Evaluation notes',TextInputStyle.Paragraph)).addLabelComponents(new LabelBuilder().setLabel('Scoreboard screenshot').setFileUploadComponent(new FileUploadBuilder().setCustomId('proof').setRequired(true).setMinValues(1).setMaxValues(1)));
 return i.showModal(modal);
 }
 if(i.isModalSubmit()){
 if(!s||s.expires<Date.now()||i.customId.split(':')[2]!==s.token)return i.reply({content:'Evaluation expired. Start again.',flags:MessageFlags.Ephemeral});
 const type=s.type,host=s.host,minutes=Number(i.fields.getTextInputValue('minutes')),notes=i.fields.getTextInputValue('notes').trim(),checks=[s.rules,s.dc,s.grief];
 if(!['222','Hybrid'].includes(type)||!/^\d{17,20}$/.test(host)||!Number.isInteger(minutes)||minutes<1||minutes>240||notes.length<10||notes.length>850||checks.length!==3||checks.some(x=>!['yes','no'].includes(x)))return i.reply({content:'Invalid evaluation. Enter 1–240 minutes and 10–850 characters of notes.',flags:MessageFlags.Ephemeral});
 const target=await i.guild.members.fetch(host).catch(()=>null),proof=i.fields.getUploadedFiles('proof')?.first();
 if(!target||!proof)return i.reply({content:'Trial host or screenshot missing.',flags:MessageFlags.Ephemeral});
 const fullNotes='Rules explained: '+checks[0]+' | Disconnect: '+checks[1]+' | Griefing/Trolling: '+checks[2]+'\n'+notes;
 const options={getUser:()=>target.user,getAttachment:()=>proof,getInteger:()=>minutes,getString:n=>n==='farm_type'?type:fullNotes};
 const adapter=new Proxy(i,{get(t,p){if(p==='options')return options;const v=Reflect.get(t,p,t);return typeof v==='function'?v.bind(t):v;}});
 selections.delete(key);return report.execute(adapter,null,client);
 }
}

function evaluation(s){
 const select=(id,label)=>new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('trainer_launch:'+id+':'+s.token).setPlaceholder(label).addOptions(['yes','no'].map(value=>({label:value==='yes'?'Yes':'No',value,default:s[id]===value}))));
 const host=new UserSelectMenuBuilder().setCustomId('trainer_launch:host:'+s.token).setPlaceholder('Select trial host').setMinValues(1).setMaxValues(1);
 if(s.host)host.setDefaultUsers(s.host);
 const embed=new EmbedBuilder().setColor(0xFFFFFF).setDescription('## <a:001_sparkles:1575070315724279918> Watcher Trial Evaluation\n**Trial Host:** '+(s.host?'<@'+s.host+'>':'Not selected')+'\n**Farm Type:** '+s.type+'\n**Rules Said:** '+(s.rules||'Not answered')+'\n**Disconnect:** '+(s.dc||'Not answered')+'\n**Griefing/Trolling:** '+(s.grief||'Not answered'));
 return {embeds:[embed],components:[new ActionRowBuilder().addComponents(host),select('rules','Were rules explained?'),select('dc','Did anyone disconnect?'),select('grief','Any griefing or trolling?'),new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('trainer_launch:details:'+s.token).setLabel('Continue to screenshot and notes').setStyle(ButtonStyle.Primary).setDisabled(!s.host||!s.rules||!s.dc||!s.grief))],allowedMentions:{parse:[]}};
}
