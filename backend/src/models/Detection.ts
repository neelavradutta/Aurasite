import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../utils/database';
import Vehicle from './Vehicle';

interface DetectionAttributes {
  id: number;
  vehicle_id?: number | null;
  detection_timestamp: Date;
  plate_number?: string | null;
  plate_confidence?: number | null;
  vehicle_confidence?: number | null;
  frame_number?: number | null;
  bounding_box?: object | null;
  plate_bbox?: object | null;
  vehicle_type?: string | null;
  vehicle_color?: string | null;
  video_source?: string | null;
  frame_image_path?: string | null;
  is_repeat_detection: boolean;
  detection_quality?: string | null;
  track_id?: string | null;
  created_at?: Date;
}

type DetectionCreation = Optional<DetectionAttributes, 'id' | 'is_repeat_detection'>;

export class Detection extends Model<DetectionAttributes, DetectionCreation> implements DetectionAttributes {
  declare id: number;
  declare vehicle_id: number | null;
  declare detection_timestamp: Date;
  declare plate_number: string | null;
  declare plate_confidence: number | null;
  declare vehicle_confidence: number | null;
  declare frame_number: number | null;
  declare bounding_box: object | null;
  declare plate_bbox: object | null;
  declare vehicle_type: string | null;
  declare vehicle_color: string | null;
  declare video_source: string | null;
  declare frame_image_path: string | null;
  declare is_repeat_detection: boolean;
  declare detection_quality: string | null;
  declare track_id: string | null;
  declare readonly created_at: Date;
}

Detection.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    vehicle_id: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'vehicles', key: 'id' } },
    detection_timestamp: { type: DataTypes.DATE, allowNull: false },
    plate_number: { type: DataTypes.STRING(20), allowNull: true },
    plate_confidence: { type: DataTypes.FLOAT, allowNull: true },
    vehicle_confidence: { type: DataTypes.FLOAT, allowNull: true },
    frame_number: { type: DataTypes.INTEGER, allowNull: true },
    bounding_box: { type: DataTypes.JSON, allowNull: true },
    plate_bbox: { type: DataTypes.JSON, allowNull: true },
    vehicle_type: { type: DataTypes.STRING(50), allowNull: true },
    vehicle_color: { type: DataTypes.STRING(30), allowNull: true },
    video_source: { type: DataTypes.STRING(255), allowNull: true },
    frame_image_path: { type: DataTypes.STRING(255), allowNull: true },
    is_repeat_detection: { type: DataTypes.BOOLEAN, defaultValue: false },
    detection_quality: { type: DataTypes.STRING(50), allowNull: true },
    track_id: { type: DataTypes.STRING(50), allowNull: true },
  },
  { sequelize, tableName: 'detections', underscored: true }
);

Vehicle.hasMany(Detection, { foreignKey: 'vehicle_id', as: 'detections' });
Detection.belongsTo(Vehicle, { foreignKey: 'vehicle_id', as: 'vehicle' });

export default Detection;
