import 'dotenv/config';
import { Client, GatewayIntentBits, REST, Routes, PermissionFlagsBits, MessageFlags } from 'discord.js';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { isSoloAdminActive } from './plugins/soloadmin.js';
import { isOwner } from './plugins/owner.js';
import { getPrefix } from './plugins/prefix.js';
// import './webapp-server.js';

const plugins = {};
const components = new Map(); // prefisso customId -> modulo
const pluginFolder = path.resolve('plugins');
const LOG_DIR = path.resolve('logs');

const client = new Client({
  rest: { timeout: 120_000 },
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ]
});

// Logging su file
function logToFile(type, text) {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    const line = `[${new Date().toISOString()}] [${type.toUpperCase()}] ${text}\n`;
    fs.appendFileSync(path.join(LOG_DIR, 'zenobot.log'), line, 'utf-8');
  } catch (e) {}
}

// Scrittura atomica JSON
global.saveJsonAtomic = function (filePath, data) {
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tempPath, filePath);
};

process.on('unhandledRejection', (reason) => {
  const msg = reason?.message || reason;
  console.log(chalk.red('[!] Promise non gestita (il bot resta acceso):'), msg);
  logToFile('error', `Unhandled Rejection: ${msg}`);
});
process.on('uncaughtException', (err) => {
  const msg = err?.message || err;
  console.log(chalk.red('[!] Eccezione non gestita (il bot resta acceso):'), msg);
  logToFile('error', `Uncaught Exception: ${msg}`);
});

// Caricamento dinamico plugin (hot-reload)
async function loadPlugins() {
  if (!fs.existsSync(pluginFolder)) fs.mkdirSync(pluginFolder, { recursive: true });

  Object.keys(plugins).forEach((k) => delete plugins[k]);
  components.clear();
  global.zenoPluginsList = [];

  let loaded = 0, failed = 0;

  for (const file of fs.readdirSync(pluginFolder)) {
    if (!file.endsWith('.js')) continue;
    try {
      const mod = await import(`${pathToFileURL(path.join(pluginFolder, file))}?update=${Date.now()}`);

      if (typeof mod.default !== 'function') {
        throw new Error(`export default mancante o non è una funzione (trovato: ${typeof mod.default})`);
      }

      plugins[file] = mod.default;
      if (typeof mod.messageHook === 'function') plugins[file].messageHook = mod.messageHook;
      if (mod.data) plugins[file].data = mod.data; // slash command
      if (mod.prefix && typeof mod.onComponent === 'function') components.set(mod.prefix, mod);

      let cmdName = mod.data?.name || file;
      if (!mod.data && mod.default.command?.source) {
        const firstAlias = mod.default.command.source.replace(/[\^$()]/g, '').split('|')[0];
        if (firstAlias) cmdName = firstAlias;
      }

      global.zenoPluginsList.push({
        file,
        name: cmdName,
        desc: mod.default.desc || '',
        tags: mod.default.tags || ['altro'],
        help: mod.default.help || [],
      });
      loaded++;
    } catch (e) {
      failed++;
      console.log(chalk.red(`[Errore Plugin] ${file}: ${e.message}`));
      logToFile('error', `Plugin Error [${file}]: ${e.message}`);
    }
  }

  console.log(chalk.green(`🟢 Caricati con successo ${loaded} comandi plugin!`));
  logToFile('info', `Caricati con successo ${loaded} comandi plugin (${failed} falliti).`);
  if (failed > 0) console.log(chalk.yellow(`⚠️ ${failed} plugin non caricati (vedi errori sopra)`));
}

// Registrazione slash command in tutti i server dove si trova il bot
async function registerCommands() {
  const body = Object.values(plugins).filter((p) => p.data).map((p) => p.data.toJSON());
  const rest = new REST().setToken(process.env.TOKEN);
  for (const guild of client.guilds.cache.values()) {
    try {
      await rest.put(Routes.applicationGuildCommands(client.user.id, guild.id), { body });
    } catch (e) {
      console.log(chalk.red(`[!] Registrazione comandi fallita in ${guild.name}: ${e.message}`));
    }
  }
}

async function reloadAll() {
  await loadPlugins();
  await registerCommands();
}
globalThis.zeno = { reload: reloadAll }; // usato da plugins/reload.js

