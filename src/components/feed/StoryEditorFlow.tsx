import { useState, useRef, useEffect } from "react";
import { X, ChevronDown, Smile, AtSign, Eye, ImagePlus, Wand2, Loader2, Users, MapPin, SlidersHorizontal, ChevronRight, Type, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SimpleMediaEditor } from "@/components/editor";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { uploadMedia } from "@/lib/mediaUpload";
import { toast } from "sonner";
import { StoryStickerPicker, type StickerType } from "./StoryStickerPicker";
import { StoryTextTool } from "./StoryTextTool";
import { type TextLayer } from "./storyTextModel";
import { StoryDrawingTool } from "./StoryDrawingTool";

interface StoryEditorFlowProps {
  isOpen: boolean;
  onClose: () => void;
  initialFile?: File | null;
  initialUrl?: string | null;
}

type Step = "gallery" | "editor";

export function StoryEditorFlow({ isOpen, onClose, initialFile, initialUrl }: StoryEditorFlowProps) {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>("gallery");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [editedBlob, setEditedBlob] = useState<Blob | null>(null);
  const [deviceImages, setDeviceImages] = useState<{ id: string; src: string; file: File }[]>([]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [showAdvancedEditor, setShowAdvancedEditor] = useState(false);
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [showTextTool, setShowTextTool] = useState(false);
  const [showDrawingTool, setShowDrawingTool] = useState(false);
  const [textLayers, setTextLayers] = useState<TextLayer[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const seededOnceRef = useRef(false);
  const seededObjectUrlRef = useRef<string | null>(null);

  // Optional: open directly in editor with preselected media.
  useEffect(() => {
    if (!isOpen) {
      seededOnceRef.current = false;
      return;
    }
    if (seededOnceRef.current) return;
    if (!initialFile && !initialUrl) return;
    seededOnceRef.current = true;

    // Cleanup previous seeded url if any.
    if (seededObjectUrlRef.current) {
      URL.revokeObjectURL(seededObjectUrlRef.current);
      seededObjectUrlRef.current = null;
    }

    if (initialFile) {
      const url = URL.createObjectURL(initialFile);
      seededObjectUrlRef.current = url;
      setSelectedImage(url);
      setSelectedFile(initialFile);
      setEditedBlob(null);
      setStep("editor");
      return;
    }

    if (initialUrl) {
      setSelectedImage(initialUrl);
      setSelectedFile(null);
      setEditedBlob(null);
      setStep("editor");
    }
  }, [isOpen, initialFile, initialUrl]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newImages = files.map((file, index) => ({
      id: `device-${Date.now()}-${index}`,
      src: URL.createObjectURL(file),
      file,
    }));
    setDeviceImages(prev => [...newImages, ...prev]);
  };

  const [caption, setCaption] = useState("");

  const handleSelectImage = (src: string, file: File) => {
    setSelectedImage(src);
    setSelectedFile(file);
    setEditedBlob(null);
    setStep("editor");
  };

  const handleBack = () => {
    if (step === "editor") {
      setStep("gallery");
      setSelectedImage(null);
    }
  };

  const handlePublish = async (type: "story" | "close-friends") => {
    if (!user) {
      toast.error("Войдите, чтобы опубликовать историю");
      return;
    }

    setIsPublishing(true);

    try {
      // Get the media to upload (edited blob takes priority over original file)
      const mediaToUpload: Blob | null = editedBlob ?? selectedFile;

      if (!mediaToUpload) {
        throw new Error("Нет медиа для загрузки");
      }

      // Upload to storage
      const isVideo = mediaToUpload.type.startsWith("video/");
      const extension = isVideo ? "mp4" : "jpg";
      const fileName = `${user.id}/${Date.now()}.${extension}`;

      const uploadResult = await uploadMedia(mediaToUpload, { bucket: 'stories-media' });

      // Create story record
      const { error: insertError } = await supabase
        .from("stories")
        .insert({
          author_id: user.id,
          media_url: uploadResult.url,
          media_type: isVideo ? "video" : "image",
          caption: caption.trim() || null,
        });

      if (insertError) throw insertError;

      toast.success("История опубликована!");
      handleClose();
    } catch (error: any) {
      console.error("Error publishing story:", error);
      toast.error("Ошибка публикации", { description: error.message });
    } finally {
      setIsPublishing(false);
    }
  };

  // Handle edited media from SimpleMediaEditor
  const handleEditorSave = (blob: Blob) => {
    setEditedBlob(blob);
    // Update the preview
    const newPreviewUrl = URL.createObjectURL(blob);
    setSelectedImage(newPreviewUrl);
    setShowAdvancedEditor(false);
  };
  const handleClose = () => {
    if (seededObjectUrlRef.current) {
      URL.revokeObjectURL(seededObjectUrlRef.current);
      seededObjectUrlRef.current = null;
    }
    setStep("gallery");
    setSelectedImage(null);
    setSelectedFile(null);
    setEditedBlob(null);
    setCaption("");
    // Clean up object URLs
    deviceImages.forEach(img => URL.revokeObjectURL(img.src));
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
          <div className="flex items-center justify-between px-4 py-4 safe-area-top">
            <button onClick={handleClose} className="text-muted-foreground hover:text-foreground">
              <X className="w-7 h-7" strokeWidth={1.5} />
            </button>
            <h1 className="font-medium text-[17px] text-foreground">Новая история</h1>
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground text-[15px]">Текст</span>
              <span className="text-foreground text-xl font-semibold">Aa</span>
            </div>
          </div>

          {/* Gallery Header */}
          <div className="flex items-center justify-between px-4 py-3">
            <button className="flex items-center gap-1 text-foreground font-medium text-[15px]">
              Недавние
              <ChevronDown className="w-4 h-4" />
            </button>
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="text-primary text-[15px] font-medium"
            >
              Выбрать из галереи
            </button>
          </div>

          {/* Gallery Grid */}
          <div className="flex-1 overflow-y-auto">
            {deviceImages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-4 py-16 text-muted-foreground">
                <ImagePlus className="w-12 h-12" strokeWidth={1} />
                <p className="text-sm text-center px-8">
                  Выберите файлы из галереи устройства
                </p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-6 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-medium"
                >
                  Открыть галерею
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-[1px]">
                {/* Add more files button */}
                <button
                  className="aspect-square bg-muted flex flex-col items-center justify-center gap-1"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <ImagePlus className="w-6 h-6 text-muted-foreground" strokeWidth={1.5} />
                  <span className="text-[10px] text-muted-foreground">Ещё</span>
                </button>

                {deviceImages.map((img) => (
                  <button
                    key={img.id}
                    onClick={() => handleSelectImage(img.src, img.file)}
                    className="aspect-square relative"
                  >
                    <img
                      src={img.src}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                    {img.file.type.startsWith('video/') && (
                      <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1">
                        <Eye className="w-3.5 h-3.5 text-white drop-shadow-lg" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Step 2: Editor */}
      {step === "editor" && selectedImage && (
        <>
          {/* Full Screen Image */}
          <div className="flex-1 relative">
            <img 
              src={selectedImage} 
              alt="Story" 
              className="w-full h-full object-cover"
            />

            {/* Header */}
            <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 h-12 safe-area-top bg-gradient-to-b from-black/50 to-transparent">
              <button
                className="w-10 h-10 bg-black/30 backdrop-blur-sm text-white rounded-full flex items-center justify-center"
                onClick={handleBack}
              >
                <X className="w-6 h-6" strokeWidth={1.5} />
              </button>
              <div className="text-white text-sm font-semibold">Новая история</div>
              <button
                className="w-10 h-10 bg-black/30 backdrop-blur-sm text-white rounded-full flex items-center justify-center"
                onClick={() => setShowAdvancedEditor(true)}
                disabled={!selectedFile}
                aria-label="Редактировать"
              >
                <Wand2 className="w-5 h-5" strokeWidth={1.5} />
              </button>
            </div>

            {/* Right Side Tools */}
            <div className="absolute top-20 right-4 flex flex-col gap-3 safe-area-top">
              <button
                onClick={() => setShowTextTool(true)}
                className="w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center"
              >
                <Type className="w-5 h-5 text-white" strokeWidth={1.5} />
              </button>
              <button
                onClick={() => setShowDrawingTool(true)}
                className="w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center"
              >
                <Pencil className="w-5 h-5 text-white" strokeWidth={1.5} />
              </button>
              <button
                onClick={() => setShowStickerPicker(true)}
                className="w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center"
              >
                <Smile className="w-5 h-5 text-white" strokeWidth={1.5} />
              </button>
              <button className="w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center">
                <AtSign className="w-5 h-5 text-white" strokeWidth={1.5} />
              </button>
            </div>

            {/* Text layers overlay */}
            {textLayers.map((layer) => (
              <div
                key={layer.id}
                style={{
                  position: 'absolute',
                  left: `${layer.x * 100}%`,
                  top: `${layer.y * 100}%`,
                  transform: 'translate(-50%, -50%)',
                  fontSize: layer.fontSize,
                  color: layer.color,
                  textAlign: layer.align,
                  fontWeight: layer.font.includes('bold') ? 'bold' : 'normal',
                  fontStyle: layer.font.includes('italic') ? 'italic' : 'normal',
                  background: layer.background ? 'rgba(0,0,0,0.5)' : 'transparent',
                  borderRadius: layer.background ? '8px' : '0',
                  padding: layer.background ? '4px 8px' : '0',
                  pointerEvents: 'none',
                }}
              >
                {layer.text}
              </div>
            ))}

            {/* Edited badge */}
            {editedBlob && (
              <div className="absolute top-4 right-16 px-3 py-1 bg-primary/90 rounded-full text-xs text-primary-foreground font-medium safe-area-top">
                Изменено ✨
              </div>
            )}
          </div>

          {/* Bottom Actions - More visible */}
          <div className="absolute bottom-0 left-0 right-0 px-4 py-4 bg-gradient-to-t from-black/70 via-black/30 to-transparent safe-area-bottom">
            <div className="mb-3 rounded-2xl border border-white/10 bg-black/35 backdrop-blur-md overflow-hidden">
              <button className="w-full flex items-center gap-3 px-4 py-3 border-b border-white/10 text-white">
                <Users className="w-5 h-5" />
                <span className="flex-1 text-left text-sm font-medium">Отметить людей</span>
                <ChevronRight className="w-4 h-4 text-white/70" />
              </button>
              <button className="w-full flex items-center gap-3 px-4 py-3 border-b border-white/10 text-white">
                <MapPin className="w-5 h-5" />
                <span className="flex-1 text-left text-sm font-medium">Добавить место</span>
                <ChevronRight className="w-4 h-4 text-white/70" />
              </button>
              <button className="w-full flex items-center gap-3 px-4 py-3 border-b border-white/10 text-white">
                <Eye className="w-5 h-5" />
                <span className="flex-1 text-left text-sm font-medium">Настройки аудитории</span>
                <ChevronRight className="w-4 h-4 text-white/70" />
              </button>
              <button className="w-full flex items-center gap-3 px-4 py-3 text-white">
                <SlidersHorizontal className="w-5 h-5" />
                <span className="flex-1 text-left text-sm font-medium">Расширенные настройки</span>
                <ChevronRight className="w-4 h-4 text-white/70" />
              </button>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => handlePublish("close-friends")}
                disabled={isPublishing}
                className="flex-1 h-12 rounded-full bg-green-500/90 border-green-500 text-white hover:bg-green-600 hover:text-white"
              >
                <span className="text-lg mr-2">⭐</span>
                Близкие друзья
              </Button>
              <Button
                onClick={() => handlePublish("story")}
                disabled={isPublishing}
                className="flex-1 h-12 rounded-full bg-primary text-primary-foreground font-semibold"
              >
                {isPublishing ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  "Поделиться"
                )}
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Advanced Media Editor */}
      <SimpleMediaEditor
        open={showAdvancedEditor}
        onOpenChange={setShowAdvancedEditor}
        mediaFile={selectedFile}
        contentType="story"
        onSave={handleEditorSave}
        onCancel={() => setShowAdvancedEditor(false)}
      />

      {/* Sticker Picker */}
      <StoryStickerPicker
        isOpen={showStickerPicker}
        onClose={() => setShowStickerPicker(false)}
        onSelect={(_type: StickerType) => {
          // handle sticker selection per type
          setShowStickerPicker(false);
        }}
      />

      {/* Text Tool */}
      {showTextTool && (
        <StoryTextTool
          onAdd={(layer) => setTextLayers((prev) => [...prev, layer])}
          onClose={() => setShowTextTool(false)}
        />
      )}

      {/* Drawing Tool */}
      {showDrawingTool && (
        <StoryDrawingTool
          width={window.innerWidth}
          height={window.innerHeight}
          onSave={(_dataUrl) => setShowDrawingTool(false)}
          onClose={() => setShowDrawingTool(false)}
        />
      )}
    </div>
  );
}
