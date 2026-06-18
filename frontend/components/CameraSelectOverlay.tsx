import { useCallback, useEffect, useState } from 'react';
import Button from '@/components/shared/Button';

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (device: MediaDeviceInfo, stream: MediaStream) => void;
}

function formatDeviceLabel(device: MediaDeviceInfo, index: number): string {
  const label = device.label?.trim();
  if (label) return label;
  return `Camera ${index + 1}`;
}

export default function CameraSelectOverlay({ open, onClose, onSelect }: Props) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const loadDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setError('Camera devices are not supported in this browser.');
      setDevices([]);
      return;
    }

    setLoading(true);
    setError('');

    try {
      try {
        const permissionStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        permissionStream.getTracks().forEach((track) => track.stop());
      } catch {
        setError('Camera permission is required to list available devices.');
      }

      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = allDevices.filter((device) => device.kind === 'videoinput');
      setDevices(videoInputs);

      if (videoInputs.length === 0) {
        setError('No camera input devices were found.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load camera devices.');
      setDevices([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadDevices();
  }, [open, loadDevices]);

  useEffect(() => {
    if (!open) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, onClose]);

  async function handleSelectDevice(device: MediaDeviceInfo) {
    setSelectingId(device.deviceId);
    setError('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: device.deviceId } },
        audio: false,
      });
      onSelect(device, stream);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to open the selected camera.');
    } finally {
      setSelectingId(null);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-[#050816]/80 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="camera-select-title"
    >
      <div
        className="w-full max-w-lg rounded-xl border border-[#00D9FF]/30 bg-[#0a1028] p-5 shadow-[0_0_36px_rgba(0,217,255,0.12)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="camera-select-title" className="font-orbitron text-lg text-[#00D9FF]">
              Select Camera
            </h2>
            <p className="mt-1 text-xs text-slate-400">Choose a webcam or external camera input device.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-lg text-slate-300 transition hover:border-[#00D9FF]/50 hover:text-[#00D9FF]"
            aria-label="Close camera selector"
          >
            ×
          </button>
        </div>

        {loading ? (
          <div className="rounded-lg border border-dashed border-white/10 bg-black/20 px-4 py-8 text-center text-sm text-slate-400">
            Scanning camera devices...
          </div>
        ) : devices.length === 0 ? (
          <div className="rounded-lg border border-dashed border-white/10 bg-black/20 px-4 py-8 text-center text-sm text-slate-400">
            {error || 'No camera devices available.'}
          </div>
        ) : (
          <ul className="max-h-72 space-y-2 overflow-y-auto pr-1 [scrollbar-color:rgba(0,217,255,0.45)_transparent] [scrollbar-width:thin]">
            {devices.map((device, index) => (
              <li key={device.deviceId}>
                <button
                  type="button"
                  onClick={() => void handleSelectDevice(device)}
                  disabled={selectingId === device.deviceId}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/25 px-4 py-3 text-left transition hover:border-[#00D9FF]/40 hover:bg-[#00D9FF]/5 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-slate-200">
                      {formatDeviceLabel(device, index)}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] uppercase tracking-[0.12em] text-[#6B7A8F]">
                      {device.deviceId.slice(0, 18)}...
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-[#00D9FF]">
                    {selectingId === device.deviceId ? 'Opening...' : 'Use'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {error && devices.length > 0 && <p className="mt-3 text-xs text-cyber-pink">{error}</p>}

        <div className="mt-4 flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
