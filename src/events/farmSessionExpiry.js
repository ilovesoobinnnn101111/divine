import { Events } from 'discord.js';
// Countdown completion is owned by farmMonitor, based on fullStartedAt.
export default { name: Events.ClientReady, once: true, async execute() {} };
