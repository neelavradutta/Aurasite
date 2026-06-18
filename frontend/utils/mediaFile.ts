export const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|bmp|gif|tiff?|heic|heif|avif|jfif)$/i;

export type MediaKind = 'image' | 'video';

export function getMediaKind(file: File): MediaKind {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (IMAGE_EXTENSIONS.test(file.name)) return 'image';
  return 'video';
}

export function isImageFile(file: File): boolean {
  return getMediaKind(file) === 'image';
}

export function isImageFileName(fileName: string): boolean {
  return IMAGE_EXTENSIONS.test(fileName);
}

export function isVideoFile(file: File): boolean {
  return getMediaKind(file) === 'video';
}

export const MEDIA_FILE_ACCEPT =
  'video/*,image/*,.mp4,.avi,.mov,.mkv,.webm,.jpg,.jpeg,.png,.webp,.bmp,.gif,.tif,.tiff,.heic,.heif,.avif,.jfif';
