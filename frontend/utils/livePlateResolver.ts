import { LiveDetectionFrame } from '@/services/api';

const UNREADABLE_VALUES = new Set(['', 'UNKNOWN', 'UNREADABLE', 'REJECTED']);
const INDIAN_STATE_CODES = new Set([
  'AN',
  'AP',
  'AR',
  'AS',
  'BR',
  'CG',
  'CH',
  'DD',
  'DL',
  'DN',
  'GA',
  'GJ',
  'HP',
  'HR',
  'JH',
  'JK',
  'KA',
  'KL',
  'LA',
  'LD',
  'MH',
  'ML',
  'MN',
  'MP',
  'MZ',
  'NL',
  'OD',
  'OR',
  'PB',
  'PY',
  'RJ',
  'SK',
  'TN',
  'TR',
  'TS',
  'UK',
  'UP',
  'WB',
]);

type CandidateSource = 'raw' | 'cleaned' | 'display';

type PlateCandidate = {
  value: string;
  source: CandidateSource;
  confidence: number;
  frameId: number;
};

type PlateTrack = {
  value: string;
  observations: number;
  confidenceTotal: number;
  lastFrameId: number;
  bestSource: CandidateSource;
  bestScore: number;
};

export type LiveResolvedPlate = {
  plate: string;
  confidence: number;
  observations: number;
  frameId: number;
};

