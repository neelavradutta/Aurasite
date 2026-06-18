import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../utils/database';

interface CameraAttributes {
  id: number;
  camera_code: string;
  name: string;
  video_source: string;
  latitude?: number | null;
  longitude?: number | null;
  place_name?: string | null;
  gps_updated_at?: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

type CameraCreation = Optional<CameraAttributes, 'id'>;

export class Camera extends Model<CameraAttributes, CameraCreation> implements CameraAttributes {
  declare id: number;
  declare camera_code: string;
  declare name: string;
  declare video_source: string;
  declare latitude: number | null;
  declare longitude: number | null;
  declare place_name: string | null;
  declare gps_updated_at: Date | null;
  declare readonly created_at: Date;
  declare readonly updated_at: Date;
}

Camera.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    camera_code: { type: DataTypes.STRING(20), allowNull: false, unique: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
    video_source: { type: DataTypes.STRING(255), allowNull: false, unique: true },
    latitude: { type: DataTypes.DECIMAL(10, 7), allowNull: true },
    longitude: { type: DataTypes.DECIMAL(10, 7), allowNull: true },
    place_name: { type: DataTypes.STRING(255), allowNull: true },
    gps_updated_at: { type: DataTypes.DATE, allowNull: true },
  },
  { sequelize, tableName: 'cameras', underscored: true }
);

export default Camera;
