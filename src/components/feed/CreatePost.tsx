import { Button } from "@/components/ui/button";
import { useState } from "react";
import { CreateContentModal } from "./CreateContentModal";
import type { ContentType } from "@/hooks/useMediaEditor";

export function CreatePost() {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <div className="px-4 py-3 bg-card border-b border-border flex items-center gap-3">
        <img
          src="https://i.pravatar.cc/150?img=32"
          alt="Your avatar"
          className="w-10 h-10 rounded-full object-cover flex-shrink-0"
        />
        <div 
          className="flex-1 text-muted-foreground text-sm cursor-pointer"
          onClick={() => setShowModal(true)}
        >
          Что нового?
        </div>
        <Button 
          size="sm" 
          className="rounded-full px-5 font-semibold h-9"
          onClick={() => setShowModal(true)}
        >
          Создать
        </Button>
      </div>

      <CreateContentModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSuccess={(contentType: ContentType) => {
          setShowModal(false);
        }}
      />
    </>
  );
}
