import { create } from 'zustand';
import { MediaKind } from '@/utils/mediaFile';

const fileCache = new Map<string, File>();

function cacheFile(id: string, name: string, size: number, file?: File) {
  if (file) {
    fileCache.set(id, file);
    fileCache.set(`meta:${name}:${size}`, file);
    return;
  }
  fileCache.delete(id);
  fileCache.delete(`meta:${name}:${size}`);
}

function resolveCachedFile(
  record: Pick<UploadedVideoRecord, 'id' | 'name' | 'size' | 'file'>
): File | undefined {
  if (record.file) return record.file;
  return fileCache.get(record.id) ?? fileCache.get(`meta:${record.name}:${record.size}`);
}

export function getRecordFile(
  record: Pick<UploadedVideoRecord, 'id' | 'name' | 'size' | 'file'> | null | undefined
): File | undefined {
  if (!record) return undefined;
  return resolveCachedFile(record);
}

export type UploadedVideoRecord = {
  id: string;
  name: string;
  size: number;
  previewUrl: string;
  file?: File;
  platesDetected: number;
  mediaType: MediaKind;
};

interface VideoUploadState {
  uploadedVideos: UploadedVideoRecord[];
  pendingFile: File | null;
  pendingPreviewUrl: string | null;
  addUploadedVideo: (video: Omit<UploadedVideoRecord, 'id'>) => void;
  updateUploadedVideo: (id: string, updates: Partial<Omit<UploadedVideoRecord, 'id'>>) => void;
  removeUploadedVideo: (id: string) => void;
  setPendingSelection: (file: File, previewUrl: string) => void;
  clearPendingSelection: () => void;
  clearUploadedVideos: () => void;
  hydrateUploadedVideosFromMeta: (
    videos: Array<{
      id: string;
      name: string;
      size: number;
      platesDetected: number;
      mediaType: MediaKind;
    }>
  ) => void;
}

export const useVideoUploadStore = create<VideoUploadState>((set, get) => ({
  uploadedVideos: [],
  pendingFile: null,
  pendingPreviewUrl: null,

  addUploadedVideo: (video) =>
    set((state) => {
      const id = `${video.name}-${video.size}-${Date.now()}`;
      cacheFile(id, video.name, video.size, video.file);
      return {
        uploadedVideos: [...state.uploadedVideos, { ...video, id }],
      };
    }),

  updateUploadedVideo: (id, updates) =>
    set((state) => ({
      uploadedVideos: state.uploadedVideos.map((video) => {
        if (video.id !== id) return video;
        const next = { ...video, ...updates };
        if ('file' in updates) {
          cacheFile(id, next.name, next.size, updates.file);
        }
        return { ...next, file: resolveCachedFile(next) };
      }),
    })),

  removeUploadedVideo: (id) => {
    const { uploadedVideos, pendingPreviewUrl } = get();
    const video = uploadedVideos.find((item) => item.id === id);
    if (!video) return;

    cacheFile(id, video.name, video.size);

    const remaining = uploadedVideos.filter((item) => item.id !== id);
    const previewStillUsed =
      pendingPreviewUrl === video.previewUrl ||
      remaining.some((item) => item.previewUrl === video.previewUrl);

    if (video.previewUrl && !previewStillUsed) {
      URL.revokeObjectURL(video.previewUrl);
    }

    set({ uploadedVideos: remaining });
  },

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
      if (video.previewUrl && video.previewUrl !== pendingPreviewUrl) {
        URL.revokeObjectURL(video.previewUrl);
      }
    }
    const isSharedWithUploads = uploadedVideos.some(
      (video) => video.previewUrl && video.previewUrl === pendingPreviewUrl
    );
    if (pendingPreviewUrl && !isSharedWithUploads) {
      URL.revokeObjectURL(pendingPreviewUrl);
    }
    set({ uploadedVideos: [], pendingFile: null, pendingPreviewUrl: null });
  },

  hydrateUploadedVideosFromMeta: (videos) =>
    set({
      uploadedVideos: videos.map((video) => ({
        ...video,
        previewUrl: '',
        file: resolveCachedFile({ ...video, file: undefined }),
      })),
      pendingFile: null,
      pendingPreviewUrl: null,
    }),
}));
