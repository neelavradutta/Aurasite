import { useCallback, useEffect, useRef, useState } from 'react';

import { useRouter } from 'next/router';

import { useDashboardStore } from '@/store/dashboardStore';

import { UploadedVideoRecord, useVideoUploadStore } from '@/store/videoUploadStore';

import { getMediaKind, isImageFile, isImageFileName, MEDIA_FILE_ACCEPT } from '@/utils/mediaFile';

import VideoPreviewOverlay from '@/components/RightPanel/VideoPreviewOverlay';
import ImageIcon from '@/components/ImageIcon';
import VideoIcon from '@/components/VideoIcon';
import PanelIconHeader from '@/components/shared/PanelIconHeader';
import { VideoInputPanelIcon, PANEL_ICON_CLASS } from '@/components/NavIcons';
import { useActiveTheme } from '@/hooks/useTheme';



interface Props {

  uploading: boolean;

  uploadError: string;

  isLoggedIn: boolean;

  onLoadVideo: (file: File) => Promise<{ success: boolean; platesDetected: number }>;

}



function formatFileSize(bytes: number): string {

  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;

  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;

}



export default function VideoInputPanel({

  uploading,

  uploadError,

  isLoggedIn,

  onLoadVideo,

}: Props) {

  const router = useRouter();
  const activeTheme = useActiveTheme();

  const sessionVersion = useDashboardStore((s) => s.sessionVersion);

  const {
    uploadedVideos,
    pendingFile,
    pendingPreviewUrl,
    addUploadedVideo,
    updateUploadedVideo,
    removeUploadedVideo,
    setPendingSelection,
    clearPendingSelection,
    clearUploadedVideos,
  } = useVideoUploadStore();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const prevSessionVersion = useRef(sessionVersion);

  const [overlayVideo, setOverlayVideo] = useState<UploadedVideoRecord | null>(null);
  const [selectedUploadedVideo, setSelectedUploadedVideo] = useState<UploadedVideoRecord | null>(
    null
  );

  const selectedFile = selectedUploadedVideo?.file ?? pendingFile;
  const previewUrl = selectedUploadedVideo?.previewUrl ?? pendingPreviewUrl;

  useEffect(() => {

    if (prevSessionVersion.current !== sessionVersion) {

      clearUploadedVideos();

      setOverlayVideo(null);
      setSelectedUploadedVideo(null);

      prevSessionVersion.current = sessionVersion;

    }

  }, [sessionVersion, clearUploadedVideos]);

  function findUploadedMatch(file: File): UploadedVideoRecord | undefined {
    return uploadedVideos.find((video) => video.name === file.name && video.size === file.size);
  }

  async function processSelectedFile(file: File, filePreview: string) {
    if (!isLoggedIn) {
      router.push('/login');
      return;
    }

    const result = await onLoadVideo(file);
    if (!result.success) return;

    const existing = findUploadedMatch(file);
    const record = {
      name: file.name,
      size: file.size,
      previewUrl: filePreview,
      file,
      platesDetected: result.platesDetected,
      mediaType: getMediaKind(file),
    };

    if (existing) {
      updateUploadedVideo(existing.id, record);
    } else {
      addUploadedVideo(record);
    }

    setSelectedUploadedVideo(null);
    clearPendingSelection();
  }

  const clearUploadedSelection = useCallback(() => {
    setSelectedUploadedVideo(null);
    clearPendingSelection();
  }, [clearPendingSelection]);

  function handleSelectUploadedVideo(video: UploadedVideoRecord) {
    setSelectedUploadedVideo(video);
  }

  function handleRemoveUploadedVideo(
    event: React.MouseEvent<HTMLButtonElement>,
    videoId: string
  ) {
    event.stopPropagation();

    removeUploadedVideo(videoId);

    if (selectedUploadedVideo?.id === videoId) {
      setSelectedUploadedVideo(null);
      clearPendingSelection();
    }

    if (overlayVideo?.id === videoId) {
      setOverlayVideo(null);
    }
  }

  useEffect(() => {
    if (!selectedUploadedVideo) return;

    function handleClickOutside(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('[data-uploaded-video-card]')) return;
      if (target.closest('[data-preserve-upload-selection]')) return;

      clearUploadedSelection();
    }

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [selectedUploadedVideo, clearUploadedSelection]);



  function handleChooseFile(event: React.ChangeEvent<HTMLInputElement>) {

    const file = event.target.files?.[0];

    if (!file) return;



    const nextPreview = URL.createObjectURL(file);
    setPendingSelection(file, nextPreview);

    const existing = findUploadedMatch(file);
    if (existing) {
      URL.revokeObjectURL(nextPreview);
      setSelectedUploadedVideo(existing);
      clearPendingSelection();
      return;
    }

    setSelectedUploadedVideo(null);

    if (uploadedVideos.length > 0) {
      void processSelectedFile(file, nextPreview);
    }
  }



  async function handleLoadVideo() {

    if (!selectedFile) {

      fileInputRef.current?.click();

      return;

    }



    const filePreview = previewUrl;

    if (!filePreview) return;



    await processSelectedFile(selectedFile, filePreview);

  }



  function handleNewUpload() {
    clearUploadedSelection();

    if (!fileInputRef.current) return;

    fileInputRef.current.value = '';
    fileInputRef.current.click();
  }

  function handleRemovePendingSelection() {
    clearUploadedSelection();

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  async function handlePrimaryResultsAction() {
    if (uploading) return;

    if (selectedUploadedVideo && selectedFile && previewUrl) {
      await processSelectedFile(selectedFile, previewUrl);
      return;
    }

    handleNewUpload();
  }



  const previewStatus = uploading ? 'PROCESSING' : selectedFile ? 'READY' : 'IDLE';

  const totalSize = uploadedVideos.reduce((sum, video) => sum + video.size, 0);

  const latestVideo = uploadedVideos[uploadedVideos.length - 1];
  const recentFileSize = latestVideo ? formatFileSize(latestVideo.size) : '—';

  const isResults = uploadedVideos.length > 0;
  const isReuploadSelected = Boolean(selectedUploadedVideo);
  const showSplitInputActions = !isResults && Boolean(selectedFile && previewUrl);
  const primaryResultsLabel = uploading
    ? 'Processing...'
    : isReuploadSelected
      ? 'Process Again'
      : 'New Upload';

  const loadButtonLabel = uploading
    ? 'Processing...'
    : selectedFile && isImageFile(selectedFile)
      ? 'Load Image'
      : 'Load Video';



  return (

    <section className="glass-panel video-input-cyberpunk h-auto min-h-0 max-h-none shrink-0 rounded-xl border border-white/5 p-5 xl:h-[27.5rem] xl:min-h-[27.5rem] xl:max-h-[27.5rem]">

      <div className="video-panel__header">

        {isResults ? (
          activeTheme === 'brown-cream' ? (
            <PanelIconHeader
              icon={<VideoInputPanelIcon className={PANEL_ICON_CLASS} />}
              title="Processing Completed"
              iconBg="bg-white/10"
              iconColor="text-white"
              className="!mb-0"
            />
          ) : (
            <h3 className="video-results-cyberpunk__header">
              <span className="video-results-cyberpunk__header-badge" aria-hidden>
                ✓
              </span>
              Processing Completed
            </h3>
          )
        ) : (

          <PanelIconHeader
            icon={<VideoInputPanelIcon />}
            title="Video Input"
            titleClassName="video-input-cyberpunk__title"
            useSectionTitle={false}
            className="!mb-0"
          />

        )}

      </div>



      <input

        ref={fileInputRef}

        type="file"

        accept={MEDIA_FILE_ACCEPT}

        className="hidden"

        onChange={handleChooseFile}

        disabled={uploading}

      />



      <div className="video-panel__toolbar">

        {isResults ? (

          <div className="video-results-cyberpunk__stats">

            <div className="video-results-cyberpunk__stat-box">

              <div className="video-results-cyberpunk__stat-num">{uploadedVideos.length}</div>

              <div className="video-results-cyberpunk__stat-label">Files Uploaded</div>

            </div>

            <div className="video-results-cyberpunk__stat-box">

              <div className="video-results-cyberpunk__stat-num">{formatFileSize(totalSize)}</div>

              <div className="video-results-cyberpunk__stat-label">Total Uploaded File</div>

            </div>

            <div className="video-results-cyberpunk__stat-box">

              <div className="video-results-cyberpunk__stat-num">{recentFileSize}</div>

              <div className="video-results-cyberpunk__stat-label">Recent File</div>

            </div>

          </div>

        ) : (

          <div className="video-input-cyberpunk__upload h-full">

            <button

              type="button"

              onClick={() => fileInputRef.current?.click()}

              disabled={uploading}

              className="video-input-cyberpunk__choose-btn"

            >

              Choose File

            </button>

            <span className="video-input-cyberpunk__filename truncate">

              {selectedFile?.name || 'No file selected'}

            </span>

          </div>

        )}

      </div>



      <div className="video-panel__stage-wrap">

        <p

          className={

            isResults

              ? 'video-results-cyberpunk__videos-title video-panel__stage-label'

              : 'video-input-cyberpunk__preview-label video-panel__stage-label'

          }

        >

          {isResults ? (
            'Uploaded Files'
          ) : (
            <>
              Preview
              <span
                className={`video-input-cyberpunk__preview-status video-input-cyberpunk__preview-status--${previewStatus.toLowerCase()}`}
              >
                (  {previewStatus}  )
              </span>
            </>
          )}

        </p>



        <div className="video-panel__stage">

          {isResults ? (

            <div className="video-input-cyberpunk__preview video-input-cyberpunk__preview--results h-full">

              <div className="video-results-cyberpunk__videos-list video-uploads-scroll">

                {uploadedVideos.map((video) => (

                <div

                  key={video.id}

                  role="button"

                  tabIndex={0}

                  title="Click to select, double-click to preview"

                  data-uploaded-video-card

                  className={`video-results-cyberpunk__video-card cursor-pointer ${
                    selectedUploadedVideo?.id === video.id
                      ? 'video-results-cyberpunk__video-card--selected'
                      : ''
                  }`}

                  onClick={() => handleSelectUploadedVideo(video)}

                  onDoubleClick={() => setOverlayVideo(video)}

                  onKeyDown={(event) => {

                    if (event.key === 'Enter') handleSelectUploadedVideo(video);

                  }}

                >

                  <div className="video-results-cyberpunk__video-thumb">
                    {video.mediaType === 'image' || isImageFileName(video.name) ? (
                      <ImageIcon size={40} className="shrink-0" />
                    ) : (
                      <VideoIcon size={40} className="shrink-0" />
                    )}
                  </div>

                  <div className="video-results-cyberpunk__video-info">

                    <p className="video-results-cyberpunk__video-name">{video.name}</p>

                    <p className="video-results-cyberpunk__video-size">

                      {formatFileSize(video.size)} • {video.platesDetected} plates

                    </p>

                  </div>

                  {selectedUploadedVideo?.id === video.id ? (
                    <button
                      type="button"
                      className="video-results-cyberpunk__video-remove"
                      aria-label={`Remove ${video.name}`}
                      onClick={(event) => handleRemoveUploadedVideo(event, video.id)}
                      onDoubleClick={(event) => event.stopPropagation()}
                    >
                      Remove
                    </button>
                  ) : null}

                </div>

              ))}

            </div>

            </div>

          ) : (

            <div
              className={`video-input-cyberpunk__preview h-full${
                previewUrl ? ' video-input-cyberpunk__preview--ready' : ' video-input-cyberpunk__preview--idle'
              }`}
            >

              {previewUrl ? (
                selectedFile && isImageFile(selectedFile) ? (
                  <img
                    key={previewUrl}
                    src={previewUrl}
                    alt={selectedFile.name}
                    className="h-full w-full bg-black object-contain"
                  />
                ) : (
                  <video key={previewUrl} src={previewUrl} controls className="bg-black" />
                )
              ) : (
                <div className="video-input-cyberpunk__preview-empty">
                  Select a video or image to preview
                </div>
              )}

            </div>

          )}

        </div>

      </div>



      <div
        className={`video-panel__actions${
          isResults ? ' video-panel__actions--results' : ' video-panel__actions--input'
        }${
          !isResults && uploadError && !uploading ? ' video-panel__actions--input-error' : ''
        }`}
      >

        {isResults ? (

          <div className="video-results-cyberpunk__btn-group h-full">

            <button
              type="button"
              onClick={handlePrimaryResultsAction}
              disabled={uploading}
              data-preserve-upload-selection={isReuploadSelected ? true : undefined}
              className="video-results-cyberpunk__btn-primary"
            >
              {primaryResultsLabel}
            </button>

            <button

              type="button"

              onClick={() => latestVideo && setOverlayVideo(latestVideo)}

              disabled={!latestVideo}

              className="video-results-cyberpunk__btn-secondary"

            >

              Preview

            </button>

          </div>

        ) : showSplitInputActions ? (

          <div className="video-input-cyberpunk__btn-group h-full">

            <button
              type="button"
              onClick={handleLoadVideo}
              disabled={uploading}
              className="video-input-cyberpunk__load-btn video-input-cyberpunk__load-btn--split"
            >
              {loadButtonLabel}
            </button>

            <button
              type="button"
              onClick={handleRemovePendingSelection}
              disabled={uploading}
              className="video-input-cyberpunk__remove-btn"
            >
              Remove
            </button>

          </div>

        ) : (

          <button

            type="button"

            onClick={handleLoadVideo}

            disabled={uploading || !selectedFile}

            className="video-input-cyberpunk__load-btn"

          >

            {loadButtonLabel}

          </button>

        )}

      </div>



      <div className="video-panel__error-slot">

        {!isResults && uploadError && !uploading ? (

          <p className="text-xs text-cyber-pink">{uploadError}</p>

        ) : null}

      </div>



      <VideoPreviewOverlay

        videoName={overlayVideo?.name ?? ''}

        previewUrl={overlayVideo?.previewUrl ?? null}

        file={overlayVideo?.file ?? null}

        open={Boolean(overlayVideo)}

        onClose={() => setOverlayVideo(null)}

      />

    </section>

  );

}


