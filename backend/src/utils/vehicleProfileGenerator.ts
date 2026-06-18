import crypto from 'crypto';

type VehicleProfile = {
  owner_name: string;
  work: string;
  owner_contact: string;
  owner_email: string;
  owner_address: string;
  driving_license: string;
  color: string;
  model: string;
  manufacturing_year: string;
  modifications: string;
  engine_number: string;
  chassis_number: string;
  fuel_type: string;
  insurance_status: string;
  registration_date: Date;
  registration_number: string;
  vehicle_type: string;
};

const FIRST_NAMES = [
  'Arjun', 'Priya', 'Rahul', 'Ananya', 'Vikram', 'Meera', 'Karthik', 'Divya',
  'Sanjay', 'Lakshmi', 'Rohan', 'Neha', 'Aditya', 'Kavya', 'Manoj', 'Pooja',
];

const LAST_NAMES = [
  'Sharma', 'Reddy', 'Iyer', 'Patel', 'Nair', 'Gupta', 'Menon', 'Rao',
  'Singh', 'Krishnan', 'Desai', 'Pillai', 'Verma', 'Bhat', 'Chopra', 'Shetty',
];

const WORKPLACES = [
  'Infosys Ltd', 'Wipro Technologies', 'TCS Digital', 'Flipkart Logistics',
  'Biocon Research', 'HDFC Bank', 'Apollo Hospitals', 'Indian Railways',
  'Reliance Retail', 'Accenture India', 'Tech Mahindra', 'Cognizant',
];

const STREETS = [
  'MG Road', 'Brigade Road', 'Indiranagar 100ft Road', 'Koramangala 5th Block',
  'HSR Layout Sector 2', 'Whitefield Main Road', 'Jayanagar 4th Block',
  'Electronic City Phase 1', 'Marathahalli Outer Ring Road', 'BTM Layout 2nd Stage',
];

const CITIES = [
  'Bengaluru, Karnataka', 'Chennai, Tamil Nadu', 'Hyderabad, Telangana',
  'Pune, Maharashtra', 'Mysuru, Karnataka', 'Mangaluru, Karnataka',
];

const COLORS = ['White', 'Silver', 'Black', 'Blue', 'Red', 'Grey', 'Brown', 'Green'];
const MODELS = [
  'Swift Dzire', 'Hyundai Creta', 'Honda City', 'Toyota Innova', 'Mahindra XUV700',
  'Tata Nexon', 'Kia Seltos', 'Maruti Baleno', 'Hyundai i20', 'Renault Kiger',
];
const MODIFICATIONS = [
  'Stock', 'Alloy wheels', 'Tinted glass', 'Roof carrier', 'Bull bar',
  'LED headlamps', 'Custom exhaust', 'None',
];
const FUEL_TYPES = ['Petrol', 'Diesel', 'CNG', 'Electric', 'Hybrid'];
const INSURANCE_STATUSES = ['Active', 'Active', 'Active', 'Expiring Soon', 'Renewed'];
const VEHICLE_TYPES = ['car', 'car', 'car', 'suv', 'sedan', 'hatchback'];

const REJECTED_PLATES = new Set(['UNREADABLE', 'UNKNOWN', 'REJECTED']);

export function isUnreadablePlate(plate?: string | null): boolean {
  const key = (plate || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!key || REJECTED_PLATES.has(key)) return true;
  return key.startsWith('UNREADABLE');
}

export function shouldGenerateVehicleProfile(
  plateKey: string,
  plateNumber: string,
  quality: string
): boolean {
  if (quality === 'unreadable' || quality === 'invalid') return false;
  if (isUnreadablePlate(plateKey) || isUnreadablePlate(plateNumber)) return false;
  return true;
}

function seedFromPlate(plate: string): number {
  const normalized = plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const digest = crypto.createHash('sha256').update(normalized).digest();
  return digest.readUInt32BE(0);
}

function pick<T>(items: readonly T[], seed: number, slot: number): T {
  return items[(seed + slot * 97) % items.length];
}

function digits(seed: number, slot: number, length: number): string {
  let value = seed + slot * 7919;
  let out = '';
  for (let i = 0; i < length; i += 1) {
    value = (value * 1103515245 + 12345) >>> 0;
    out += String(value % 10);
  }
  return out;
}

function platePrefix(plate: string): string {
  const match = plate.toUpperCase().match(/^([A-Z]{2})/);
  return match?.[1] || 'KA';
}

export function generateVehicleProfile(plateNumber: string): VehicleProfile {
  const seed = seedFromPlate(plateNumber);
  const prefix = platePrefix(plateNumber);
  const first = pick(FIRST_NAMES, seed, 1);
  const last = pick(LAST_NAMES, seed, 2);
  const ownerName = `${first} ${last}`;
  const emailSlug = `${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, '');
  const year = 2008 + (seed % 14);
  const month = 1 + (seed % 12);
  const day = 1 + (seed % 28);

  return {
    owner_name: ownerName,
    work: pick(WORKPLACES, seed, 3),
    owner_contact: `+91 ${9}${digits(seed, 4, 9)}`,
    owner_email: `${emailSlug}${digits(seed, 5, 2)}@gmail.com`,
    owner_address: `${10 + (seed % 180)}, ${pick(STREETS, seed, 6)}, ${pick(CITIES, seed, 7)}`,
    driving_license: `${prefix}${digits(seed, 8, 2)} ${year}${digits(seed, 9, 7)}`,
    color: pick(COLORS, seed, 10),
    model: pick(MODELS, seed, 11),
    manufacturing_year: String(year),
    modifications: pick(MODIFICATIONS, seed, 12),
    engine_number: `ENG${prefix}${digits(seed, 13, 8)}`,
    chassis_number: `CH${prefix}${digits(seed, 14, 10)}`,
    fuel_type: pick(FUEL_TYPES, seed, 15),
    insurance_status: pick(INSURANCE_STATUSES, seed, 16),
    registration_date: new Date(year, month - 1, day),
    registration_number: plateNumber.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20) || `${prefix}${digits(seed, 17, 6)}`,
    vehicle_type: pick(VEHICLE_TYPES, seed, 18),
  };
}

const PROFILE_KEYS = [
  'owner_name',
  'work',
  'owner_contact',
  'owner_email',
  'owner_address',
  'driving_license',
  'color',
  'model',
  'manufacturing_year',
  'modifications',
  'engine_number',
  'chassis_number',
  'fuel_type',
  'insurance_status',
  'registration_date',
  'registration_number',
] as const;

type ProfileKey = (typeof PROFILE_KEYS)[number];

export function getMissingProfileFields(
  plateNumber: string,
  vehicle: Record<string, unknown>
): Partial<VehicleProfile> {
  if (isUnreadablePlate(plateNumber)) return {};

  const generated = generateVehicleProfile(plateNumber);
  const patch: Partial<VehicleProfile> = {};

  for (const key of PROFILE_KEYS) {
    const current = vehicle[key];
    if (current === null || current === undefined || current === '') {
      patch[key as ProfileKey] = generated[key as ProfileKey] as never;
    }
  }

  if (!vehicle.vehicle_type || vehicle.vehicle_type === 'unknown') {
    patch.vehicle_type = generated.vehicle_type;
  }

  return patch;
}

export function clearVehicleProfileFields(): Record<ProfileKey, null> {
  const patch = {} as Record<ProfileKey, null>;
  for (const key of PROFILE_KEYS) {
    patch[key] = null;
  }
  return patch;
}
