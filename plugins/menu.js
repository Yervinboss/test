import { isOwner } from './owner.js';
import {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  MessageFlags,
} from 'discord.js';

const isInteraction = (ctx) => typeof ctx.isChatInputCommand === 'function';

// ⚠️ INSERISCI QUI IL LINK CHE VUOI MANDARE A CHI NON È OWNER
const REDIRECT_LINK = 'https://discord.gg/IL_TUO_INVITO';

const REDIRECT_MESSAGE =
  '╔═══════ ✦ ⚡ ✦ ═══════╗\n\n'
  + '   👑 **ZONA RISERVATA AL CREATORE** 👑\n\n'
  + 'Questa sezione è accessibile solo al creatore del bot.\n\n'
  + `🔗 **Entra nel server ufficiale:**\n${REDIRECT_LINK}\n\n`
  + '╚═══════ ✦ ⚡ ✦ ═══════╝';

// ───────────── CONFIGURAZIONE MENU ─────────────
const CATEGORIES = {
  media: {
    label: 'Media & Download',
    emoji: '🎵',
    color: 0x5865f2,
    description: 'Musica, download, testi, profilo e sticker',
    commands: [
      { cmd: 'pl',       desc: 'Gestisci la tua playlist personale' },
      { cmd: 'song',     desc: 'Cerca una canzone e scaricala' },
      { cmd: 'tp',       desc: 'Le 5 canzoni top di un cantante' },
      { cmd: 'text',     desc: 'Cerca il testo di una canzone' },
      { cmd: 'shazam',   desc: 'Riconosce una canzone da audio/video' },
      { cmd: 'sp',       desc: 'Mostra il brano Spotify in ascolto' },
      { cmd: 'profilo',  desc: 'Il tuo profilo musicale con Top 3 e stelle' },
      { cmd: 's',        desc: 'Crea uno sticker da un\'immagine' },
    ],
  },
  server: {
    label: 'Gestione Server',
    emoji: '🛡️',
    color: 0xf97316,
    description: 'Comandi di moderazione e gestione del server',
    commands: [
      { cmd: 'mute',     desc: 'Silenzia un utente (timeout)' },
      { cmd: 'unmute',   desc: 'Rimuove il timeout da un utente' },
      { cmd: 'del',      desc: 'Cancella un messaggio o più messaggi' },
      { cmd: 'kick',     desc: 'Espelle un utente dal server' },
      { cmd: 'ban',      desc: 'Banna un utente dal server' },
      { cmd: 'warn',     desc: 'Assegna un richiamo a un utente' },
    ],
  },
  utility: {
    label: 'Utility',
    emoji: '🛠️',
    color: 0x22c55e,
    description: 'Strumenti vari del bot',
    commands: [
      { cmd: 'ping',     desc: 'Testa la velocità di risposta del bot' },
    ],
  },
  owner: {
    label: 'Owner',
    emoji: '👑',
    color: 0xdc2626,
    description: 'Comandi riservati al creatore del bot',
    ownerOnly: true,
    commands: [
      { cmd: 'bot',       desc: 'Cambia nome/avatar del bot' },
      { cmd: 'reload',    desc: 'Ricarica i plugin del bot' },
      { cmd: 'sterminio', desc: 'Distruzione totale del server' },
    ],
  },
};

// ───────────── BUILDERS ─────────────
function buildHome() {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('⚡ ZENO BOT — PANNELLO DI CONTROLLO')
    .setDescription(
      '👋 Benvenuto nel menu!\n\n'
      + 'Scegli una categoria qui sotto per vedere tutti i comandi disponibili.\n\n'
      + '**📂 Categorie disponibili:**\n'
      + Object.entries(CATEGORIES).map(([, c]) => `${c.emoji} **${c.label}** → ${c.description}`).join('\n')
    )
    .setFooter({ text: 'Zeno Bot • Menu Principale' })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    ...Object.entries(CATEGORIES).map(([key, c]) =>
      new ButtonBuilder()
        .setCustomId(`menu:cat:${key}`)
        .setLabel(c.label)
        .setEmoji(c.emoji)
        .setStyle(ButtonStyle.Primary)
    )
  );

  return { embeds: [embed], components: [row] };
}

