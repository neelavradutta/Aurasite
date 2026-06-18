import { useEffect, useRef, useState } from 'react';

import { createPortal } from 'react-dom';

import { isImageFile } from '@/utils/mediaFile';



interface Props {

  videoName: string;

  previewUrl: string | null;

  file?: File | null;

  open: boolean;

  onClose: () => void;

}



export default function VideoPreviewOverlay({

  videoName,

  previewUrl,

  file,

  open,

  onClose,

}: Props) {

  const videoRef = useRef<HTMLVideoElement>(null);

  const [mounted, setMounted] = useState(false);

  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);



  useEffect(() => {

    setMounted(true);

  }, []);



  useEffect(() => {

    if (!open) return;



    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = 'hidden';



    return () => {

      document.body.style.overflow = previousOverflow;

    };

  }, [open]);



  useEffect(() => {

    if (!open) {

      setPlaybackUrl(null);

      return;

    }



    const url = file ? URL.createObjectURL(file) : previewUrl;

    setPlaybackUrl(url);



    return () => {

      if (file && url) {

        URL.revokeObjectURL(url);

      }

    };

  }, [open, file, previewUrl, videoName]);



  useEffect(() => {

    if (!open || !playbackUrl || (file && isImageFile(file))) return;



    const video = videoRef.current;

    if (!video) return;



    video.load();

    void video.play().catch(() => undefined);

  }, [open, playbackUrl, file]);



  const showImage = Boolean(file && isImageFile(file));



  if (!mounted || !open || !playbackUrl) return null;



  return createPortal(

    <div

      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"

      onClick={onClose}

    >

      <div

        className="glass-panel w-full max-w-3xl rounded-2xl border border-cyber-cyan/30 p-6 shadow-neon"

        onClick={(event) => event.stopPropagation()}

      >

        <div className="mb-4 flex items-start justify-between gap-4">

          <div className="min-w-0">

            <h3 className="truncate font-orbitron text-lg uppercase tracking-wider text-cyber-cyan sm:text-xl">

              {videoName}

            </h3>

            <p className="mt-1.5 text-sm text-slate-400">
              {showImage ? 'Image preview' : 'Video preview'}
            </p>

          </div>

          <button

            type="button"

            onClick={onClose}

            className="shrink-0 rounded-md border border-white/10 px-5 py-2.5 text-sm font-medium text-slate-300 transition hover:border-cyber-cyan hover:text-cyber-cyan"

          >

            Close

          </button>

        </div>



        <div className="overflow-hidden rounded-xl border border-white/10 bg-black/40">
          {showImage ? (
            <img
              key={playbackUrl}
              src={playbackUrl}
              alt={videoName}
              className="aspect-video w-full bg-black object-contain"
            />
          ) : (
            <video
              ref={videoRef}
              key={playbackUrl}
              src={playbackUrl}
              controls
              playsInline
              preload="auto"
              className="aspect-video w-full bg-black object-contain"
            />
          )}
        </div>

      </div>

    </div>,

    document.body

  );

}


