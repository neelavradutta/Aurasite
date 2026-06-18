import { Detection } from '@/types/detection';

const REJECTED_PLATES = new Set(['UNREADABLE', 'UNKNOWN', 'REJECTED']);
const INDIAN_PLATE_COMPACT = /^[A-Z]{2}\d{2}[A-Z]{1,3}\d{4}$/;
const INDIAN_PLATE_PARTIAL = /^[A-Z]{2}\d{2}[A-Z]{1,3}\d{3}$/;
const CHINESE_STYLE_PLATE = /^[A-Z]\d{5,6}$/;
/** Czech / EU digit-led plates (e.g. 7C76999 from 7C7 6999). */
const EU_DIGIT_LED_PLATE = /^\d[A-Z0-9]{1,3}\d{3,4}$/;

export function normalizePlateKey(plate?: string | null): string {
  return (plate || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isPlateLike(plate?: string | null): boolean {
  const key = normalizePlateKey(plate);
  if (key.length < 5 || key.length > 10) return false;
  if (!/^[A-Z0-9]+$/.test(key)) return false;

  // Indian RTO plates (e.g. MH20EE7602)
  if (INDIAN_PLATE_COMPACT.test(key) || INDIAN_PLATE_PARTIAL.test(key)) return true;

  // Chinese plates when the province glyph is missed by OCR (e.g. E99999 for 黑E·99999)
  if (CHINESE_STYLE_PLATE.test(key)) return true;

  // Czech / EU digit-led plates (e.g. 7C76999)
  if (EU_DIGIT_LED_PLATE.test(key)) return true;

  const letters = [...key].filter((char) => /[A-Z]/.test(char)).length;
  const digits = [...key].filter((char) => /[0-9]/.test(char)).length;

  // US/EU vanity plates (e.g. ADVNTXR) — letters only, 5-8 chars
  if (letters >= 3 && digits === 0 && key.length <= 8) return true;

  // OCR reads with a single digit (e.g. BAN0NYA) or short mixed plates
  if (letters >= 3 && digits >= 1 && key.length <= 10) return true;

  // Mixed EU/US plates — up to 8 chars
  return letters >= 2 && digits >= 2 && key.length <= 8;
}

export function isUnreadablePlate(plate?: string | null): boolean {
  const key = normalizePlateKey(plate);
  if (!key || REJECTED_PLATES.has(key)) return true;
  return key.startsWith('UNREADABLE');
}

/** Partial / cropped reads — not counted in Most Frequent Vehicles. */
export function isHalfPlate(
  plate?: string | null,
  detection?: Pick<Detection, 'detection_quality'>
): boolean {
  const key = normalizePlateKey(plate);
  if (!key) return true;

  const quality = (detection?.detection_quality || '').toLowerCase();
  if (quality === 'partial') return true;

  // Indian BH-series missing the final digit (e.g. KA02MM909).
  if (INDIAN_PLATE_PARTIAL.test(key) && !INDIAN_PLATE_COMPACT.test(key)) return true;

  return false;
}

function levenshteinDistance(left: string, right: string, maxDistance = 2): number {
  if (left === right) return 0;
  if (!left) return right.length;
  if (!right) return left.length;
  if (Math.abs(left.length - right.length) > maxDistance) return maxDistance + 1;

  let previousRow = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let i = 0; i < left.length; i += 1) {
    const currentRow = [i + 1];
    let rowMin = i + 1;

    for (let j = 0; j < right.length; j += 1) {
      const cell = Math.min(
        currentRow[j] + 1,
        previousRow[j + 1] + 1,
        previousRow[j] + (left[i] === right[j] ? 0 : 1)
      );
      currentRow.push(cell);
      rowMin = Math.min(rowMin, cell);
    }

    if (rowMin > maxDistance) return maxDistance + 1;
    previousRow = currentRow;
  }

  return previousRow[previousRow.length - 1];
}

/** Merge OCR variants of the same physical plate (e.g. R197GB vs R197G8). */
export function platesAreSimilar(left?: string | null, right?: string | null): boolean {
  const a = normalizePlateKey(left);
  const b = normalizePlateKey(right);
  if (!a || !b) return false;
  if (a === b) return true;

  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  if (longer.includes(shorter) && shorter.length >= 5) return true;
  if (Math.abs(a.length - b.length) > 2) return false;

  const maxDistance = Math.max(a.length, b.length) <= 6 ? 1 : 2;
  return levenshteinDistance(a, b, maxDistance) <= maxDistance;
}

/** Accepted, full plates only — safe for dashboard widgets (not the detection log). */
export function isAcceptedDetection(detection: Detection): boolean {
  const quality = detection.detection_quality;
  if (quality === 'invalid' || quality === 'unreadable') return false;

  if (isUnreadablePlate(detection.plate_number)) return false;
  if (!isPlateLike(detection.plate_number)) return false;
  if (!detection.frame_image_path) return false;
  return true;
}

/** One card per physical plate (best confidence, fuzzy OCR merge). */
export function getDashboardPlates(detections: Detection[]): Detection[] {
  const ranked = detections
    .filter(isAcceptedDetection)
    .sort((a, b) => {
      const confidenceDiff = (Number(b.plate_confidence) || 0) - (Number(a.plate_confidence) || 0);
      if (confidenceDiff !== 0) return confidenceDiff;
      const lengthDiff =
        normalizePlateKey(b.plate_number).length - normalizePlateKey(a.plate_number).length;
      if (lengthDiff !== 0) return lengthDiff;
      return new Date(b.detection_timestamp).getTime() - new Date(a.detection_timestamp).getTime();
    });

  const unique: Detection[] = [];

  for (const detection of ranked) {
    const key = normalizePlateKey(detection.plate_number);
    if (!key) continue;

    const similarIndex = unique.findIndex((existing) =>
      platesAreSimilar(existing.plate_number, detection.plate_number)
    );
    if (similarIndex >= 0) {
      const existing = unique[similarIndex];
      if (key.length > normalizePlateKey(existing.plate_number).length) {
        unique[similarIndex] = detection;
      }
      continue;
    }

    unique.push(detection);
  }

  return unique;
}
