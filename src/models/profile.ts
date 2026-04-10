import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

interface ProfileAttributes {
  id: string;
  userId: string;
  email: string;
  name?: string;
  profilePicture?: string;
  themeColor?: string;
  darkMode?: boolean;
  school?: string;
  department?: string;
  level?: string;
  academicYear?: string;
  subjects?: any;
  bio?: string;
  notificationSettings?: any;
  studyGoals?: any;
  preferences?: any;
  createdAt: Date;
  updatedAt: Date;
}

interface ProfileCreationAttributes extends Optional<ProfileAttributes, 'id' | 'createdAt' | 'updatedAt'> {}

export class Profile extends Model<ProfileAttributes, ProfileCreationAttributes> implements ProfileAttributes {
  public id!: string;
  public userId!: string;
  public email!: string;
  public name?: string;
  public profilePicture?: string;
  public themeColor?: string;
  public darkMode?: boolean;
  public school?: string;
  public department?: string;
  public level?: string;
  public academicYear?: string;
  public subjects?: any;
  public bio?: string;
  public notificationSettings?: any;
  public studyGoals?: any;
  public preferences?: any;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Profile.init(
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
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    profilePicture: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    themeColor: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: '#007bff',
    },
    darkMode: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false,
    },
    school: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    department: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    level: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    academicYear: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    subjects: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    bio: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    notificationSettings: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    studyGoals: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    preferences: {
      type: DataTypes.JSON,
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
    tableName: 'profiles',
    timestamps: true,
  }
);
