import { create } from 'zustand';
import { MediaKind } from '@/utils/mediaFile';

export type UploadedVideoRecord = {
  id: string;
  name: string;
  size: number;
  previewUrl: string;
  file: File;
  platesDetected: number;
  mediaType: MediaKind;
};

interface VideoUploadState {
  uploadedVideos: UploadedVideoRecord[];
  pendingFile: File | null;
  pendingPreviewUrl: string | null;
  addUploadedVideo: (video: Omit<UploadedVideoRecord, 'id'>) => void;
  updateUploadedVideo: (id: string, updates: Partial<Omit<UploadedVideoRecord, 'id'>>) => void;
  setPendingSelection: (file: File, previewUrl: string) => void;
  clearPendingSelection: () => void;
  clearUploadedVideos: () => void;
}

export const useVideoUploadStore = create<VideoUploadState>((set, get) => ({
  uploadedVideos: [],
  pendingFile: null,
  pendingPreviewUrl: null,

  addUploadedVideo: (video) =>
    set((state) => ({
      uploadedVideos: [
        ...state.uploadedVideos,
        { ...video, id: `${video.name}-${video.size}-${Date.now()}` },
      ],
    })),

  updateUploadedVideo: (id, updates) =>
    set((state) => ({
      uploadedVideos: state.uploadedVideos.map((video) =>
        video.id === id ? { ...video, ...updates } : video
      ),
    })),

  setPendingSelection: (file, previewUrl) => {
    const currentPreview = get().pendingPreviewUrl;
    const isSharedWithUploads = get().uploadedVideos.some(
      (video) => video.previewUrl === currentPreview
    );
    if (currentPreview && currentPreview !== previewUrl && !isSharedWithUploads) {
      URL.revokeObjectURL(currentPreview);
    }
    set({ pendingFile: file, pendingPreviewUrl: previewUrl });
  },

  clearPendingSelection: () => {
    const { pendingPreviewUrl, uploadedVideos } = get();
    const isSharedWithUploads = uploadedVideos.some(
      (video) => video.previewUrl === pendingPreviewUrl
    );
    if (pendingPreviewUrl && !isSharedWithUploads) {
      URL.revokeObjectURL(pendingPreviewUrl);
    }
    set({ pendingFile: null, pendingPreviewUrl: null });
  },

  clearUploadedVideos: () => {
    const { pendingPreviewUrl, uploadedVideos } = get();
    for (const video of uploadedVideos) {
      if (video.previewUrl !== pendingPreviewUrl) {
        URL.revokeObjectURL(video.previewUrl);
      }
    }
    const isSharedWithUploads = uploadedVideos.some(
      (video) => video.previewUrl === pendingPreviewUrl
    );
    if (pendingPreviewUrl && !isSharedWithUploads) {
      URL.revokeObjectURL(pendingPreviewUrl);
    }
    set({ uploadedVideos: [], pendingFile: null, pendingPreviewUrl: null });
  },
}));
