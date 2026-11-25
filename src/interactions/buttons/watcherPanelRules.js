import { handle } from '../../services/farm/watcherPanelInteractions.js';
export default { name: 'watcher_panel_rules', async execute(interaction, client, args) { return handle(interaction, 'rules', args[0]); } };
