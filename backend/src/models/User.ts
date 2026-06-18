import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../utils/database';

interface UserAttributes {
  id: number;
  email: string;
  password_hash: string;
  name: string;
  role: 'admin' | 'operator' | 'viewer';
  is_active: boolean;
  created_at?: Date;
  updated_at?: Date;
}

type UserCreation = Optional<UserAttributes, 'id' | 'role' | 'is_active'>;

export class User extends Model<UserAttributes, UserCreation> implements UserAttributes {
  declare id: number;
  declare email: string;
  declare password_hash: string;
  declare name: string;
  declare role: UserAttributes['role'];
  declare is_active: boolean;
  declare readonly created_at: Date;
  declare readonly updated_at: Date;
}

User.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    email: { type: DataTypes.STRING(255), allowNull: false, unique: true },
    password_hash: { type: DataTypes.STRING(255), allowNull: false },
    name: { type: DataTypes.STRING(100), allowNull: false },
    role: {
      type: DataTypes.ENUM('admin', 'operator', 'viewer'),
      defaultValue: 'operator',
    },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  },
  { sequelize, tableName: 'users', underscored: true }
);

export default User;
