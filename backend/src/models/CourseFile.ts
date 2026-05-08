import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';
import { User } from './User';
import { Course } from './Course';

interface CourseFileAttributes {
  id: string;
  courseId: string;
  userId: string;
  originalName: string;
  mimeType: string;
  size: number;
  storagePath: string; // relative or absolute path where file is stored
  cloudinaryUrl: string | null;
  cloudinaryPublicId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface CourseFileCreationAttributes extends Optional<CourseFileAttributes, 'id' | 'createdAt' | 'updatedAt' | 'cloudinaryUrl' | 'cloudinaryPublicId'> {}

export class 
CourseFile extends Model<CourseFileAttributes, CourseFileCreationAttributes> implements CourseFileAttributes {
  public id!: string;
  public courseId!: string;
  public userId!: string;
  public originalName!: string;
  public mimeType!: string;
  public size!: number;
  public storagePath!: string;
  public cloudinaryUrl!: string | null;
  public cloudinaryPublicId!: string | null;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

CourseFile.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    courseId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'courses', key: 'id' },
      onDelete: 'CASCADE',
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
    },
    originalName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    mimeType: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    size: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    storagePath: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    cloudinaryUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    cloudinaryPublicId: {
      type: DataTypes.STRING(512),
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
    tableName: 'course_files',
    timestamps: true,
    indexes: [
      { fields: ['courseId'] },
      { fields: ['userId'] },
    ],
  }
);

export default CourseFile;
