import { DataTypes, Model } from 'sequelize'
import { sequelize } from '../config/database'
import { ITask, ITaskCreationAttributes } from '../types'

class Task extends Model<ITask, ITaskCreationAttributes> implements ITask {
  public id!: string
  public userId!: string
  public title!: string
  public description?: string
  public priority!: 'low' | 'medium' | 'critical'
  public status!: 'pending' | 'in_progress' | 'completed'
  public dueDate?: Date
  public completedAt?: Date
  public readonly createdAt!: Date
  public readonly updatedAt!: Date
}

Task.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id',
      },
    },
    title: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    priority: {
      type: DataTypes.ENUM('low', 'medium', 'critical'),
      defaultValue: 'low',
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('pending', 'in_progress', 'completed'),
      defaultValue: 'pending',
      allowNull: false,
    },
    dueDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    completedAt: {
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
    tableName: 'tasks',
    timestamps: true,
  }
)

// Associations will be defined in models/index.ts

export { Task }