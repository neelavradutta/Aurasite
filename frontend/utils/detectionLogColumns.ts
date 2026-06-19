import { Detection } from '@/types/detection';
import {
  formatRegistrationDate,
  formatTimestamp,
  getAddress,
  getOwnerName,
  getPlateDisplay,
  getVehicleColour,
  getVehicleType,
  getViolations,
} from './detectionDisplay';

export type DetectionLogColumn = {
  key: string;
  label: string;
  getValue: (detection: Detection) => string;
};

/** Columns shown in the detection log table — also exported first in CSV. */
export const DETECTION_LOG_COLUMNS: readonly DetectionLogColumn[] = [
  { key: 'plate', label: 'Plate', getValue: (d) => getPlateDisplay(d.plate_number) },
  { key: 'timestamp', label: 'Timestamp', getValue: (d) => formatTimestamp(d.detection_timestamp) },
  { key: 'vehicleType', label: 'Vehicle Type', getValue: (d) => getVehicleType(d) },
  { key: 'colour', label: 'Colour', getValue: (d) => getVehicleColour(d) },
  { key: 'owner', label: 'Owner', getValue: (d) => getOwnerName(d) },
  { key: 'address', label: 'Address', getValue: (d) => getAddress(d) },
  { key: 'registrationDate', label: 'Registration Date', getValue: (d) => formatRegistrationDate(d) },
  { key: 'violations', label: 'Violations', getValue: (d) => getViolations(d) },
];
