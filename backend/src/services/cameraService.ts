import Camera from '../models/Camera';

export interface CameraLocationPayload {
  camera_code: string;
  camera_name: string;
  video_source: string;
  latitude: number | null;
  longitude: number | null;
  place_name: string | null;
  gps_updated_at: string | null;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toPayload(camera: Camera): CameraLocationPayload {
  return {
    camera_code: camera.camera_code,
    camera_name: camera.name,
    video_source: camera.video_source,
    latitude: toNumber(camera.latitude),
    longitude: toNumber(camera.longitude),
    place_name: camera.place_name,
    gps_updated_at: camera.gps_updated_at ? camera.gps_updated_at.toISOString() : null,
  };
}

export const cameraService = {
  async getByVideoSource(videoSource: string): Promise<Camera | null> {
    const normalized = videoSource.trim();
    if (!normalized) return null;
    return Camera.findOne({ where: { video_source: normalized } });
  },

  async getLiveLocationByVideoSource(videoSource: string): Promise<CameraLocationPayload | null> {
    const camera = await this.getByVideoSource(videoSource);
    if (!camera) return null;
    return toPayload(camera);
  },

  async ensureCameraForVideoSource(
    videoSource: string,
    gps?: {
      latitude?: number | null;
      longitude?: number | null;
      place_name?: string | null;
    }
  ): Promise<Camera> {
    const normalized = videoSource.trim();
    const existing = await Camera.findOne({ where: { video_source: normalized } });

    if (existing) {
      const latitude = gps?.latitude ?? null;
      const longitude = gps?.longitude ?? null;
      const hasGps = latitude !== null && longitude !== null;

      if (hasGps) {
        await existing.update({
          latitude,
          longitude,
          place_name: gps?.place_name?.trim() || existing.place_name,
          gps_updated_at: new Date(),
        });
      }

      return existing;
    }

    const nextId = (await Camera.max('id')) as number | null;
    const cameraCode = `CAM-${String((nextId || 0) + 1).padStart(3, '0')}`;
    const latitude = gps?.latitude ?? null;
    const longitude = gps?.longitude ?? null;

    return Camera.create({
      camera_code: cameraCode,
      name: cameraCode,
      video_source: normalized,
      latitude,
      longitude,
      place_name: gps?.place_name?.trim() || null,
      gps_updated_at: latitude !== null && longitude !== null ? new Date() : null,
    });
  },

  async seedDefaultCameras(): Promise<void> {
    const defaults = [
      {
        camera_code: 'CAM-001',
        name: 'CAM-001',
        video_source: 'carLicence4.mp4',
        latitude: 12.9716,
        longitude: 77.5946,
        place_name: 'Outer Ring Road Checkpoint, Bengaluru',
      },
      {
        camera_code: 'CAM-002',
        name: 'CAM-002',
        video_source: 'live-camera',
        latitude: 12.9851,
        longitude: 77.6102,
        place_name: 'Electronic City Flyover, Bengaluru',
      },
    ];

    for (const camera of defaults) {
      const bySource = await Camera.findOne({ where: { video_source: camera.video_source } });
      if (bySource) continue;

      const byCode = await Camera.findOne({ where: { camera_code: camera.camera_code } });
      if (byCode) {
        await byCode.update({
          video_source: camera.video_source,
          name: camera.name,
          latitude: camera.latitude,
          longitude: camera.longitude,
          place_name: camera.place_name,
          gps_updated_at: new Date(),
        });
        continue;
      }

      await Camera.create({
        ...camera,
        gps_updated_at: new Date(),
      });
    }
  },
};
