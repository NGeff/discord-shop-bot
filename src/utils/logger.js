import { existsSync, mkdirSync, appendFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '../..');
const LOGS_DIR = join(ROOT_DIR, 'logs');

const LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const CURRENT = LEVELS[process.env.LOG_LEVEL || 'INFO'];

const COLORS = {
  DEBUG: '\x1b[36m', INFO: '\x1b[32m', WARN: '\x1b[33m', ERROR: '\x1b[31m', RESET: '\x1b[0m'
};

function ensureLogs() {
  if (!existsSync(LOGS_DIR)) mkdirSync(LOGS_DIR, { recursive: true });
}

function format(level, ctx, msg, meta = {}) {
  const ts = new Date().toISOString();
  const m = Object.keys(meta).length ? ` | ${JSON.stringify(meta)}` : '';
  return `[${ts}] [${level}] [${ctx}] ${msg}${m}`;
}

function write(level, ctx, msg, meta = {}) {
  if (LEVELS[level] < CURRENT) return;
  ensureLogs();
  const line = format(level, ctx, msg, meta);
  const file = join(LOGS_DIR, `${new Date().toISOString().split('T')[0]}.log`);
  try { appendFileSync(file, line + '\n', 'utf-8'); } catch {}
  console.log(`${COLORS[level]}${line}${COLORS.RESET}`);
}

export const logger = {
  debug: (c, m, meta = {}) => write('DEBUG', c, m, meta),
  info:  (c, m, meta = {}) => write('INFO',  c, m, meta),
  warn:  (c, m, meta = {}) => write('WARN',  c, m, meta),
  error: (c, m, meta = {}) => write('ERROR', c, m, meta),
};

export function formatCurrency(amount, symbol = 'R$') {
  return `${symbol} ${Number(amount).toFixed(2).replace('.', ',')}`;
}

export function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

export function sanitize(input, max = 500) {
  if (typeof input !== 'string') return '';
  return input.trim().substring(0, max);
}

export class RateLimiter {
  constructor() {
    this.map = new Map();
    setInterval(() => {
      const now = Date.now();
      for (const [k, arr] of this.map.entries()) {
        const r = arr.filter(t => now - t < 3600000);
        if (!r.length) this.map.delete(k); else this.map.set(k, r);
      }
    }, 600000);
  }
  check(key, max = 5, windowMs = 60000) {
    const now = Date.now();
    const arr = (this.map.get(key) || []).filter(t => now - t < windowMs);
    if (arr.length >= max) return false;
    arr.push(now);
    this.map.set(key, arr);
    return true;
  }
}
