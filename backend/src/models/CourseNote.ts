import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';
import { User } from './User';
import { Course } from './Course';

interface CourseNoteAttributes {
  id: string;
  courseId: string;
  userId: string;
  title?: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

interface CourseNoteCreationAttributes extends Optional<CourseNoteAttributes, 'id' | 'createdAt' | 'updatedAt' | 'title'> {}

export class CourseNote extends Model<CourseNoteAttributes, CourseNoteCreationAttributes> implements CourseNoteAttributes {
  public id!: string;
  public courseId!: string;
  public userId!: string;
  public title?: string;
  public content!: string;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

CourseNote.init(
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
    title: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
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
    tableName: 'course_notes',
    timestamps: true,
    indexes: [
      { fields: ['courseId'] },
      { fields: ['userId'] },
    ],
  }
);

export default CourseNote;