// Controllo SoloAdmin (vale per messaggi e slash command)
function isAllowed(ctx, command) {
  if (!ctx.guildId || !isSoloAdminActive(ctx.guildId)) return true;
  if (command === 'soloadminon' || command === 'soloadminoff') return true;
  const userId = ctx.user?.id ?? ctx.author?.id;
  if (isOwner(userId)) return true;
  return ctx.member?.permissions.has(PermissionFlagsBits.Administrator) ?? false;
}

client.once('clientReady', async () => {
  global.zenoConn = client;
  console.log(chalk.green(`\n✓ Zeno connesso a Discord come ${client.user.tag}!\n`));
  logToFile('info', `Zeno connesso a Discord come ${client.user.tag}.`);
  await registerCommands();
});

// Quando il bot entra in un nuovo server, registra subito i comandi
client.on('guildCreate', () => registerCommands());

// Comandi con prefisso + messageHook
client.on('messageCreate', async (m) => {
  try {
    if (m.author.bot) return;

    for (const name in plugins) {
      const plugin = plugins[name];
      if (typeof plugin.messageHook === 'function') {
        try {
          await plugin.messageHook(client, m);
        } catch (e) {
          console.error(`Errore messageHook in ${name}:`, e);
        }
      }
    }

    const budy = m.content?.trim();
    if (!budy) return;

    const customPrefix = getPrefix();
    let prefix = '';
    if (budy.startsWith(customPrefix)) {
      prefix = customPrefix;
    } else {
      const firstChar = budy[0];
      if (/^[°•π÷×¶∆£¢€¥®™+✓_=|~!?@#$%^&*.\\/\\#]/.test(firstChar)) prefix = firstChar;
    }
    if (!prefix) return;

    const cmdPart = budy.slice(prefix.length).trim().split(' ');
    const command = cmdPart[0].toLowerCase();
    const textArg = budy.slice(prefix.length + command.length).trim();

    if (command === 'reload' && isOwner(m.author.id)) {
      await reloadAll();
      await m.reply('🟢 Tutti i plugin sono stati ricaricati con successo a caldo!');
      return;
    }

    if (!isAllowed(m, command)) return;

    for (const name in plugins) {
      const plugin = plugins[name];
      if (plugin.command && plugin.command.test(command)) {
        try {
          await plugin(m, { conn: client, text: textArg, command });
        } catch (e) {
          console.error(`Errore nel plugin "${name}" (comando "${command}"):`, e);
          logToFile('error', `Plugin Execution Error [${name} / ${command}]: ${e.message}`);
        }
      }
    }
  } catch (e) {
    console.error(e);
  }
});

// Slash command, bottoni e menu
client.on('interactionCreate', async (i) => {
  try {
    if (i.isChatInputCommand()) {
      if (!isAllowed(i, i.commandName)) {
        return i.reply({ content: '⛔ Solo admin.', flags: MessageFlags.Ephemeral });
      }
      const plugin = Object.values(plugins).find((p) => p.data?.name === i.commandName);
      await plugin?.(i, { conn: client, text: '', command: i.commandName });
    } else if (i.isButton() || i.isStringSelectMenu() || i.isModalSubmit()) {
      const [prefix] = i.customId.split(':');
      await components.get(prefix)?.onComponent(i, client);
    }
  } catch (e) {
    console.error(e);
    logToFile('error', `Interaction Error: ${e.message}`);
    const msg = { content: '❌ Errore nel comando.', flags: MessageFlags.Ephemeral };
    if (i.deferred || i.replied) await i.followUp(msg).catch(() => {});
    else await i.reply(msg).catch(() => {});
  }
});

async function startZenoBot() {
  await loadPlugins();
  client.login(process.env.TOKEN);
}

// Chiusura pulita
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n[!] Arresto richiesto (SIGINT), chiudo Zeno...'));
  logToFile('info', 'Arresto richiesto (SIGINT).');
  client.destroy();
  process.exit(0);
});
process.on('SIGTERM', () => {
  console.log(chalk.yellow('\n[!] Arresto richiesto (SIGTERM), chiudo Zeno...'));
  logToFile('info', 'Arresto richiesto (SIGTERM).');
  client.destroy();
  process.exit(0);
});

startZenoBot();

// Gestione del bottone "Mi piace" di Spotify
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;
    
    if (interaction.customId === 'like_spotify_song') {
        await interaction.reply({
            content: '⭐ Brano aggiunto ai tuoi preferiti!',
            ephemeral: true
        });
    }
});
