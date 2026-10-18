/**
 * Unified gameplay API: every in-game action routes through here and falls
 * back to the local solo session when offline. Game components never talk
 * to the socket directly.
 */

import type { EmoteId } from '@shared/protocol';
import type { V3 } from '@shared/world';
import { sendChat, sendEmote, sendInteract, sendUpdate, requestCollect } from './socket';
import { net } from './netState';
import { solo } from './soloSession';

export function apiSendUpdate(p: V3, ry: number, mv: 0 | 1 | 2 | 3): void {
  if (net.solo) return;
  sendUpdate(p, ry, mv);
}

export function apiCollect(itemId: number): void {
  if (net.solo) {
    solo.collect(itemId, net.local.p);
    return;
  }
  void requestCollect(itemId);
}

export function apiInteract(crystalId: string): void {
  if (net.solo) {
    solo.toggleCrystal(crystalId, net.local.p);
    return;
  }
  sendInteract(crystalId);
}

export function apiChat(text: string): void {
  if (net.solo) return;
  sendChat(text);
}

export function apiEmote(emote: EmoteId): void {
  if (net.solo) {
    net.emotes.set(net.selfId, { emote, at: performance.now() });
    return;
  }
  sendEmote(emote);
}

export function apiSoloTick(now: number): void {
  if (net.solo) solo.tick(now);
}
