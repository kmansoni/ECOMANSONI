import React, { useEffect } from 'react';

declare const jeelizFaceFilter: any;

interface MaskOverlayProps {
  videoRef: React.RefObject<HTMLVideoElement>;
}

const MaskOverlay: React.FC<MaskOverlayProps> = ({ videoRef }) => {
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Create canvas overlay
    const canvas = document.createElement('canvas');
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = `${video.width}px`;
    canvas.style.height = `${video.height}px`;
    canvas.style.pointerEvents = 'none';
    video.parentNode?.insertBefore(canvas, video.nextSibling);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

     // Load mask image
     const maskImg = new Image();
     maskImg.crossOrigin = 'anonymous';
     maskImg.src = 'https://raw.githubusercontent.com/zamhown/wear-a-mask/master/masks/n1.png';

    let maskLoaded = false;
    maskImg.onload = () => {
      maskLoaded = true;
    };

    // Initialize jeelizFaceFilter
    jeelizFaceFilter.init({
      videoElement: video,
      callbackTrack: (detectState: any) => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (detectState.detected && maskLoaded) {
          const { scale, x, y, rz } = detectState;
          const maskWidth = maskImg.width * scale;
          const maskHeight = maskImg.height * scale;
          
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(rz);
          ctx.drawImage(maskImg, -maskWidth / 2, -maskHeight / 2, maskWidth, maskHeight);
          ctx.restore();
        }
      }
    });

    // Cleanup
    return () => {
      jeelizFaceFilter.reset(video);
      canvas.remove();
    };
  }, [videoRef.current]);

  return null;
};

export default MaskOverlay;