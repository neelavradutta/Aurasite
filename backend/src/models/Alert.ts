import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../utils/database';
import Detection from './Detection';
import Vehicle from './Vehicle';

interface AlertAttributes {
  id: number;
  detection_id?: number | null;
  vehicle_id?: number | null;
  alert_type: 'suspicious' | 'repeat' | 'low_confidence' | 'wanted' | 'manual';
  alert_message?: string | null;
  severity: 'low' | 'medium' | 'high' | 'critical';
  created_at?: Date;
  resolved_at?: Date | null;
  resolved_by?: string | null;
}

type AlertCreation = Optional<AlertAttributes, 'id' | 'severity'>;

export class Alert extends Model<AlertAttributes, AlertCreation> implements AlertAttributes {
  declare id: number;
  declare detection_id: number | null;
  declare vehicle_id: number | null;
  declare alert_type: AlertAttributes['alert_type'];
  declare alert_message: string | null;
  declare severity: AlertAttributes['severity'];
  declare readonly created_at: Date;
  declare resolved_at: Date | null;
  declare resolved_by: string | null;
}

Alert.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    detection_id: { type: DataTypes.INTEGER, allowNull: true },
    vehicle_id: { type: DataTypes.INTEGER, allowNull: true },
    alert_type: {
      type: DataTypes.ENUM('suspicious', 'repeat', 'low_confidence', 'wanted', 'manual'),
      allowNull: false,
    },
    alert_message: { type: DataTypes.TEXT, allowNull: true },
    severity: {
      type: DataTypes.ENUM('low', 'medium', 'high', 'critical'),
      defaultValue: 'medium',
    },
    resolved_at: { type: DataTypes.DATE, allowNull: true },
    resolved_by: { type: DataTypes.STRING(100), allowNull: true },
  },
  { sequelize, tableName: 'alerts', underscored: true }
);

Alert.belongsTo(Detection, { foreignKey: 'detection_id', as: 'detection' });
Alert.belongsTo(Vehicle, { foreignKey: 'vehicle_id', as: 'vehicle' });

export default Alert;
