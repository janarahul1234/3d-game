/** Root router: switches screens by session phase. */

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useSession, loadProfile, saveProfile } from './store/session';
import { MainMenu } from './ui/MainMenu';
import { Lobby } from './ui/Lobby';
import { GameScreen } from './ui/GameScreen';
import { connectSocket, pingServer } from './multiplayer/socket';
import { net } from './multiplayer/netState';
import type { PlayerProfile } from '@shared/protocol';

export default function App() {
  const phase = useSession((s) => s.phase);
  const conn = useSession((s) => s.conn);
  const [profile] = useState<PlayerProfile>(() => loadProfile() ?? { name: 'Guest', color: '#22d3ee', accent: '#e879f9', body: 0 });

  useEffect(() => {
    net.selfProfile = profile;
    connectSocket();
  }, [profile]);

  // RTT ping loop (only while connected).
  useEffect(() => {
    const iv = setInterval(() => {
      if (useSession.getState().conn === 'online') pingServer(Date.now());
    }, 2200);
    return () => clearInterval(iv);
  }, []);

  // Persist profile edits when the phase changes (menu ↔ lobby ↔ game).
  useEffect(() => {
    if (net.selfProfile) saveProfile(net.selfProfile);
  }, [phase]);

  return (
    <div className="h-full w-full">
      {phase === 'menu' && <MainMenu />}
      {phase === 'lobby' && <Lobby />}
      {(phase === 'game' || phase === 'loading') && <GameScreen profile={net.selfProfile ?? profile} />}
      {phase === 'menu' && conn === 'connecting' && (
        <div className="pointer-events-none fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/50 px-4 py-1.5 text-xs text-cyan-100 backdrop-blur-sm">
          <Loader2 size={13} className="animate-spin" /> contacting server…
        </div>
      )}
    </div>
  );
}
