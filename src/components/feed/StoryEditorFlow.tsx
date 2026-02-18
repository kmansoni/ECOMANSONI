import { useState, useRef, useEffect } from "react";
import { X, ChevronDown, Camera, Smile, Music, AtSign, ArrowRight, Eye, ImagePlus, Wand2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SimpleMediaEditor } from "@/components/editor";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useChatOpen } from "@/contexts/ChatOpenContext";

interface StoryEditorFlowProps {
  isOpen: boolean;
  onClose: () => void;
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
  { id: "8", src: "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=300&q=80" },
];

type Step = "gallery" | "editor";

export function StoryEditorFlow({ isOpen, onClose }: StoryEditorFlowProps) {
  const { user } = useAuth();
  const { setIsCreatingContent } = useChatOpen();
  const [step, setStep] = useState<Step>("gallery");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [editedBlob, setEditedBlob] = useState<Blob | null>(null);
  const [deviceImages, setDeviceImages] = useState<{ id: string; src: string; file: File }[]>([]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [showAdvancedEditor, setShowAdvancedEditor] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Hide bottom nav when creating content
  useEffect(() => {
    setIsCreatingContent(isOpen);
    return () => setIsCreatingContent(false);
  }, [isOpen, setIsCreatingContent]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newImages = files.map((file, index) => ({
      id: `device-${Date.now()}-${index}`,
      src: URL.createObjectURL(file),
      file,
    }));
    setDeviceImages(prev => [...newImages, ...prev]);
  };

  const allImages = deviceImages.length > 0 
    ? deviceImages 
    : mockGalleryImages;
  const [caption, setCaption] = useState("");

  const handleSelectImage = async (src: string, file?: File) => {
    setSelectedImage(src);
    setEditedBlob(null);
    setStep("editor");
    
    // If we have a file, use it directly
    if (file) {
      setSelectedFile(file);
      return;
    }
    
    // For URL-based images (mock gallery), fetch as blob and convert to File
    try {
      const response = await fetch(src);
      const blob = await response.blob();
      const fileName = `gallery-${Date.now()}.${blob.type.split('/')[1] || 'jpg'}`;
      const fetchedFile = new File([blob], fileName, { type: blob.type });
      setSelectedFile(fetchedFile);
    } catch (error) {
      console.error("Error fetching image as file:", error);
      setSelectedFile(null);
    }
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
      // Get the media to upload (edited or original)
      let mediaToUpload: Blob | null = editedBlob;
      
      // If no edited blob, fetch the original image
      if (!mediaToUpload && selectedImage) {
        if (selectedFile) {
          mediaToUpload = selectedFile;
        } else {
          // Fetch from URL (mock images)
          const response = await fetch(selectedImage);
          mediaToUpload = await response.blob();
        }
      }

      if (!mediaToUpload) {
        throw new Error("Нет медиа для загрузки");
      }

      // Upload to storage
      const isVideo = mediaToUpload.type.startsWith("video/");
      const extension = isVideo ? "mp4" : "jpg";
      const fileName = `${user.id}/${Date.now()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from("stories-media")
        .upload(fileName, mediaToUpload, {
          contentType: mediaToUpload.type,
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("stories-media")
        .getPublicUrl(fileName);

      // Create story record
      const { error: insertError } = await supabase
        .from("stories")
        .insert({
          author_id: user.id,
          media_url: urlData.publicUrl,
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
            <h1 className="font-medium text-[17px] text-foreground">Добавить в историю</h1>
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
            <div className="grid grid-cols-4 gap-[1px]">
              {/* Add from gallery button */}
              <button 
                className="aspect-square bg-muted flex flex-col items-center justify-center gap-1"
                onClick={() => fileInputRef.current?.click()}
              >
                <ImagePlus className="w-6 h-6 text-muted-foreground" strokeWidth={1.5} />
                <span className="text-[10px] text-muted-foreground">Галерея</span>
              </button>
              
              {allImages.map((img) => (
                <button
                  key={img.id}
                  onClick={() => handleSelectImage(img.src, 'file' in img ? img.file : undefined)}
                  className="aspect-square relative"
                >
                  <img 
                    src={img.src} 
                    alt="" 
                    className="w-full h-full object-cover"
                  />
                  {'isVideo' in img && (img as { isVideo?: boolean }).isVideo && (
                    <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1">
                      <Eye className="w-3.5 h-3.5 text-white drop-shadow-lg" />
                      <span className="text-white text-xs font-medium drop-shadow-lg">
                        {'views' in img ? String((img as { views?: number }).views) : ''}
                      </span>
                    </div>
                  )}
                </button>
              ))}
            </div>
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
            
            {/* Close Button */}
            <button 
              className="absolute top-4 left-4 w-10 h-10 bg-black/30 backdrop-blur-sm text-white rounded-full flex items-center justify-center safe-area-top"
              onClick={handleBack}
            >
              <X className="w-6 h-6" strokeWidth={1.5} />
            </button>

            {/* Right Side Tools */}
            <div className="absolute top-16 right-4 flex flex-col gap-3 safe-area-top">
              {/* Advanced Editor Button - always visible when we have an image */}
              <button 
                onClick={() => setShowAdvancedEditor(true)}
                disabled={!selectedFile}
                className="w-10 h-10 rounded-full bg-primary/90 backdrop-blur-sm flex items-center justify-center disabled:opacity-50"
              >
                <Wand2 className="w-5 h-5 text-primary-foreground" strokeWidth={1.5} />
              </button>
              <button className="w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center">
                <span className="text-white font-semibold text-[15px]">Aa</span>
              </button>
              <button className="w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center">
                <Smile className="w-5 h-5 text-white" strokeWidth={1.5} />
              </button>
              <button className="w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center">
                <Music className="w-5 h-5 text-white" strokeWidth={1.5} />
              </button>
              <button className="w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center">
                <AtSign className="w-5 h-5 text-white" strokeWidth={1.5} />
              </button>
            </div>

            {/* Edited badge */}
            {editedBlob && (
              <div className="absolute top-4 right-16 px-3 py-1 bg-primary/90 rounded-full text-xs text-primary-foreground font-medium safe-area-top">
                Изменено ✨
              </div>
            )}
          </div>

          {/* Bottom Actions - More visible */}
          <div className="absolute bottom-0 left-0 right-0 px-4 py-6 bg-gradient-to-t from-black/60 to-transparent safe-area-bottom">
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
                  "Опубликовать"
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
    </div>
  );
}
