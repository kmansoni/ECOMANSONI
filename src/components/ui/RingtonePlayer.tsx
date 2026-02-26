// Simple ringtone player for call status
import { useEffect, useRef } from "react";

export interface RingtonePlayerProps {
  play: boolean;
  src?: string;
  volume?: number;
}

export function RingtonePlayer({ play, src = "/audio/ringtone.mp3", volume = 1.0 }: RingtonePlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.volume = volume;
    if (play) {
      audioRef.current.loop = true;
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    } else {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, [play, volume]);

  return <audio ref={audioRef} src={src} preload="auto" />;
}
