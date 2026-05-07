import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';
import { User } from './User';

interface CourseAttributes {
  id: string;
  userId: string;
  moodleCourseId?: number;
  code: string;
  name: string;
  shortName?: string;
  summary?: string;
  categoryId?: number;
  startDate?: Date;
  endDate?: Date;
  visible?: boolean;
  courseImage?: string;
  color?: string;
  iconColor?: string;
  fileIcon?: string;
  week?: number;
  lastOpened?: Date;
  moodleData?: any; // Store raw Moodle course data
  createdAt: Date;
  updatedAt: Date;
}

interface CourseCreationAttributes extends Optional<CourseAttributes, 'id' | 'createdAt' | 'updatedAt' | 'week' | 'visible' | 'lastOpened'> {}

export class Course extends Model<CourseAttributes, CourseCreationAttributes> implements CourseAttributes {
  public id!: string;
  public userId!: string;
  public moodleCourseId?: number;
  public code!: string;
  public name!: string;
  public shortName?: string;
  public summary?: string;
  public categoryId?: number;
  public startDate?: Date;
  public endDate?: Date;
  public visible?: boolean;
  public courseImage?: string;
  public color?: string;
  public iconColor?: string;
  public fileIcon?: string;
  public week?: number;
  public lastOpened?: Date;
  public moodleData?: any;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Course.init(
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
    },
    moodleCourseId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    code: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    shortName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    summary: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    categoryId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    startDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    endDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    visible: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: true,
    },
    courseImage: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    color: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    iconColor: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    fileIcon: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: '/assets/icons/course-icon.svg',
    },
    week: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 1,
    },
    lastOpened: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    moodleData: {
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
    tableName: 'courses',
    timestamps: true,
    indexes: [
      {
        fields: ['userId'],
      },
      {
        fields: ['moodleCourseId'],
      },
    ],
  }
);

// Define associations
Course.belongsTo(User, { foreignKey: 'userId' });
