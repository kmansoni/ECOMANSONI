/**
 * BotMessageContent — рендеринг любого контента сообщения бота.
 * Поддерживает: text, photo, video, document, audio, voice, sticker,
 *              animation, poll, location, venue, contact, action, callback_answer.
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { BotKeyboard } from './BotKeyboard';

interface BotMessageContentProps {
  content: Record<string, unknown>;
  contentType: string;
  metadata?: Record<string, unknown>;
  className?: string;
  onCallbackButtonClick?: (text: string, callbackData?: string) => void;
}

export function BotMessageContent({
  content,
  contentType,
  metadata,
  className,
  onCallbackButtonClick,
}: BotMessageContentProps) {
  const botMethod = metadata?.bot_method as string | undefined;
  const botParams = metadata?.bot_params as Record<string, unknown> | undefined;

  const replyMarkup = botParams?.reply_markup as Record<string, unknown> | undefined;

  // ── Текст ──────────────────────────────────────────────────────
  if (contentType === 'text') {
    const text = (content.text as string) || '';
    if (!text.trim()) return null;
    return (
      <>
        <p className="whitespace-pre-wrap leading-relaxed">{text}</p>
        {replyMarkup && (
          <BotKeyboard
            replyMarkup={replyMarkup}
            onButtonClick={(text, cb) => onCallbackButtonClick?.(text, cb)}
          />
        )}
      </>
    );
  }

  // ── Фото ───────────────────────────────────────────────────────
  if (contentType === 'media' && content.media_type === 'photo' && content.media_url) {
    return (
      <>
        <img
          src={content.media_url as string}
          alt={(content.caption as string) || 'photo'}
          className={cn("rounded-lg max-w-full h-auto", className)}
          loading="lazy"
        />
        {content.caption && <p className="mt-1 text-sm text-muted-foreground">{content.caption}</p>}
        {replyMarkup && (
          <BotKeyboard
            replyMarkup={replyMarkup}
            onButtonClick={(text, cb) => onCallbackButtonClick?.(text, cb)}
          />
        )}
      </>
    );
  }

  // ── Видео ───────────────────────────────────────────────────────
  if (contentType === 'video' && content.media_url) {
    return (
      <>
        <video
          src={content.media_url as string}
          controls
          className={cn("rounded-lg max-w-full", className)}
          preload="metadata"
        />
        {content.caption && <p className="mt-1 text-sm text-muted-foreground">{content.caption}</p>}
        {replyMarkup && (
          <BotKeyboard
            replyMarkup={replyMarkup}
            onButtonClick={(text, cb) => onCallbackButtonClick?.(text, cb)}
          />
        )}
      </>
    );
  }

  // ── Документ ─────────────────────────────────────────────────────
  if (contentType === 'document' && content.media_url) {
    const fileName = (content.caption as string) || 'document';
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext);
    const isVideo = ['mp4', 'mov', 'webm'].includes(ext);

    if (isImage) {
      return (
        <>
          <img
            src={content.media_url as string}
            alt={fileName}
            className={cn("rounded-lg max-w-full h-auto", className)}
            loading="lazy"
          />
          {content.caption && <p className="mt-1 text-sm text-muted-foreground">{content.caption}</p>}
          {replyMarkup && (
            <BotKeyboard
              replyMarkup={replyMarkup}
              onButtonClick={(text, cb) => onCallbackButtonClick?.(text, cb)}
            />
          )}
        </>
      );
    }

    if (isVideo) {
      return (
        <>
          <video
            src={content.media_url as string}
            controls
            className={cn("rounded-lg max-w-full", className)}
            preload="metadata"
          />
          {content.caption && <p className="mt-1 text-sm text-muted-foreground">{content.caption}</p>}
          {replyMarkup && (
            <BotKeyboard
              replyMarkup={replyMarkup}
              onButtonClick={(text, cb) => onCallbackButtonClick?.(text, cb)}
            />
          )}
        </>
      );
    }

    return (
      <>
        <a
          href={content.media_url as string}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "flex items-center gap-3 rounded-lg p-3",
            "bg-secondary/50 hover:bg-secondary transition-colors",
            className
          )}
        >
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <FileIcon className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{fileName}</p>
            {content.file_size && (
              <p className="text-xs text-muted-foreground">
                {formatBytes(content.file_size as number)}
              </p>
            )}
          </div>
        </a>
        {content.caption && <p className="mt-1 text-sm text-muted-foreground">{content.caption}</p>}
        {replyMarkup && (
          <BotKeyboard
            replyMarkup={replyMarkup}
            onButtonClick={(text, cb) => onCallbackButtonClick?.(text, cb)}
          />
        )}
      </>
    );
  }

  // ── Аудио ───────────────────────────────────────────────────────
  if (contentType === 'audio' && content.media_url) {
    return (
      <>
        <audio
          src={content.media_url as string}
          controls
          className={cn("w-full max-w-[340px]", className)}
          preload="metadata"
        />
        {content.caption && <p className="mt-1 text-sm text-muted-foreground">{content.caption}</p>}
        {replyMarkup && (
          <BotKeyboard
            replyMarkup={replyMarkup}
            onButtonClick={(text, cb) => onCallbackButtonClick?.(text, cb)}
          />
        )}
      </>
    );
  }

  // ── Голосовое ───────────────────────────────────────────────────
  if (contentType === 'voice' && content.media_url) {
    return (
      <>
        <div className={cn("flex items-center gap-2 rounded-lg p-2", "bg-accent/30", className)}>
          <MicIcon className="w-5 h-5 text-primary shrink-0" />
          <audio
            src={content.media_url as string}
            controls
            className="flex-1 max-w-[200px]"
            preload="metadata"
          />
        </div>
        {content.caption && <p className="mt-1 text-sm text-muted-foreground">{content.caption}</p>}
        {replyMarkup && (
          <BotKeyboard
            replyMarkup={replyMarkup}
            onButtonClick={(text, cb) => onCallbackButtonClick?.(text, cb)}
          />
        )}
      </>
    );
  }

  // ── Видеосообщение (круглое) ─────────────────────────────────────
  if (contentType === 'video_note' && content.media_url) {
    return (
      <>
        <div className={cn("relative overflow-hidden rounded-full", className)}>
          <video
            src={content.media_url as string}
            controls
            className="w-48 h-48 sm:w-56 sm:h-56 object-cover rounded-full"
            preload="metadata"
          />
        </div>
        {content.caption && <p className="mt-1 text-sm text-muted-foreground">{content.caption}</p>}
        {replyMarkup && (
          <BotKeyboard
            replyMarkup={replyMarkup}
            onButtonClick={(text, cb) => onCallbackButtonClick?.(text, cb)}
          />
        )}
      </>
    );
  }

  // ── Анимация (GIF) ─────────────────────────────────────────────
  if (contentType === 'animation' && content.media_url) {
    return (
      <>
        <video
          src={content.media_url as string}
          autoPlay
          loop
          muted
          playsInline
          className={cn("rounded-lg max-w-[340px]", className)}
        />
        {content.caption && <p className="mt-1 text-sm text-muted-foreground">{content.caption}</p>}
        {replyMarkup && (
          <BotKeyboard
            replyMarkup={replyMarkup}
            onButtonClick={(text, cb) => onCallbackButtonClick?.(text, cb)}
          />
        )}
      </>
    );
  }

  // ── Стикер ───────────────────────────────────────────────────────
  if (contentType === 'sticker') {
    const stickerId = content.sticker_id as string | undefined;
    if (stickerId) {
      // Используем стандартные эмодзи как fallback для кастомных стикеров
      return (
        <div className="flex items-center justify-center w-24 h-24">
          <span className="text-5xl">{getStickerEmoji(stickerId)}</span>
        </div>
      );
    }
    return null;
  }

  // ── Опрос ────────────────────────────────────────────────────────
  if (contentType === 'poll') {
    const question = content.question as string | undefined;
    const options = content.options as { text: string; voter_count?: number }[] | undefined;
    const isAnonymous = (content.is_anonymous as boolean) !== false;
    const isClosed = content.is_closed as boolean | undefined;
    const type = content.type as 'regular' | 'quiz' | undefined;

    if (!question && !options?.length) return null;

    return (
      <>
        <div className={cn(
          "w-full max-w-[340px] rounded-xl p-4",
          "bg-secondary/50 border border-border",
          className
        )}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase">
              {isClosed ? 'Опрос завершён' : type === 'quiz' ? 'Викторина' : 'Опрос'}
            </span>
            {isAnonymous && <span className="text-xs text-muted-foreground/60">· Анонимный</span>}
          </div>
          <p className="font-medium text-sm mb-3">{question}</p>
          {options && options.length > 0 && (
            <div className="space-y-2">
              {options.map((option, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 rounded-lg p-2 text-sm cursor-default transition-colors"
                  role="option"
                  aria-selected="false"
                >
                  <div className="w-4 h-4 rounded-full border-2 border-border shrink-0 flex items-center justify-center">
                    {type === 'quiz' && option.voter_count !== undefined && (
                      <span className="text-[10px]">
                        {option.voter_count > 0 ? '✅' : '❌'}
                      </span>
                    )}
                  </div>
                  <span className="flex-1">{option.text}</span>
                  {isAnonymous || option.voter_count === undefined ? null : (
                    <span className="text-xs text-muted-foreground">
                      {option.voter_count} голосов
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        {replyMarkup && (
          <BotKeyboard
            replyMarkup={replyMarkup}
            onButtonClick={(text, cb) => onCallbackButtonClick?.(text, cb)}
          />
        )}
      </>
    );
  }

  // ── Локация ──────────────────────────────────────────────────────
  if (contentType === 'location' && content.latitude != null && content.longitude != null) {
    const lat = content.latitude as number;
    const lng = content.longitude as number;
    const livePeriod = content.live_period as number | undefined;
    const heading = content.heading as number | undefined;
    const mapUrl = `https://www.google.com/maps?q=${lat},${lng}&z=15`;

    return (
      <>
        <a
          href={mapUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn("block rounded-lg overflow-hidden cursor-pointer", className)}
        >
          <img
            src={`https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=15&size=400x200&markers=color:red%7C${lat},${lng}&key=`}
            alt="location"
            className="w-full h-48 object-cover"
            onError={(e) => {
              // Fallback: серый блок с текстом координат
              const target = e.currentTarget;
              target.src = '';
              target.className = 'w-full h-48 bg-secondary flex items-center justify-center text-sm';
              target.alt = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
              target.setAttribute('data-text', `${lat.toFixed(4)}, ${lng.toFixed(4)}`);
            }}
          />
        </a>
        {content.proximity_alert_radius && (
          <p className="text-xs text-muted-foreground mt-1">
            Радиус уведомления: {content.proximity_alert_radius}м
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {lat.toFixed(4)}, {lng.toFixed(4)}
          {heading != null && ` · ${heading}°`}
          {livePeriod != null && ` · ${Math.round(livePeriod / 60)} мин`}
        </p>
        {replyMarkup && (
          <BotKeyboard
            replyMarkup={replyMarkup}
            onButtonClick={(text, cb) => onCallbackButtonClick?.(text, cb)}
          />
        )}
      </>
    );
  }

  // ── Место (venue) ────────────────────────────────────────────────
  if (contentType === 'venue' && content.latitude != null && content.longitude != null) {
    return (
      <>
        <div className={cn("w-full max-w-[340px] rounded-xl p-3", "bg-secondary/50 border border-border", className)}>
          <p className="font-medium text-sm">{content.title as string}</p>
          <p className="text-xs text-muted-foreground">{content.address as string}</p>
        </div>
        {replyMarkup && (
          <BotKeyboard
            replyMarkup={replyMarkup}
            onButtonClick={(text, cb) => onCallbackButtonClick?.(text, cb)}
          />
        )}
      </>
    );
  }

  // ── Контакт ──────────────────────────────────────────────────────
  if (contentType === 'contact') {
    return (
      <>
        <div className={cn("w-full max-w-[340px] rounded-xl p-3", "bg-secondary/50 border border-border", className)}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <ContactIcon className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium">{content.contact_name as string}</p>
              {content.phone_number && (
                <p className="text-xs text-muted-foreground">{content.phone_number}</p>
              )}
            </div>
          </div>
        </div>
        {replyMarkup && (
          <BotKeyboard
            replyMarkup={replyMarkup}
            onButtonClick={(text, cb) => onCallbackButtonClick?.(text, cb)}
          />
        )}
      </>
    );
  }

  // ── Action/typing indicator ──────────────────────────────────────
  if (contentType === 'action') {
    const action = content.action as string | undefined;
    if (action === 'typing') {
      return <div className="flex gap-1 items-center p-2"><TypingDots /></div>;
    }
    return null;
  }

  // ── Callback answer (обычно не отображается как отдельное сообщение) ──
  if (contentType === 'callback_answer') {
    const text = content.text as string | undefined;
    if (text) {
      return <p className="text-sm text-muted-foreground">{text}</p>;
    }
    return null;
  }

  // ── Fallback: text field ────────────────────────────────────────
  const text = (content.text as string) || '';
  if (text) {
    return (
      <>
        <p className="whitespace-pre-wrap leading-relaxed">{text}</p>
        {replyMarkup && (
          <BotKeyboard
            replyMarkup={replyMarkup}
            onButtonClick={(text, cb) => onCallbackButtonClick?.(text, cb)}
          />
        )}
      </>
    );
  }

  return null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function getStickerEmoji(stickerId: string): string {
  // Fallback emoji для кастомных стикеров
  const emojis = ['😀', '😂', '❤️', '🎉', '👍', '🔥', '⭐', '💯', '🙌', '🤔'];
  let hash = 0;
  for (let i = 0; i < stickerId.length; i++) {
    hash = stickerId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return emojis[Math.abs(hash) % emojis.length];
}

// ── Icons ──────────────────────────────────────────────────────────

function FileIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

function MicIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="1" width="6" height="12" rx="3" />
      <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function ContactIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function TypingDots() {
  return (
    <div className="flex gap-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}