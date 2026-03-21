const TZ = 'America/Sao_Paulo';

export function brDate(date = new Date()) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date instanceof Date ? date : new Date(date));
}

export function brDateShort(date = new Date()) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date instanceof Date ? date : new Date(date));
}

export function brTime(date = new Date()) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date instanceof Date ? date : new Date(date));
}

export function nowBR() {
  return new Date().toLocaleString('pt-BR', { timeZone: TZ });
}

export function isoNow() {
  return new Date().toISOString();
}

export function discordTs(date, format = 'R') {
  const ts = Math.floor((date instanceof Date ? date : new Date(date)).getTime() / 1000);
  return `<t:${ts}:${format}>`;
}
