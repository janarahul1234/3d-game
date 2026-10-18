/** Chat composer — opens with Enter, sends with Enter, closes with Esc. */

import { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { useHud } from '../store/hud';
import { input } from '../game/input';
import { apiChat } from '../multiplayer/api';
import { net } from '../multiplayer/netState';
import { audio } from '../game/audio';
import { MAX_CHAT_LENGTH } from '@shared/protocol';

export function ChatInput() {
  const chatOpen = useHud((s) => s.chatOpen);
  const [text, setText] = useState('');
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (chatOpen) ref.current?.focus();
  }, [chatOpen]);

  if (!chatOpen) return null;

  const close = () => {
    useHud.getState().toggle('chatOpen', false);
    input.uiMode = false;
  };

  const send = () => {
    const t = text.trim();
    if (t) {
      if (!net.solo) apiChat(t);
      else {
        // Solo echo so the input still feels alive offline.
        useHud.getState().pushChat({ id: net.selfId, name: net.selfProfile?.name ?? 'You', color: net.selfProfile?.color ?? '#22d3ee', text: t, ts: Date.now() });
      }
      audio.message();
    }
    setText('');
    close();
  };

  return (
    <div className="pointer-events-auto absolute bottom-16 left-4 z-30 w-96 max-w-[60vw]">
      <div className="glass flex items-center gap-2 rounded-2xl px-3 py-2">
        <Send size={14} className="shrink-0 text-cyan-300" />
        <input
          ref={ref}
          value={text}
          maxLength={MAX_CHAT_LENGTH}
          placeholder="Message the room… (Enter sends, Esc cancels)"
          className="flex-1 bg-transparent text-sm text-cyan-50 placeholder:text-slate-500 outline-none"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation(); // don't drive the avatar while typing
            if (e.key === 'Enter') send();
            if (e.key === 'Escape') {
              setText('');
              close();
            }
          }}
        />
        <span className="text-[10px] text-slate-500">{text.length}/{MAX_CHAT_LENGTH}</span>
      </div>
    </div>
  );
}
