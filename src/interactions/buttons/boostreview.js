import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags } from 'discord.js';
import { readRecords } from '../../services/farm/records.js';
import { requestManager } from '../../services/farm/boostRequests.js';

export default {
 name:'boostreview',
 async execute(interaction,client,args){
  if(!interaction.inGuild() || (process.env.TEST_GUILD_ID && interaction.guildId!==process.env.TEST_GUILD_ID))
    return interaction.reply({content:'Test server only.',flags:MessageFlags.Ephemeral});
  if(!requestManager(interaction.member))return interaction.reply({content:'Booster Manager role required.',flags:MessageFlags.Ephemeral});
  const [action,...parts]=args;const id=parts.join(':');
  if(!['accept','decline'].includes(action)||!/^REQ-\d{17,20}$/.test(id))
    return interaction.reply({content:'Invalid request action.',flags:MessageFlags.Ephemeral});
  if(!client.db?.isAvailable?.())return interaction.reply({content:'PostgreSQL unavailable.',flags:MessageFlags.Ephemeral});
  const req=(await readRecords(client,interaction.guildId,'boostRequests')).find(x=>x.request_id===id);
  if(!req||req.status!=='Pending')return interaction.reply({content:'Request not found or already reviewed.',flags:MessageFlags.Ephemeral});
  const modal=new ModalBuilder().setCustomId(`boostreviewmodal:${action}:${id}`).setTitle(action==='accept'?'Accept Boost Request':'Decline Boost Request');
  const input=new TextInputBuilder().setCustomId('value')
    .setLabel(action==='accept'?'Assigned booster Discord user ID':'Reason for declining')
    .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(action==='accept'?20:200);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return interaction.showModal(modal);
 }
};
