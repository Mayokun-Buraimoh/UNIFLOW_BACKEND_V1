import { DataTypes, Model } from 'sequelize'
import { sequelize } from '../config/database'
import { IEvent, IEventCreationAttributes } from '../types'

class Event extends Model<IEvent, IEventCreationAttributes> implements IEvent {
  public id!: string
  public userId!: string
  public title!: string
  public time!: string
  public date!: string
  public priority!: 'low' | 'medium' | 'critical'
  public readonly createdAt!: Date
  public readonly updatedAt!: Date
}

Event.init(
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
      type: DataTypes.STRING(200),
      allowNull: false,
    },
    time: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    date: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    priority: {
      type: DataTypes.ENUM('low', 'medium', 'critical'),
      defaultValue: 'low',
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
    tableName: 'events',
    timestamps: true,
    indexes: [
      { fields: ['userId'] },
      { fields: ['date'] },
    ],
  }
)

export { Event }
