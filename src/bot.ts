import { BOT_UA_RE } from './config';

export function isBotUa(ua: string | null | undefined): boolean {
  return BOT_UA_RE.test(ua || '');
}
