import { handle } from '../../services/farm/watcherPanelInteractions.js';
export default { name: 'watcher_panel_dc', async execute(interaction, client, args) { return handle(interaction, 'dc', args[0]); } };
