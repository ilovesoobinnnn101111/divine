import {ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, LabelBuilder, FileUploadBuilder} from 'discord.js';
import {authorized} from '../../commands/Farm/watcher-panel.js';
import report from '../../commands/Farm/watcher-report.js';
const selections=new Map();
export function launcherRows(){
 return [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('trainer_launch:type').setPlaceholder('Choose a farm type').addOptions({label:'222 Farm',value:'222'},{label:'Hybrid',value:'Hybrid'})),new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('trainer_launch:next').setLabel('Next').setStyle(ButtonStyle.Primary))];
}
export async function handleTrainerLauncher(i,client){
 if(!i.inGuild()||(process.env.TEST_GUILD_ID&&i.guildId!==process.env.TEST_GUILD_ID)||!authorized(i.member))return i.reply({content:'Trainer role required.',flags:MessageFlags.Ephemeral});
 const key=i.guildId+':'+i.user.id;
 if(i.isStringSelectMenu()){
 const type=i.values[0];if(!['222','Hybrid'].includes(type))return i.reply({content:'Invalid farm type.',flags:MessageFlags.Ephemeral});
 selections.set(key,{type,expires:Date.now()+900000});return i.reply({content:'Selected '+type+'. Press Next on the panel.',flags:MessageFlags.Ephemeral});
 }
 if(i.isButton()){
 const s=selections.get(key);if(!s||s.expires<Date.now())return i.reply({content:'Select a farm type first.',flags:MessageFlags.Ephemeral});
 const field=(id,label,style=TextInputStyle.Short)=>new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(true));
 const modal=new ModalBuilder().setCustomId('trainer_launch:form:'+s.type).setTitle('Watcher Trial Evaluation').addComponents(field('host','Trial host user ID'),field('minutes','Training time (minutes)'),field('checks','Rules explained / DC / Grief (Yes or No)'),field('notes','Evaluation notes',TextInputStyle.Paragraph)).addLabelComponents(new LabelBuilder().setLabel('Scoreboard screenshot').setFileUploadComponent(new FileUploadBuilder().setCustomId('proof').setRequired(true).setMinValues(1).setMaxValues(1)));
 return i.showModal(modal);
 }
 if(i.isModalSubmit()){
 const type=i.customId.split(':')[2], host=i.fields.getTextInputValue('host').trim().replace(/^<@!?|>$/g,''),minutes=Number(i.fields.getTextInputValue('minutes')),notes=i.fields.getTextInputValue('notes').trim(),checks=i.fields.getTextInputValue('checks').split(/[,/]/).map(x=>x.trim().toLowerCase());
 if(!['222','Hybrid'].includes(type)||!/^\d{17,20}$/.test(host)||!Number.isInteger(minutes)||minutes<1||minutes>240||notes.length<10||notes.length>850||checks.length!==3||checks.some(x=>!['yes','no'].includes(x)))return i.reply({content:'Invalid evaluation. Use a user ID, 1–240 minutes, three Yes/No answers separated by slashes, and 10–850 characters of notes.',flags:MessageFlags.Ephemeral});
 const target=await i.guild.members.fetch(host).catch(()=>null),proof=i.fields.getUploadedFiles('proof')?.first();
 if(!target||!proof)return i.reply({content:'Trial host or screenshot missing.',flags:MessageFlags.Ephemeral});
 const fullNotes='Rules explained: '+checks[0]+' | Disconnect: '+checks[1]+' | Griefing/Trolling: '+checks[2]+'\n'+notes;
 const options={getUser:()=>target.user,getAttachment:()=>proof,getInteger:()=>minutes,getString:n=>n==='farm_type'?type:fullNotes};
 const adapter=new Proxy(i,{get(t,p){if(p==='options')return options;const v=Reflect.get(t,p,t);return typeof v==='function'?v.bind(t):v;}});
 selections.delete(key);return report.execute(adapter,null,client);
 }
}
