import { MessageFlags } from 'discord.js';
import { getActiveFarm, saveActiveFarm, refreshFarmMessage } from '../../services/farm/sessionService.js';
export default {
 name:'farm_removealtsmodal',
 async execute(interaction,client){
  if(!interaction.inGuild()) return interaction.reply({content:'Server only.',flags:MessageFlags.Ephemeral});
  const session=await getActiveFarm(client, interaction.guildId, interaction.user.id);
  if(!session||session.hostId!==interaction.user.id) return interaction.reply({content:'Only the active farm host can change alt accounts.',flags:MessageFlags.Ephemeral});
  const raw=interaction.fields.getTextInputValue('amount');
  const amount=Number(raw);
  if(!Number.isInteger(amount)||amount<1||amount>session.altAccounts) return interaction.reply({content:'Enter a whole number between 1 and your current alt account count.',flags:MessageFlags.Ephemeral});
  session.altAccounts-=amount;
  await saveActiveFarm(client,interaction.guildId,session);
  await refreshFarmMessage(client,session);
  return interaction.reply({content:`Removed ${amount} alt account(s). You now have ${session.altAccounts}.`,flags:MessageFlags.Ephemeral});
 }
};
