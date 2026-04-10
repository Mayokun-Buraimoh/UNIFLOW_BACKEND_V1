import { DataTypes, Model } from 'sequelize'
import { sequelize } from '../config/database'
import { IWeeklySchedule, IWeeklyScheduleCreationAttributes } from '../types'

class WeeklySchedule extends Model<IWeeklySchedule, IWeeklyScheduleCreationAttributes> implements IWeeklySchedule {
  public id!: string
  public userId!: string
  public data!: Record<string, string[]>
  public readonly createdAt!: Date
  public readonly updatedAt!: Date
}

WeeklySchedule.init(
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
    data: {
      // Store the full grid as JSON { Mon: [...], ... }
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {},
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
    tableName: 'weekly_schedules',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['userId'] },
    ],
  }
)

export { WeeklySchedule }


