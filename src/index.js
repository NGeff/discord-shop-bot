import 'dotenv/config';
import { Client, GatewayIntentBits, REST, Routes, Collection } from 'discord.js';
import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from './utils/logger.js';
import { Database } from './utils/database.js';
import { initMercadoPago } from './utils/mercadopago.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const REQUIRED_ENV = ['BOT_TOKEN', 'CLIENT_ID', 'OWNER_ID', 'MP_ACCESS_TOKEN'];
const missing = REQUIRED_ENV.filter(v => !process.env[v]);
if (missing.length) {
  console.error(`❌ Variáveis de ambiente faltando: ${missing.join(', ')}`);
  process.exit(1);
}

export const db = new Database();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
  ]
});

client.commands = new Collection();
client.db = db;

async function loadCommands() {
  const files = readdirSync(join(__dirname, 'commands')).filter(f => f.endsWith('.js'));
  for (const file of files) {
    try {
      const mod = await import(`./commands/${file}`);
      for (const [, val] of Object.entries(mod)) {
        if (val?.data && val?.execute) {
          client.commands.set(val.data.name, val);
          logger.debug('LOADER', `Comando carregado: ${val.data.name}`);
        }
      }
    } catch (err) {
      logger.error('LOADER', `Erro em ${file}`, { error: err.message });
    }
  }
  logger.info('LOADER', `${client.commands.size} comandos carregados`);
}

async function loadEvents() {
  const files = readdirSync(join(__dirname, 'events')).filter(f => f.endsWith('.js'));
  for (const file of files) {
    try {
      const event = await import(`./events/${file}`);
      const name = file.replace('.js', '');
      if (event.default?.execute) {
        if (event.default.once) client.once(name, (...a) => event.default.execute(client, ...a));
        else client.on(name, (...a) => event.default.execute(client, ...a));
      }
    } catch (err) {
      logger.error('LOADER', `Erro no evento ${file}`, { error: err.message });
    }
  }
}

async function registerCommands() {
  const rest = new REST().setToken(process.env.BOT_TOKEN);
  const cmds = Array.from(client.commands.values()).map(c => c.data.toJSON());
  try {
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: cmds });
    logger.info('DEPLOY', `${cmds.length} comandos registrados`);
  } catch (err) {
    logger.error('DEPLOY', 'Falha ao registrar comandos', { error: err.message });
  }
}

client.once('ready', async () => {
  await registerCommands();
  const cfg = db.getConfig();
  if (!cfg.guildId && client.guilds.cache.size > 0) {
    cfg.guildId = client.guilds.cache.first().id;
    db.setConfig(cfg);
  }
});

async function start() {
  try {
    logger.info('STARTUP', '🚀 Iniciando Shop Bot...');

    db.ensureDirectories();
    db.load();

    initMercadoPago(process.env.MP_ACCESS_TOKEN);

    await loadCommands();
    await loadEvents();

    await client.login(process.env.BOT_TOKEN);

    logger.info('STARTUP', '🔄 Polling de pagamentos ativo (intervalo: 15s)');
  } catch (err) {
    logger.error('STARTUP', 'Falha ao iniciar', { error: err.stack });
    process.exit(1);
  }
}

process.on('unhandledRejection', err => logger.error('PROCESS', 'Rejection não tratada', { error: err?.stack || err }));
process.on('uncaughtException', err => { logger.error('PROCESS', 'Exceção não capturada', { error: err.stack }); process.exit(1); });
process.on('SIGINT',  () => { logger.info('SHUTDOWN', '⏹️ Desligando...'); db.flush(); client.destroy(); process.exit(0); });
process.on('SIGTERM', () => { logger.info('SHUTDOWN', '⏹️ Desligando...'); db.flush(); client.destroy(); process.exit(0); });

start();
