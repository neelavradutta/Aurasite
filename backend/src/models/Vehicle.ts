import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../utils/database';

interface VehicleAttributes {
  id: number;
  plate_number: string;
  first_detected_timestamp?: Date;
  last_detected_timestamp?: Date | null;
  detection_count: number;
  vehicle_type?: string | null;
  model?: string | null;
  manufacturing_year?: string | null;
  modifications?: string | null;
  engine_number?: string | null;
  chassis_number?: string | null;
  fuel_type?: string | null;
  insurance_status?: string | null;
  registration_date?: Date | null;
  color?: string | null;
  owner_name?: string | null;
  work?: string | null;
  owner_contact?: string | null;
  owner_email?: string | null;
  owner_address?: string | null;
  driving_license?: string | null;
  registration_number?: string | null;
  is_suspicious: boolean;
  status?: string | null;
  flagged_reason?: string | null;
  violation_count: number;
  created_at?: Date;
  updated_at?: Date;
}

type VehicleCreation = Optional<VehicleAttributes, 'id' | 'detection_count' | 'is_suspicious' | 'violation_count'>;

export class Vehicle extends Model<VehicleAttributes, VehicleCreation> implements VehicleAttributes {
  declare id: number;
  declare plate_number: string;
  declare first_detected_timestamp: Date;
  declare last_detected_timestamp: Date | null;
  declare detection_count: number;
  declare vehicle_type: string | null;
  declare model: string | null;
  declare manufacturing_year: string | null;
  declare modifications: string | null;
  declare engine_number: string | null;
  declare chassis_number: string | null;
  declare fuel_type: string | null;
  declare insurance_status: string | null;
  declare registration_date: Date | null;
  declare color: string | null;
  declare owner_name: string | null;
  declare work: string | null;
  declare owner_contact: string | null;
  declare owner_email: string | null;
  declare owner_address: string | null;
  declare driving_license: string | null;
  declare registration_number: string | null;
  declare is_suspicious: boolean;
  declare status: string | null;
  declare flagged_reason: string | null;
  declare violation_count: number;
  declare readonly created_at: Date;
  declare readonly updated_at: Date;
}

Vehicle.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    plate_number: { type: DataTypes.STRING(20), allowNull: false, unique: true },
    first_detected_timestamp: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    last_detected_timestamp: { type: DataTypes.DATE, allowNull: true },
    detection_count: { type: DataTypes.INTEGER, defaultValue: 1 },
    vehicle_type: { type: DataTypes.STRING(50), allowNull: true },
    model: { type: DataTypes.STRING(80), allowNull: true },
    manufacturing_year: { type: DataTypes.STRING(4), allowNull: true },
    modifications: { type: DataTypes.STRING(255), allowNull: true },
    engine_number: { type: DataTypes.STRING(50), allowNull: true },
    chassis_number: { type: DataTypes.STRING(50), allowNull: true },
    fuel_type: { type: DataTypes.STRING(30), allowNull: true },
    insurance_status: { type: DataTypes.STRING(30), allowNull: true },
    registration_date: { type: DataTypes.DATEONLY, allowNull: true },
    color: { type: DataTypes.STRING(30), allowNull: true },
    owner_name: { type: DataTypes.STRING(100), allowNull: true },
    work: { type: DataTypes.STRING(100), allowNull: true },
    owner_contact: { type: DataTypes.STRING(20), allowNull: true },
    owner_email: { type: DataTypes.STRING(120), allowNull: true },
    owner_address: { type: DataTypes.STRING(255), allowNull: true },
    driving_license: { type: DataTypes.STRING(50), allowNull: true },
    registration_number: { type: DataTypes.STRING(30), allowNull: true },
    is_suspicious: { type: DataTypes.BOOLEAN, defaultValue: false },
    status: { type: DataTypes.STRING(20), defaultValue: 'active' },
    flagged_reason: { type: DataTypes.TEXT, allowNull: true },
    violation_count: { type: DataTypes.INTEGER, defaultValue: 0, allowNull: false },
  },
  { sequelize, tableName: 'vehicles', underscored: true }
);

export default Vehicle;
