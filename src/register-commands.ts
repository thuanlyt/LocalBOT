import { registerSlashCommands } from './command-registration.js';
import { config, validateDiscordConfig } from './config.js';

validateDiscordConfig();
console.log(config.discordGuildId ? 'Registering guild commands...' : 'Registering global commands...');
const result = await registerSlashCommands();
console.log(`Registered ${result.count} ${result.scope} commands${result.guildId ? ` for ${result.guildId}` : ''}.`);