function buildCategory(key) {
  const cat = CATEGORIES[key];
  if (!cat) return null;

  const list = cat.commands.map((c) => `🔹 \`/${c.cmd}\`\n  └ ${c.desc}`).join('\n\n');

  const embed = new EmbedBuilder()
    .setColor(cat.color)
    .setTitle(`${cat.emoji} Categoria: ${cat.label}`)
    .setDescription(`${cat.description}\n\n${list}`)
    .setFooter({ text: `Zeno Bot • ${cat.commands.length} comandi in questa categoria` })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('menu:home')
      .setLabel('Torna alla Home')
      .setEmoji('🏠')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

// ───────────── COMANDO ─────────────
export const data = new SlashCommandBuilder()
  .setName('menu')
  .setDescription('Mostra il menu con tutti i comandi del bot');

async function menuCmd(ctx) {
  const slash = isInteraction(ctx);
  const payload = buildHome();

  // Menu PUBBLICO: chiunque lo vede nel canale
  if (slash) {
    if (!ctx.deferred && !ctx.replied) await ctx.reply(payload);
    else await ctx.editReply(payload);
  } else {
    await ctx.reply(payload);
  }
}

menuCmd.command = /^(menu|help)$/i;
menuCmd.help = ['menu'];
menuCmd.tags = ['main'];
menuCmd.desc = 'Mostra il menu con tutti i comandi';
menuCmd.data = data;

export default menuCmd;

// ───────────── GESTIONE PULSANTI MENU ─────────────
export const prefix = 'menu';
export async function onComponent(i) {
  const parts = i.customId.split(':');
  if (parts[0] !== 'menu') return;

  const [, action, key] = parts;

  // 🏠 Torna alla Home (pubblica, si aggiorna per tutti)
  if (action === 'home') {
    return i.update(buildHome());
  }

  // Click su una categoria
  if (action === 'cat') {
    const cat = CATEGORIES[key];
    if (!cat) {
      return i.reply({ content: '❌ Categoria non trovata.', flags: MessageFlags.Ephemeral });
    }

    // ═══════════════════════════════════════════════════
    // 👑 CATEGORIA OWNER (speciale)
    // ═══════════════════════════════════════════════════
    if (cat.ownerOnly) {
      // ─────── SE SEI L'OWNER: comandi in DM ───────
      if (isOwner(i.user.id)) {
        try {
          const dm = await i.user.createDM();
          const list = cat.commands.map((c) => `🔹 \`/${c.cmd}\`\n  └ ${c.desc}`).join('\n\n');

          const ownerEmbed = new EmbedBuilder()
            .setColor(cat.color)
            .setTitle(`${cat.emoji} Categoria: ${cat.label} (PRIVATO)`)
            .setDescription(
              '🔒 **Questo messaggio è privato.**\n'
              + 'Solo tu puoi vedere questi comandi perché sei il creatore del bot.\n\n'
              + `${cat.description}\n\n${list}`
            )
            .setFooter({ text: `Zeno Bot • ${cat.commands.length} comandi owner` })
            .setTimestamp();

          await dm.send({ embeds: [ownerEmbed] });

          return i.reply({
            content: '📩 Ti ho inviato i **comandi owner** in DM! Controlla i messaggi privati.',
            flags: MessageFlags.Ephemeral,
          });
        } catch (e) {
          // Fallback se DM chiusi: mostra in ephemeral
          const list = cat.commands.map((c) => `🔹 \`/${c.cmd}\`\n  └ ${c.desc}`).join('\n\n');
          const ownerEmbed = new EmbedBuilder()
            .setColor(cat.color)
            .setTitle(`${cat.emoji} Categoria: ${cat.label}`)
            .setDescription(`${cat.description}\n\n${list}`)
            .setFooter({ text: `Zeno Bot • ${cat.commands.length} comandi owner` })
            .setTimestamp();

          return i.reply({
            embeds: [ownerEmbed],
            content: '⚠️ Non posso mandarti i comandi in DM (DM chiusi). Eccoli qui in privato:',
            flags: MessageFlags.Ephemeral,
          });
        }
      }

      // ─────── SE NON SEI L'OWNER: link in DM ───────
      try {
        const dm = await i.user.createDM();
        await dm.send(REDIRECT_MESSAGE);
        return i.reply({
          content: '📩 Ti ho inviato le info in **DM**! Controlla i messaggi privati.',
          flags: MessageFlags.Ephemeral,
        });
      } catch (e) {
        return i.reply({
          content: REDIRECT_MESSAGE,
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    // ═══════════════════════════════════════════════════
    // 🎵🛡️🛠️ CATEGORIE NORMALI: pubbliche (si aggiornano per tutti)
    // ═══════════════════════════════════════════════════
    return i.update(buildCategory(key));
  }
}

// ───────────── Fallback per comando con prefisso ─────────────
export async function execute(ctx) {
  return menuCmd(ctx);
}
