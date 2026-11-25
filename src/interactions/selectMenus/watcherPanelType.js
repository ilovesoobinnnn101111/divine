import { handle } from '../../services/farm/watcherPanelInteractions.js';
export default { name: 'watcher_panel_type', async execute(interaction, client, args) { return handle(interaction, 'type', args[0]); } };
