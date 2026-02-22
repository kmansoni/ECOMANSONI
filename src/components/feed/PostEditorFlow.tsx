import { useState, useRef, useEffect } from "react";
import { X, ChevronLeft, ChevronRight, Music, Type, Layers, Sparkles, SlidersHorizontal, Users, MapPin, MessageSquare, HelpCircle, Eye, ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { useChatOpen } from "@/contexts/ChatOpenContext";

interface PostEditorFlowProps {
  isOpen: boolean;
  onClose: () => void;
  initialFiles?: File[];
  initialUrls?: string[];
  initialStep?: "gallery" | "editor" | "details";
}

// Mock gallery images (fallback when no device images)
const mockGalleryImages = [
  { id: "1", src: "https://images.unsplash.com/photo-1461749280684-dccba630e2f6?w=300&q=80", isVideo: true, views: 175 },
  { id: "2", src: "https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=300&q=80" },
  { id: "3", src: "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=300&q=80" },
  { id: "4", src: "https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=300&q=80" },
  { id: "5", src: "https://images.unsplash.com/photo-1542831371-29b0f74f9713?w=300&q=80" },
  { id: "6", src: "https://images.unsplash.com/photo-1504639725590-34d0984388bd?w=300&q=80" },
  { id: "7", src: "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=300&q=80" },
  { id: "8", src: "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=300&q=80", isVideo: true, views: 89 },
  { id: "9", src: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=300&q=80" },
];

const editorTools = [
  { id: "audio", label: "Аудио", icon: Music },
  { id: "text", label: "Текст", icon: Type },
  { id: "overlay", label: "Оверлей", icon: Layers },
  { id: "filter", label: "Фильтр", icon: Sparkles },
  { id: "edit", label: "Редактировать", icon: SlidersHorizontal },
];

const suggestedTracks = [
  { id: "1", title: "MONEY ON THE...", artist: "Artist", cover: "https://i.pravatar.cc/40?img=1" },
  { id: "2", title: "Old Vibes", artist: "Artist", cover: "https://i.pravatar.cc/40?img=2" },
  { id: "3", title: "Dreams", artist: "Artist", cover: "https://i.pravatar.cc/40?img=3" },
];

type Step = "gallery" | "editor" | "details";
type ContentType = "post" | "story" | "video";

export function PostEditorFlow({
  isOpen,
  onClose,
  initialFiles,
  initialUrls,
  initialStep,
}: PostEditorFlowProps) {
  const { setIsCreatingContent } = useChatOpen();
  const [step, setStep] = useState<Step>("gallery");
  const [contentType, setContentType] = useState<ContentType>("post");
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [caption, setCaption] = useState("");
  const [aiLabel, setAiLabel] = useState(false);
  const [deviceImages, setDeviceImages] = useState<{ id: string; src: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const initialAppliedRef = useRef(false);

  // Hide bottom nav when creating content
  useEffect(() => {
    setIsCreatingContent(isOpen);
    return () => setIsCreatingContent(false);
  }, [isOpen, setIsCreatingContent]);

  // Optional: pre-seed selection from /create.
  useEffect(() => {
    if (!isOpen) {
      initialAppliedRef.current = false;
      return;
    }
    if (initialAppliedRef.current) return;

    const files = initialFiles ?? [];
    const urls = initialUrls ?? [];
    if (files.length === 0 && urls.length === 0 && !initialStep) return;
    initialAppliedRef.current = true;

    const seededFromFiles = files.map((file, index) => ({
      id: `seed-${Date.now()}-${index}`,
      src: URL.createObjectURL(file),
    }));

    const seededFromUrls = urls.map((src, index) => ({
      id: `seed-url-${Date.now()}-${index}`,
      src,
    }));

    const seededDeviceImages = [...seededFromFiles, ...seededFromUrls];

    if (seededDeviceImages.length > 0) {
      setDeviceImages(seededDeviceImages);
    }

    if (seededDeviceImages.length > 0) {
      setSelectedImages(seededDeviceImages.map((i) => i.src));
    }

    if (initialStep) {
      setStep(initialStep as Step);
    }
  }, [isOpen, initialFiles, initialUrls, initialStep]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newImages = files.map((file, index) => ({
      id: `device-${Date.now()}-${index}`,
      src: URL.createObjectURL(file),
    }));
    setDeviceImages(prev => [...newImages, ...prev]);
  };

  const allImages = deviceImages.length > 0 
    ? deviceImages 
    : mockGalleryImages;

  const handleSelectImage = (src: string) => {
    if (selectedImages.includes(src)) {
      setSelectedImages(selectedImages.filter(s => s !== src));
    } else {
      setSelectedImages([...selectedImages, src]);
    }
  };

  const handleNext = () => {
    if (step === "gallery" && selectedImages.length > 0) {
      setStep("editor");
    } else if (step === "editor") {
      setStep("details");
    }
  };

  const handleBack = () => {
    if (step === "editor") {
      setStep("gallery");
    } else if (step === "details") {
      setStep("editor");
    }
  };

  const handlePublish = () => {
    console.log("Publishing:", { selectedImages, caption, aiLabel });
    setStep("gallery");
    setSelectedImages([]);
    setCaption("");
    onClose();
  };

  const handleClose = () => {
    setStep("gallery");
    setSelectedImages([]);
    setCaption("");
    // Clean up object URLs
    deviceImages.forEach((img) => {
      if (img?.src && img.src.startsWith("blob:")) {
        try {
          URL.revokeObjectURL(img.src);
        } catch {
          // ignore
        }
      }
    });
    setDeviceImages([]);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-background">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Step 1: Gallery */}
      {step === "gallery" && (
        <>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border safe-area-top">
            <Button variant="ghost" size="icon" onClick={handleClose}>
              <X className="w-6 h-6" />
            </Button>
            <h1 className="font-semibold text-lg">Новая публикация</h1>
            <Button 
              variant="link" 
              className="text-primary font-semibold px-0"
              disabled={selectedImages.length === 0}
              onClick={handleNext}
            >
              Далее
            </Button>
          </div>

          {/* Preview */}
          <div className="aspect-square relative overflow-hidden">
            {selectedImages.length > 0 ? (
              <>
                {/* Blurred Background */}
                <div 
                  className="absolute inset-0 scale-150 blur-3xl opacity-50"
                  style={{ 
                    backgroundImage: `url(${selectedImages[0]})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center'
                  }}
                />
                <div className="absolute inset-0 bg-black/20" />
                <img 
                  src={selectedImages[0]} 
                  alt="Selected" 
                  className="relative w-full h-full object-contain"
                />
              </>
            ) : (
              <div className="w-full h-full bg-muted/30 flex items-center justify-center text-muted-foreground">
                Выберите фото
              </div>
            )}
          </div>

          {/* Gallery Header */}
          <div className="flex items-center justify-between px-4 py-3">
            <button className="flex items-center gap-1 font-semibold">
              Недавние
              <ChevronRight className="w-5 h-5" />
            </button>
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="text-primary text-sm font-semibold"
            >
              Выбрать из галереи
            </button>
          </div>

          {/* Gallery Grid */}
          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-4 gap-[2px]">
              {/* Add from gallery button */}
              <button 
                className="aspect-square bg-muted flex flex-col items-center justify-center gap-1"
                onClick={() => fileInputRef.current?.click()}
              >
                <ImagePlus className="w-6 h-6 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground">Галерея</span>
              </button>
              
              {allImages.map((img) => (
                <button
                  key={img.id}
                  onClick={() => handleSelectImage(img.src)}
                  className="aspect-square relative"
                >
                  <img 
                    src={img.src} 
                    alt="" 
                    className="w-full h-full object-cover"
                  />
                  {'isVideo' in img && (img as { isVideo?: boolean }).isVideo && (
                    <div className="absolute bottom-1 left-1 flex items-center gap-1">
                      <Eye className="w-3 h-3 text-white" />
                      <span className="text-white text-xs">
                        {'views' in img ? String((img as { views?: number }).views) : ''}
                      </span>
                    </div>
                  )}
                  {selectedImages.includes(img.src) && (
                    <div className="absolute inset-0 bg-primary/30 flex items-center justify-center">
                      <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                        {selectedImages.indexOf(img.src) + 1}
                      </div>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Content Type Tabs */}
          <div className="border-t border-border safe-area-bottom">
            <div className="flex justify-center gap-8 py-4">
              {[
                { id: "post", label: "ПУБЛИКАЦИЯ" },
                { id: "story", label: "ИСТОРИЯ" },
                { id: "video", label: "ВИДЕО" },
              ].map((type) => (
                <button
                  key={type.id}
                  onClick={() => setContentType(type.id as ContentType)}
                  className={cn(
                    "text-sm font-semibold transition-colors",
                    contentType === type.id ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Step 2: Editor */}
      {step === "editor" && (
        <>
          {/* Full Screen with Blurred Background */}
          <div className="flex-1 relative overflow-hidden">
            {/* Blurred Background */}
            <div 
              className="absolute inset-0 scale-150 blur-3xl opacity-60"
              style={{ 
                backgroundImage: `url(${selectedImages[0]})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center'
              }}
            />
            
            {/* Close Button */}
            <button 
              className="absolute top-4 left-4 w-10 h-10 bg-black/30 backdrop-blur-sm text-white rounded-full flex items-center justify-center z-10 safe-area-top"
              onClick={handleBack}
            >
              <X className="w-6 h-6" strokeWidth={1.5} />
            </button>

            {/* Image */}
            <div className="absolute inset-0 flex items-center justify-center p-4">
              <img 
                src={selectedImages[0]} 
                alt="Edit" 
                className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl"
              />
            </div>
          </div>

          {/* Editor Tools */}
          <div className="bg-card border-t border-border safe-area-bottom">
            <div className="flex justify-around py-4">
              {editorTools.map((tool) => {
                const Icon = tool.icon;
                return (
                  <button key={tool.id} className="flex flex-col items-center gap-1.5">
                    <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center">
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="text-xs">{tool.label}</span>
                  </button>
                );
              })}
            </div>
            
            <div className="px-4 pb-4">
              <Button 
                className="w-full rounded-full h-12 font-semibold gap-2"
                onClick={handleNext}
              >
                Далее
                <ChevronRight className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Step 3: Details */}
      {step === "details" && (
        <>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border safe-area-top">
            <Button variant="ghost" size="icon" onClick={handleBack}>
              <ChevronLeft className="w-6 h-6" />
            </Button>
            <h1 className="font-semibold text-lg">Новая публикация</h1>
            <div className="w-10" />
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto native-scroll">
            {/* Preview */}
            <div className="p-4 flex justify-center">
              <div className="w-48 aspect-[3/4] rounded-xl overflow-hidden shadow-lg">
                <img 
                  src={selectedImages[0]} 
                  alt="Preview" 
                  className="w-full h-full object-cover"
                />
              </div>
            </div>

            {/* Caption */}
            <div className="px-4 pb-4">
              <textarea
                placeholder="Добавьте подпись..."
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                className="w-full bg-transparent resize-none outline-none text-foreground placeholder:text-muted-foreground min-h-[60px]"
              />
            </div>

            {/* Quick Actions */}
            <div className="px-4 pb-4 flex gap-2">
              <button className="flex items-center gap-2 px-4 py-2 bg-muted rounded-full">
                <MessageSquare className="w-4 h-4" />
                <span className="text-sm font-medium">Опрос</span>
              </button>
              <button className="flex items-center gap-2 px-4 py-2 bg-muted rounded-full">
                <HelpCircle className="w-4 h-4" />
                <span className="text-sm font-medium">Подсказка</span>
              </button>
            </div>

            {/* Options */}
            <div className="border-t border-border">
              {/* Add Audio */}
              <button className="w-full flex items-center gap-4 px-4 py-4 border-b border-border">
                <Music className="w-6 h-6" />
                <span className="flex-1 text-left font-medium">Добавьте аудио</span>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </button>

              {/* Suggested Tracks */}
              <div className="px-4 py-3 border-b border-border">
                <ScrollArea className="w-full">
                  <div className="flex gap-2">
                    {suggestedTracks.map((track) => (
                      <button 
                        key={track.id}
                        className="flex items-center gap-2 px-3 py-2 bg-muted rounded-full flex-shrink-0"
                      >
                        <img src={track.cover} alt="" className="w-6 h-6 rounded-full" />
                        <span className="text-sm">↗ {track.title}</span>
                      </button>
                    ))}
                  </div>
                  <ScrollBar orientation="horizontal" className="invisible" />
                </ScrollArea>
              </div>

              {/* Tag People */}
              <button className="w-full flex items-center gap-4 px-4 py-4 border-b border-border">
                <Users className="w-6 h-6" />
                <span className="flex-1 text-left font-medium">Отметить людей</span>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </button>

              {/* Add Location */}
              <button className="w-full flex items-center gap-4 px-4 py-4 border-b border-border">
                <MapPin className="w-6 h-6" />
                <span className="flex-1 text-left font-medium">Добавить место</span>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </button>

              {/* AI Label */}
              <div className="flex items-start gap-4 px-4 py-4">
                <Sparkles className="w-6 h-6 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium">Добавить значок ИИ</p>
                  <p className="text-sm text-muted-foreground">
                    Вы должны отмечать значком определенный реалистичный контент, созданный с помощью ИИ.
                  </p>
                </div>
                <Switch checked={aiLabel} onCheckedChange={setAiLabel} />
              </div>
            </div>
          </div>

          {/* Publish Button */}
          <div className="px-4 py-4 border-t border-border safe-area-bottom">
            <Button 
              className="w-full rounded-full h-12 font-semibold text-base"
              onClick={handlePublish}
            >
              Поделиться
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
