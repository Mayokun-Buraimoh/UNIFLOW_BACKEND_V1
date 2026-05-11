import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';
import { User } from './User';

interface MoodleConnectionAttributes {
  id: string;
  userId: string;
  moodleUrl: string;
  webServiceToken?: string;
  isActive: boolean;
  lastSyncedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface MoodleConnectionCreationAttributes extends Optional<MoodleConnectionAttributes, 'id' | 'isActive' | 'createdAt' | 'updatedAt'> {}

export class MoodleConnection extends Model<MoodleConnectionAttributes, MoodleConnectionCreationAttributes> implements MoodleConnectionAttributes {
  public id!: string;
  public userId!: string;
  public moodleUrl!: string;
  public webServiceToken?: string;
  public isActive!: boolean;
  public lastSyncedAt?: Date;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

MoodleConnection.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id',
      },
      onDelete: 'CASCADE',
      unique: true, // One connection per user
    },
    moodleUrl: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        isUrl: true,
      },
    },
    webServiceToken: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    lastSyncedAt: {
      type: DataTypes.DATE,
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
    tableName: 'moodle_connections',
    timestamps: true,
    indexes: [
      {
        fields: ['userId'],
      },
    ],
  }
);

// Define associations
MoodleConnection.belongsTo(User, { foreignKey: 'userId' });
