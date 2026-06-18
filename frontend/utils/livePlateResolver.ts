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
      const numberLength = body.length - rtoLength - seriesLength;
      if (numberLength !== 4) continue;

      const rtoRaw = body.slice(0, rtoLength);
      const seriesRaw = body.slice(rtoLength, rtoLength + seriesLength);
      const numberRaw = body.slice(rtoLength + seriesLength);
      const rto = [...rtoRaw].map(normalizeDigit).join('');
      const series = [...seriesRaw].map(normalizeLetter).join('');
      const number = [...numberRaw].map(normalizeDigit).join('');
      const repaired = `${state}${rto}${series}${number}`;
      if (isIndianPlate(repaired)) {
        repairs.add(repaired);
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

function looksPlateLike(value: string): boolean {
  if (!isReadable(value)) return false;
  if (isIndianPlate(value)) return true;

  const letters = value.replace(/[^A-Z]/g, '').length;
  const digits = value.replace(/\D/g, '').length;
  return value.length >= 5 && value.length <= 10 && letters >= 2 && digits >= 2;
}

function generateCandidateValues(value?: string): string[] {
  const base = compactPlate(value);
  if (!isReadable(base)) return [];

  const variants = new Set<string>([base, repairIndianPlate(base), ...enumerateIndianRepairs(base)]);
  if (base.length >= 7) {
    variants.add(repairIndianPlate(base.slice(0, 10)));
    enumerateIndianRepairs(base.slice(0, 10)).forEach((candidate) => variants.add(candidate));
  }
  return [...variants].filter(looksPlateLike);
}

function candidateQuality(candidate: PlateCandidate): number {
  let score = 0;
  if (isIndianPlate(candidate.value)) score += 80;
  if (hasIndianStatePrefix(candidate.value)) score += 18;
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
  return shorter.length >= 5 && longer.includes(shorter);
}

function mergeCompatiblePlate(left: string, right: string): string {
  if (left === right) return left;
  if (!areCompatible(left, right)) return '';
  if (isIndianPlate(left) && !isIndianPlate(right)) return left;
  if (isIndianPlate(right) && !isIndianPlate(left)) return right;
  return left.length >= right.length ? left : right;
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
    return {
      plate: bestTrack.value,
      confidence,
      observations: bestTrack.observations,
      frameId: bestTrack.lastFrameId,
    };
  }
}

export function createLivePlateResolver(): LivePlateResolver {
  return new LivePlateResolver();
}
