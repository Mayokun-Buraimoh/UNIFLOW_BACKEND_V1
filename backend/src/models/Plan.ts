import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';

export interface PlanObjective {
  id: string;
  title: string;
  completed: boolean;
  completedAt?: string;
  date?: string;
  frequency?: 'daily' | 'weekly';
  goalId?: string;
}

interface PlanAttributes {
  id: string;
  userId: string;
  title: string;
  isCustom: boolean;
  bannerImage: string | null;
  targets: PlanObjective[];
  tasks: PlanObjective[];
  progress: number;
  createdAt: Date;
  updatedAt: Date;
}

interface PlanCreationAttributes extends Optional<
  PlanAttributes,
  'id' | 'isCustom' | 'bannerImage' | 'targets' | 'tasks' | 'progress' | 'createdAt' | 'updatedAt'
> {}

export class Plan extends Model<PlanAttributes, PlanCreationAttributes> implements PlanAttributes {
  public id!: string;
  public userId!: string;
  public title!: string;
  public isCustom!: boolean;
  public bannerImage!: string | null;
  public targets!: PlanObjective[];
  public tasks!: PlanObjective[];
  public progress!: number;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Plan.init(
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
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    isCustom: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    bannerImage: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    targets: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    tasks: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    progress: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
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
    tableName: 'plans',
    timestamps: true,
    indexes: [{ fields: ['userId'] }],
  }
);
