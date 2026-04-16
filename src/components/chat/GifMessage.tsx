import { useState } from "react";

interface GifMessageProps {
  gifUrl: string;
  width?: number;
  height?: number;
  previewUrl?: string;
}

export function GifMessage({ gifUrl, width, height, previewUrl }: GifMessageProps) {
  const [fullscreen, setFullscreen] = useState(false);

  // Вычисляем пропорциональный размер: max-width 280px
  const maxWidth = 280;
  const ratio = width && height ? height / width : 0.75;
  const displayWidth = Math.min(width || maxWidth, maxWidth);
  const displayHeight = Math.round(displayWidth * ratio);

  const isVideo = gifUrl.endsWith(".mp4") || gifUrl.endsWith(".webm");

  return (
    <>
      <div
        className="relative rounded-xl overflow-hidden cursor-pointer"
        style={{ width: displayWidth, height: displayHeight }}
        onClick={() => setFullscreen(true)}
      >
        {isVideo ? (
          <video
            src={gifUrl}
            autoPlay
            loop
            muted
            playsInline
            className="w-full h-full object-cover"
            poster={previewUrl}
          />
        ) : (
          <img loading="lazy"
            src={gifUrl}
            alt="GIF"
            className="w-full h-full object-cover"
          />
        )}
        {/* GIF Badge */}
        <div className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
          GIF
        </div>
      </div>

      {/* Fullscreen viewer */}
      {fullscreen && (
        <div
          className="fixed inset-0 z-[200] bg-black flex items-center justify-center"
          onClick={() => setFullscreen(false)}
        >
          {isVideo ? (
            <video
              src={gifUrl}
              autoPlay
              loop
              muted
              playsInline
              className="max-w-full max-h-full"
            />
          ) : (
            <img loading="lazy" src={gifUrl} alt="GIF" className="max-w-full max-h-full" />
          )}
          <button
            className="absolute top-4 right-4 text-white/80 hover:text-white text-3xl font-light"
            onClick={() => setFullscreen(false)}
          >
            ×
          </button>
        </div>
      )}
    </>
  );
}
