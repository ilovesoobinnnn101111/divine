import {SlashCommandBuilder,MessageFlags} from 'discord.js';
import {requestManager} from '../../services/farm/boostRequests.js';
import {readRecords,withRecordLock} from '../../services/farm/records.js';
import {farmConfig} from '../../services/farm/config.js';
import {money,commission} from '../../services/farm/boosterEarnings.js';
import {notifyBooster} from '../../services/farm/boosterNotifications.js';
export default {
 data:new SlashCommandBuilder().setName('boosterpayment').setDescription('Record actual customer payment (Booster Manager only)')
 .addStringOption(o=>o.setName('order_id').setAutocomplete(true).setDescription('Order ID').setRequired(true))
 .addStringOption(o=>o.setName('amount').setDescription('Total USD received, e.g. 300.00 (not an additional payment)').setRequired(true)),
 async execute(interaction,guildConfig,client){
 if(!interaction.inGuild()||(process.env.TEST_GUILD_ID&&interaction.guildId!==process.env.TEST_GUILD_ID)||!requestManager(interaction.member))return interaction.reply({content:'Booster Manager role required in the authorized server.',flags:MessageFlags.Ephemeral});
 const id=interaction.options.getString('order_id',true).trim(),amount=interaction.options.getString('amount',true).trim();
 if(!/^\d{1,7}(\.\d{1,2})?$/.test(amount))return interaction.reply({content:'Enter a valid USD amount with up to two decimal places.',flags:MessageFlags.Ephemeral});
 const cents=Math.round(Number(amount)*100);
 await interaction.deferReply({flags:MessageFlags.Ephemeral});
 let order,changed=false,paid=false;
 try{await withRecordLock(client,interaction.guildId,'boosterOrders',async()=>{
 const rows=await readRecords(client,interaction.guildId,'boosterOrders'),i=rows.findIndex(o=>o.order_id===id);
 if(i<0||['Cancelled','Failed'].includes(rows[i].status))return;
 const old=rows[i];order=old;
 if((await readRecords(client,interaction.guildId,'boosterPayouts')).some(p=>p.order_id===id)){paid=true;return;}
 if(old.customer_paid_cents===cents)return;
 const now=Date.now();
 const updated={...old,customer_paid_cents:cents,booster_earnings_cents:commission(cents),commission_rate:40,payment_history:[...(old.payment_history||[]),{previous_cents:old.customer_paid_cents??null,paid_cents:cents,by:interaction.user.id,timestamp:now}]};
 rows[i]=updated;
 await client.db.set(farmConfig.databasePrefix+interaction.guildId+':boosterOrders',rows);order=updated;changed=true;
 });}catch{return interaction.editReply('Payment could not be saved. Check records before retrying.');}
 if(paid)return interaction.editReply('Booster payout already recorded. Payment edits are blocked; contact management for reconciliation.');
 if(!order)return interaction.editReply('Order not found or cancelled/failed.');
 if(changed)await notifyBooster(client,interaction.guildId,{orderId:id,recipientId:order.booster_id,type:'earnings_updated',message:'Order '+id+' — Your recorded earnings: '+money(order.booster_earnings_cents)+'. No payout has been transferred.'});
 return interaction.editReply({content:'Recorded total: '+money(cents)+' | Booster earnings: '+money(commission(cents))+'. No payout transferred.',allowedMentions:{parse:[]}});
 }
};
