function log(level, msg, extra) {
  const line = `${new Date().toISOString()} [${level}] ${msg}`;
  const out = level === 'ERROR' || level === 'WARN' ? console.error : console.log;
  if (extra !== undefined) out(line, extra);
  else out(line);
}

export const logger = {
  info: (msg, extra) => log('INFO', msg, extra),
  warn: (msg, extra) => log('WARN', msg, extra),
  error: (msg, extra) => log('ERROR', msg, extra),
};
