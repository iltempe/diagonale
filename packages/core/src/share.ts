import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';
import { parseBoard } from './migrations';
import type { Board } from './schema';

/**
 * Share links without a backend (decision D-001): the board snapshot is deflated and
 * base64url-encoded into the URL fragment (#/d/<payload>). Immutable by construction.
 */
export function encodeShare(board: Board): string {
  const bytes = deflateSync(strToU8(JSON.stringify(board)), { level: 9 });
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeShare(payload: string): Board {
  const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return parseBoard(JSON.parse(strFromU8(inflateSync(bytes))));
}

export const DEFAULT_APP_URL = 'https://diagonalecalcio.it/app/';

export function shareUrl(board: Board, appUrl = DEFAULT_APP_URL): string {
  return `${appUrl.replace(/#.*$/, '')}#/d/${encodeShare(board)}`;
}
