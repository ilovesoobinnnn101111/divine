import { SlashCommandBuilder } from 'discord.js';
import { beginSetup } from '../../services/farm/customSetup.js';
export default {registrationScope:'guild',data:new SlashCommandBuilder().setName('setupfarm').setDescription('Configure a custom farm room').addUserOption(o=>o.setName('cohost').setDescription('Optional co-host')),async execute(i,g,c){return beginSetup(i,c);}};
