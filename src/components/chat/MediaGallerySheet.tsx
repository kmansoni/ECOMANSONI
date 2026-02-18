import { X, ArrowLeft, Play, ExternalLink } from "lucide-react";
import { useState, useEffect } from "react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { ImageViewer } from "./ImageViewer";

interface MediaItem {
  id: string;
  url: string;
  type: 'image' | 'video' | 'file' | 'voice' | 'link';
  created_at: string;
  filename?: string;
  filesize?: number;
  duration?: number;
  sender_name?: string;
  link_title?: string;
  link_description?: string;
  link_preview?: string;
}

interface GroupedMedia {
  month: string;
  items: MediaItem[];
}

interface MediaGallerySheetProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId?: string;
  userId?: string;
  title: string;
  type: 'photos' | 'files' | 'links' | 'voice';
}

// Helper to get file extension badge color
const getFileExtensionColor = (ext: string): string => {
  const colors: Record<string, string> = {
    xls: 'bg-green-600',
    xlsx: 'bg-green-600',
    doc: 'bg-blue-600',
    docx: 'bg-blue-600',
    pdf: 'bg-red-600',
    zip: 'bg-yellow-600',
    rar: 'bg-yellow-600',
    heic: 'bg-purple-600',
    jpg: 'bg-pink-600',
    jpeg: 'bg-pink-600',
    png: 'bg-pink-600',
  };
  return colors[ext.toLowerCase()] || 'bg-gray-600';
};

