import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

export interface DevicePushTokenAttributes {
  id: string;
  userId: string;
  token: string;
  platform: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DevicePushTokenCreationAttributes
  extends Optional<DevicePushTokenAttributes, 'id' | 'platform' | 'createdAt' | 'updatedAt'> {}

export class DevicePushToken
  extends Model<DevicePushTokenAttributes, DevicePushTokenCreationAttributes>
  implements DevicePushTokenAttributes
{
  public id!: string;
  public userId!: string;
  public token!: string;
  public platform!: string | null;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

DevicePushToken.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
    },
    token: {
      type: DataTypes.STRING(512),
      allowNull: false,
      unique: true,
    },
    platform: {
      type: DataTypes.STRING(32),
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'device_push_tokens',
    timestamps: true,
    indexes: [{ fields: ['userId'] }],
  }
);
