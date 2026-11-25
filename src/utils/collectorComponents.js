/** Component custom IDs handled by ephemeral message collectors — skip global handlers. */
const COLLECTOR_MANAGED_PREFIXES = [
  'config_select',
  'config_wizard',
  'cmdaccess_',
  'rankcalc_',
  'lordcalc_',
  'boostfail',
  'boostcancel',
  'boostcomplete',
  'boostreopen',
];

export function isCollectorManagedComponent(customId = '') {
  return COLLECTOR_MANAGED_PREFIXES.some((prefix) => customId.startsWith(prefix));
}
