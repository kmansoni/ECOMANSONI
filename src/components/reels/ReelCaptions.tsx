import { useEffect, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Caption {
  time: number;
  text: string;
}

interface ReelCaptionsProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  captions?: Caption[];
  onCaptionsGenerated?: (captions: Caption[]) => void;
  visible?: boolean;
}

export function ReelCaptions({ videoRef, captions = [], onCaptionsGenerated, visible = true }: ReelCaptionsProps) {
  const [currentCaption, setCurrentCaption] = useState<string>("");
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const generatedRef = useRef<Caption[]>([]);

  // Display captions from provided list based on video current time
  useEffect(() => {
    if (!videoRef.current || captions.length === 0) return;
    const video = videoRef.current;
    const handleTimeUpdate = () => {
      const t = video.currentTime;
      // Find caption for current time (within 2s window)
      const cap = [...captions].reverse().find((c) => c.time <= t);
      setCurrentCaption(cap?.text || "");
    };
    video.addEventListener("timeupdate", handleTimeUpdate);
    return () => video.removeEventListener("timeupdate", handleTimeUpdate);
  }, [videoRef, captions]);

  const startSpeechCaption = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("SpeechRecognition not supported");
      return;
    }
    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = "ru-RU";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event: any) => {
      const video = videoRef.current;
      const time = video?.currentTime ?? 0;
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setCurrentCaption(transcript);
      if (event.results[event.results.length - 1].isFinal) {
        const newCaption = { time, text: transcript };
        generatedRef.current = [...generatedRef.current, newCaption];
        onCaptionsGenerated?.(generatedRef.current);
      }
    };

    recognition.start();
    setIsListening(true);
  }, [videoRef, onCaptionsGenerated]);

  const stopSpeechCaption = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  if (!visible) return null;

  return (
    <>
      <AnimatePresence mode="wait">
        {currentCaption && (
          <motion.div
            key={currentCaption}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute bottom-24 left-4 right-4 flex justify-center pointer-events-none"
          >
            <div className="bg-black/70 text-white text-sm font-medium rounded-xl px-3 py-1.5 text-center max-w-xs">
              {currentCaption}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CC button */}
      {onCaptionsGenerated && (
        <button
          onClick={isListening ? stopSpeechCaption : startSpeechCaption}
          className="absolute top-16 right-3 bg-black/50 text-white text-xs font-bold px-2 py-1 rounded-lg"
        >
          CC{isListening ? " ●" : ""}
        </button>
      )}
    </>
  );
}