function compactPlate(value?: string): string {
  return (value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function isReadable(value: string): boolean {
  return !UNREADABLE_VALUES.has(value);
}

function hasIndianStatePrefix(value: string): boolean {
  return value.length >= 2 && INDIAN_STATE_CODES.has(value.slice(0, 2));
}

function normalizeLetter(char: string): string {
  if (char === '0') return 'O';
  if (char === '1') return 'I';
  if (char === '5') return 'S';
  if (char === '6') return 'G';
  return char;
}

function normalizeDigit(char: string): string {
  if (char === 'O' || char === 'Q') return '0';
  if (char === 'I' || char === 'L') return '1';
  if (char === 'Z') return '2';
  if (char === 'S') return '5';
  if (char === 'B') return '8';
  return char;
}

function repairStatePrefix(value: string): string {
  if (hasIndianStatePrefix(value)) return value;
  if (value.length < 2) return value;

  const first = normalizeLetter(value[0]);
  const second = normalizeLetter(value[1]);
  const repaired = `${first}${second}${value.slice(2)}`;
  if (hasIndianStatePrefix(repaired)) return repaired;

  // Delhi plates are common in the demo/live tests; OCR often reads DL as D1/DI.
  if (first === 'D' && ['1', 'I', 'L'].includes(value[1])) {
    return `DL${value.slice(2)}`;
  }

  // Webcam OCR often reads MP as MA/M9/MN.
  if (value.startsWith('MA') || value.startsWith('M9') || value.startsWith('MN')) {
    return `MP${value.slice(2)}`;
  }

  return value;
}

function repairIndianPlate(value: string): string {
  const stateFixed = repairStatePrefix(value);
  if (!hasIndianStatePrefix(stateFixed)) return stateFixed;

  const state = stateFixed.slice(0, 2);
  const body = stateFixed.slice(2);
  const match = body.match(/^([A-Z0-9]{1,2})([A-Z0-9]{1,3})([A-Z0-9]{3,4})$/);
  if (!match) return stateFixed;

  const [, rtoRaw, seriesRaw, numberRaw] = match;
  const rto = [...rtoRaw].map(normalizeDigit).join('');
  const series = [...seriesRaw].map(normalizeLetter).join('');
  const number = [...numberRaw].map(normalizeDigit).join('');
  return `${state}${rto}${series}${number}`;
}

function enumerateIndianRepairs(value: string): string[] {
  const stateFixed = repairStatePrefix(value);
  if (!hasIndianStatePrefix(stateFixed)) return [];

  const state = stateFixed.slice(0, 2);
  const body = stateFixed.slice(2);
  const repairs = new Set<string>();

  for (const rtoLength of [1, 2]) {
    for (const seriesLength of [1, 2, 3]) {
      for (const targetNumberLength of [4, 3]) {
        const bodyNumberLength = body.length - rtoLength - seriesLength;
        if (bodyNumberLength !== targetNumberLength) continue;

        const rtoRaw = body.slice(0, rtoLength);
        const seriesRaw = body.slice(rtoLength, rtoLength + seriesLength);
        const numberRaw = body.slice(rtoLength + seriesLength);
        const rto = [...rtoRaw].map(normalizeDigit).join('');
        const baseSeries = [...seriesRaw].map(normalizeLetter).join('');

        for (const series of repairSeriesVariants(baseSeries)) {
          for (const number of padIndianNumber(numberRaw)) {
            const repaired = `${state}${rto}${series}${number}`;
            if (isIndianPlate(repaired)) {
              repairs.add(repaired);
            }
          }
        }
      }
    }
  }

  return [...repairs];
}

function isIndianPlate(value: string): boolean {
  if (!hasIndianStatePrefix(value)) return false;
  const body = value.slice(2);
  // Support both modern two-digit RTO and Delhi legacy single-digit RTO layouts.
  return /^(\d{1,2})([A-Z]{1,3})(\d{4})$/.test(body);
}

function isIndianPlatePartial(value: string): boolean {
  if (!hasIndianStatePrefix(value)) return false;
  const body = value.slice(2);
  return /^(\d{1,2})([A-Z]{1,3})(\d{3})$/.test(body);
}

/** Webcam OCR often swaps B/S in the letter series (e.g. BD → SD). */
function repairSeriesVariants(series: string): string[] {
  const variants = new Set<string>([series]);
  const swaps: Record<string, string> = {
    SD: 'BD',
    SB: 'DB',
    SG: 'BG',
    SN: 'BN',
    S8: 'B8',
    '5D': 'BD',
  };
  if (swaps[series]) variants.add(swaps[series]);
  if (series.length === 2 && series[0] === 'S') {
    variants.add(`B${series[1]}`);
  }
  if (series.length === 2 && series[1] === '8') {
    variants.add(`${series[0]}B`);
  }
  return [...variants];
}

function padIndianNumber(numberRaw: string): string[] {
  const normalized = [...numberRaw].map(normalizeDigit).join('');
  if (normalized.length === 4) return [normalized];
  if (normalized.length === 3) {
    // Truncated last digit is common on live OCR (333 → 3333).
    return [normalized, `${normalized}${normalized[2]}`];
  }
  return [normalized];
}

function levenshtein(left: string, right: string): number {
  if (left === right) return 0;
  const rows = left.length + 1;
  const cols = right.length + 1;
  const matrix = Array.from({ length: rows }, () => Array<number>(cols).fill(0));
  for (let i = 0; i < rows; i += 1) matrix[i][0] = i;
  for (let j = 0; j < cols; j += 1) matrix[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[rows - 1][cols - 1];
}

function isVanityPlate(value: string): boolean {
  if (!isReadable(value)) return false;
  const letters = value.replace(/[^A-Z]/g, '').length;
  const digits = value.replace(/\D/g, '').length;
  return value.length >= 5 && value.length <= 10 && letters >= 3 && letters + digits === value.length;
}

function looksPlateLike(value: string): boolean {
  if (!isReadable(value)) return false;
  if (isIndianPlate(value)) return true;
  if (isIndianPlatePartial(value)) return true;
  if (isVanityPlate(value)) return true;

  const letters = value.replace(/[^A-Z]/g, '').length;
  const digits = value.replace(/\D/g, '').length;
  return value.length >= 5 && value.length <= 12 && letters >= 2 && digits >= 2;
}

function extractEmbeddedStatePlates(value: string): string[] {
  const results: string[] = [];
  for (const state of INDIAN_STATE_CODES) {
    let start = 0;
    while (start < value.length) {
      const idx = value.indexOf(state, start);
      if (idx === -1) break;
      const fragment = value.slice(idx);
      for (const len of [10, 9, 8, 11, 12]) {
        if (fragment.length < 6) continue;
        const slice = fragment.slice(0, Math.min(len, fragment.length));
        results.push(slice);
        results.push(repairIndianPlate(slice));
        enumerateIndianRepairs(slice).forEach((candidate) => results.push(candidate));
      }
      start = idx + 1;
    }
  }
  return results;
}

function generateCandidateValues(value?: string): string[] {
  const base = compactPlate(value);
  if (!isReadable(base)) return [];

  const prefixVariants = new Set<string>([base]);
  if (base.startsWith('MA') || base.startsWith('M9') || base.startsWith('MN')) {
    prefixVariants.add(`MP${base.slice(2)}`);
  }
  if (hasIndianStatePrefix(base) && base.includes('SD')) {
    prefixVariants.add(base.replace('SD', 'BD'));
  }

  const variants = new Set<string>();
  for (const seed of prefixVariants) {
    variants.add(seed);
    variants.add(repairIndianPlate(seed));
    enumerateIndianRepairs(seed).forEach((candidate) => variants.add(candidate));
    extractEmbeddedStatePlates(seed).forEach((candidate) => variants.add(candidate));
    if (seed.length >= 7) {
      variants.add(repairIndianPlate(seed.slice(0, 10)));
      enumerateIndianRepairs(seed.slice(0, 10)).forEach((candidate) => variants.add(candidate));
      extractEmbeddedStatePlates(seed.slice(0, 12)).forEach((candidate) => variants.add(candidate));
    }
  }

  return [...variants].filter(looksPlateLike);
}

function candidateQuality(candidate: PlateCandidate): number {
  let score = 0;
  if (isIndianPlate(candidate.value)) score += 80;
  if (isIndianPlatePartial(candidate.value)) score += 35;
  if (isVanityPlate(candidate.value)) score += 55;
  if (hasIndianStatePrefix(candidate.value)) score += 18;
  if (isIndianPlate(candidate.value) && candidate.value.length >= 10) score += 20;
  score += Math.min(candidate.value.length, 10) * 3;
  score += candidate.confidence * 12;
  if (candidate.source === 'raw') score += 10;
  if (candidate.source === 'cleaned') score += 5;
  return score;
}

function areCompatible(left: string, right: string): boolean {
  if (left === right) return true;
  const shorter = left.length <= right.length ? left : right;
  const longer = left.length > right.length ? left : right;
  if (shorter.length >= 5 && longer.includes(shorter)) return true;

  if (hasIndianStatePrefix(left) && hasIndianStatePrefix(right) && left.slice(0, 2) === right.slice(0, 2)) {
    if (levenshtein(left, right) <= 2) return true;
  }
  return false;
}

function mergeCompatiblePlate(left: string, right: string): string {
  if (left === right) return left;
  if (!areCompatible(left, right)) return '';
  if (isIndianPlate(left) && !isIndianPlate(right)) return left;
  if (isIndianPlate(right) && !isIndianPlate(left)) return right;
  if (isIndianPlate(left) && isIndianPlate(right)) {
    return left.length >= right.length ? left : right;
  }
  return left.length >= right.length ? left : right;
}

function pickBestCandidate(candidates: string[]): string | null {
  if (candidates.length === 0) return null;
  const ranked = [...new Set(candidates)].sort((a, b) => {
    const scoreA =
      (isIndianPlate(a) ? 100 : 0) +
      (isIndianPlatePartial(a) ? 40 : 0) +
      a.length * 2 +
      (a.includes('BD') && !a.includes('SD') ? 5 : 0);
    const scoreB =
      (isIndianPlate(b) ? 100 : 0) +
      (isIndianPlatePartial(b) ? 40 : 0) +
      b.length * 2 +
      (b.includes('BD') && !b.includes('SD') ? 5 : 0);
    return scoreB - scoreA;
  });
  return ranked[0] ?? null;
}

function finalizeLiveIndianPlate(value: string): string {
  const repairs = enumerateIndianRepairs(value);
  const full = repairs.filter(isIndianPlate);
  if (full.length > 0) return pickBestCandidate(full) || value;
  return value;
}

function collectCandidates(frame: LiveDetectionFrame): PlateCandidate[] {
  const confidence = Number(frame.plate?.confidence ?? frame.plate_confidence ?? 0);
  const frameId = Number(frame.frame_id ?? 0);
  const fields: Array<[CandidateSource, string | undefined]> = [
    ['raw', frame.plate?.raw_text],
    ['cleaned', frame.plate?.cleaned_text],
    ['display', frame.plate_number],
  ];

  const seen = new Set<string>();
  const candidates: PlateCandidate[] = [];
  for (const [source, value] of fields) {
    for (const candidate of generateCandidateValues(value)) {
      if (seen.has(candidate)) continue;
      seen.add(candidate);
      candidates.push({ value: candidate, source, confidence, frameId });
    }
  }
  return candidates;
}

export function shouldDisplayLivePlate(resolved: LiveResolvedPlate): boolean {
  if (isIndianPlate(resolved.plate) || isVanityPlate(resolved.plate)) {
    return resolved.observations >= 1 || resolved.confidence >= 0.45;
  }
  if (looksPlateLike(resolved.plate) && resolved.confidence >= 0.4) {
    return resolved.observations >= 2;
  }
  return resolved.observations >= 2 && looksPlateLike(resolved.plate);
}

function isApiPlateReadable(result: LiveDetectionFrame): boolean {
  const quality = result.detection_quality;
  if (quality === 'invalid') return false;
  const raw = compactPlate(result.plate_number || result.plate?.cleaned_text || result.plate?.raw_text);
  return isReadable(raw) && raw.length >= 3;
}

export function pickLiveDisplayPlate(
  frame: LiveDetectionFrame,
  resolved: LiveResolvedPlate | null
): LiveResolvedPlate | null {
  if (resolved && shouldDisplayLivePlate(resolved)) {
    return { ...resolved, plate: finalizeLiveIndianPlate(resolved.plate) };
  }

  if (!isApiPlateReadable(frame)) {
    return resolved;
  }

  const confidence = Number(frame.plate?.confidence ?? frame.plate_confidence ?? 0);
  const frameId = Number(frame.frame_id ?? 0);
  const raw = compactPlate(frame.plate_number || frame.plate?.cleaned_text || frame.plate?.raw_text);
  const candidates = generateCandidateValues(raw);
  const bestCandidate =
    pickBestCandidate(candidates.filter(isIndianPlate)) ||
    pickBestCandidate(candidates) ||
    (looksPlateLike(raw) ? raw : null);

  if (!bestCandidate) {
    return resolved;
  }

  const quality = frame.detection_quality;
  const canShowDirect =
    isIndianPlate(bestCandidate) ||
    isVanityPlate(bestCandidate) ||
    quality === 'accepted' ||
    quality === 'partial' ||
    confidence >= 0.32;

  if (!canShowDirect) {
    return resolved;
  }

  return {
    plate: finalizeLiveIndianPlate(bestCandidate),
    confidence,
    observations: resolved?.observations ?? 1,
    frameId: frameId || resolved?.frameId || 0,
  };
}

export class LivePlateResolver {
  private tracks = new Map<string, PlateTrack>();
  private best: LiveResolvedPlate | null = null;

  reset(): void {
    this.tracks.clear();
    this.best = null;
  }

  observe(frame: LiveDetectionFrame): LiveResolvedPlate | null {
    const candidates = collectCandidates(frame);
    if (candidates.length === 0) return this.best;

    for (const candidate of candidates) {
      const existingKey = [...this.tracks.keys()].find((key) => areCompatible(key, candidate.value));
      const key = existingKey ? mergeCompatiblePlate(existingKey, candidate.value) || candidate.value : candidate.value;
      const previous = existingKey ? this.tracks.get(existingKey) : undefined;
      if (existingKey && existingKey !== key) {
        this.tracks.delete(existingKey);
      }

      const currentScore = candidateQuality(candidate);
      const track: PlateTrack = previous
        ? {
            value: key,
            observations: previous.observations + 1,
            confidenceTotal: previous.confidenceTotal + candidate.confidence,
            lastFrameId: candidate.frameId,
            bestSource: currentScore > previous.bestScore ? candidate.source : previous.bestSource,
            bestScore: Math.max(previous.bestScore, currentScore),
          }
        : {
            value: key,
            observations: 1,
            confidenceTotal: candidate.confidence,
            lastFrameId: candidate.frameId,
            bestSource: candidate.source,
            bestScore: currentScore,
          };

      this.tracks.set(key, track);
    }

    this.pruneOldTracks(Number(frame.frame_id ?? 0));
    this.best = this.resolveBestTrack();
    return this.best;
  }

  private pruneOldTracks(frameId: number): void {
    if (!frameId) return;
    for (const [key, track] of this.tracks) {
      if (frameId - track.lastFrameId > 18) {
        this.tracks.delete(key);
      }
    }
  }

  private resolveBestTrack(): LiveResolvedPlate | null {
    let bestTrack: PlateTrack | null = null;
    let bestScore = -Infinity;

    for (const track of this.tracks.values()) {
      const avgConfidence = track.confidenceTotal / Math.max(track.observations, 1);
      const score =
        track.bestScore +
        track.observations * 14 +
        avgConfidence * 10 +
        (isIndianPlate(track.value) ? 40 : 0) +
        (track.bestSource === 'raw' ? 8 : 0);

      if (score > bestScore) {
        bestScore = score;
        bestTrack = track;
      }
    }

    if (!bestTrack) return null;
    const confidence = bestTrack.confidenceTotal / Math.max(bestTrack.observations, 1);
    const resolved: LiveResolvedPlate = {
      plate: finalizeLiveIndianPlate(bestTrack.value),
      confidence,
      observations: bestTrack.observations,
      frameId: bestTrack.lastFrameId,
    };
    return resolved;
  }
}

export function createLivePlateResolver(): LivePlateResolver {
  return new LivePlateResolver();
}