// Helper to format file size
const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// Helper to format duration
const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export function MediaGallerySheet({ isOpen, onClose, conversationId, userId, title, type }: MediaGallerySheetProps) {
  const [media, setMedia] = useState<GroupedMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewingImage, setViewingImage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !conversationId) return;

    const fetchMedia = async () => {
      setLoading(true);
      try {
        let mediaFilter: string[] = [];
        
        if (type === 'photos') {
          mediaFilter = ['image'];
        } else if (type === 'files') {
          mediaFilter = ['file'];
        } else if (type === 'voice') {
          mediaFilter = ['voice'];
        }
        
        // For photos, files, voice - fetch from messages table
        if (type !== 'links') {
          const { data: messages } = await supabase
            .from('messages')
            .select('id, media_url, media_type, created_at, content, duration_seconds, sender_id')
            .eq('conversation_id', conversationId)
            .not('media_url', 'is', null)
            .in('media_type', mediaFilter)
            .order('created_at', { ascending: false });

          if (messages && messages.length > 0) {
            // Get sender profiles for voice messages
            const senderIds = [...new Set(messages.map(m => m.sender_id))];
            const { data: profiles } = await supabase
              .from('profiles')
              .select('user_id, display_name')
              .in('user_id', senderIds);
            
            const profileMap = new Map(profiles?.map(p => [p.user_id, p.display_name]) || []);
            
            const grouped: Record<string, MediaItem[]> = {};
            messages.forEach(msg => {
              const date = new Date(msg.created_at);
              const monthKey = format(date, 'LLLL yyyy', { locale: ru });
              const capitalizedMonth = monthKey.charAt(0).toUpperCase() + monthKey.slice(1);
              if (!grouped[capitalizedMonth]) grouped[capitalizedMonth] = [];
              
              // Extract filename from URL for files
              const filename = msg.media_url ? msg.media_url.split('/').pop() || 'file' : 'file';
              
              grouped[capitalizedMonth].push({
                id: msg.id,
                url: msg.media_url!,
                type: type === 'photos' ? 'image' : type === 'files' ? 'file' : 'voice',
                created_at: msg.created_at,
                filename: type === 'files' ? filename : undefined,
                duration: type === 'voice' ? (msg.duration_seconds || 0) : undefined,
                sender_name: type === 'voice' ? (profileMap.get(msg.sender_id) || 'Пользователь') : undefined,
              });
            });
            setMedia(Object.entries(grouped).map(([month, items]) => ({ month, items })));
          } else {
            setMedia([]);
          }
        } else {
          // For links - find messages containing URLs
          const { data: messages } = await supabase
            .from('messages')
            .select('id, content, created_at')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: false });

          if (messages && messages.length > 0) {
            const urlRegex = /(https?:\/\/[^\s]+)/g;
            const linkMessages = messages.filter(m => m.content && urlRegex.test(m.content));
            
            if (linkMessages.length > 0) {
              const grouped: Record<string, MediaItem[]> = {};
              linkMessages.forEach(msg => {
                const date = new Date(msg.created_at);
                const monthKey = format(date, 'd MMMM', { locale: ru });
                if (!grouped[monthKey]) grouped[monthKey] = [];
                
                // Extract URL from content
                const urls = msg.content.match(urlRegex) || [];
                urls.forEach((url, idx) => {
                  grouped[monthKey].push({
                    id: `${msg.id}-${idx}`,
                    url: url,
                    type: 'link',
                    created_at: msg.created_at,
                    link_title: url.length > 50 ? url.substring(0, 50) + '...' : url,
                    link_description: msg.content.replace(url, '').trim() || undefined,
                  });
                });
              });
              setMedia(Object.entries(grouped).map(([month, items]) => ({ month, items })));
            } else {
              setMedia([]);
            }
          } else {
            setMedia([]);
          }
        }
      } catch (err) {
        console.error('Error fetching media:', err);
        setMedia([]);
      } finally {
        setLoading(false);
      }
    };

    fetchMedia();
  }, [isOpen, conversationId, type]);

  if (!isOpen) return null;

  // Render file item
  const renderFileItem = (item: MediaItem) => {
    const ext = item.filename?.split('.').pop() || '';
    return (
      <div key={item.id} className="flex items-start gap-3 px-4 py-3 hover:bg-white/5">
        {/* File type badge or thumbnail */}
        <div className={`w-12 h-12 rounded-lg flex items-center justify-center text-white text-xs font-bold ${getFileExtensionColor(ext)}`}>
          {ext.toLowerCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-medium truncate">{item.filename}</p>
          <p className="text-white/50 text-xs">{formatFileSize(item.filesize || 0)}</p>
          <p className="text-white/40 text-xs mt-0.5">
            {format(new Date(item.created_at), 'd MMM в HH:mm', { locale: ru })}
          </p>
        </div>
      </div>
    );
  };

  // Render voice item
  const renderVoiceItem = (item: MediaItem) => {
    return (
      <div key={item.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/5">
        {/* Play button */}
        <button className="w-10 h-10 rounded-full bg-[#3390ec] flex items-center justify-center flex-shrink-0">
          <Play className="w-5 h-5 text-white fill-white ml-0.5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-medium">{item.sender_name}</p>
          <p className="text-white/50 text-xs">
            {format(new Date(item.created_at), 'd MMM в H:mm', { locale: ru })}, {formatDuration(item.duration || 0)}
          </p>
        </div>
      </div>
    );
  };

  // Render link item
  const renderLinkItem = (item: MediaItem) => {
    return (
      <div key={item.id} className="flex items-start gap-3 px-4 py-3 hover:bg-white/5">
        {/* Preview image or letter badge */}
        {item.link_preview ? (
          <div className="w-12 h-12 rounded-lg bg-[#3390ec] flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
            {item.link_preview}
          </div>
        ) : (
          <div className="w-12 h-12 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
            <ExternalLink className="w-5 h-5 text-white/60" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-medium line-clamp-2">{item.link_title}</p>
          <p className="text-white/50 text-xs line-clamp-2 mt-0.5">{item.link_description}</p>
          {item.url !== '#' && (
            <p className="text-[#6ab3f3] text-xs truncate mt-1">{item.url}</p>
          )}
        </div>
      </div>
    );
  };

  // Render photo grid item
  const renderPhotoItem = (item: MediaItem) => {
    return (
      <button
        key={item.id}
        onClick={() => setViewingImage(item.url)}
        className="aspect-square relative overflow-hidden bg-white/5"
      >
        <img
          src={item.url}
          alt=""
          className="w-full h-full object-cover"
          loading="lazy"
        />
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-[300] bg-[#17212b]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <button onClick={onClose} className="p-2 -ml-2">
          <ArrowLeft className="w-6 h-6 text-white" />
        </button>
        <h1 className="text-lg font-semibold text-white">{title}</h1>
        <button onClick={onClose} className="p-2 -mr-2">
          <X className="w-6 h-6 text-white" />
        </button>
      </div>

      {/* Content */}
      <div className="overflow-y-auto h-[calc(100vh-60px)]">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          </div>
        ) : media.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-white/60">
            <p>Нет {type === 'photos' ? 'фотографий' : type === 'voice' ? 'голосовых сообщений' : type === 'files' ? 'файлов' : 'ссылок'}</p>
          </div>
        ) : (
          <div className="pb-8">
            {media.map((group) => (
              <div key={group.month}>
                {/* Month Header */}
                <div className="px-4 py-3 sticky top-0 bg-[#17212b] z-10">
                  <h2 className="text-sm font-medium text-white/60">{group.month}</h2>
                </div>
                
                {/* Content based on type */}
                {type === 'photos' ? (
                  <div className="grid grid-cols-3 gap-[2px] px-[2px]">
                    {group.items.map(renderPhotoItem)}
                  </div>
                ) : type === 'files' ? (
                  <div className="divide-y divide-white/5">
                    {group.items.map(renderFileItem)}
                  </div>
                ) : type === 'voice' ? (
                  <div>
                    {group.items.map(renderVoiceItem)}
                  </div>
                ) : (
                  <div className="divide-y divide-white/5">
                    {group.items.map(renderLinkItem)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Image Viewer */}
      {viewingImage && (
        <ImageViewer
          src={viewingImage}
          onClose={() => setViewingImage(null)}
        />
      )}
    </div>
  );
}
