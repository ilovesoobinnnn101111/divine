import { handle } from '../../services/farm/watcherPanelInteractions.js';
export default { name: 'watcher_panel_grief', async execute(interaction, client, args) { return handle(interaction, 'grief', args[0]); } };
