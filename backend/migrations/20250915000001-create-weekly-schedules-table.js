"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("weekly_schedules", {
      id: {
        type: Sequelize.DataTypes.UUID,
        defaultValue: Sequelize.DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      userId: {
        type: Sequelize.DataTypes.UUID,
        allowNull: false,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      data: {
        type: Sequelize.DataTypes.JSON,
        allowNull: false,
        defaultValue: {},
      },
      createdAt: {
        type: Sequelize.DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW"),
      },
      updatedAt: {
        type: Sequelize.DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW"),
      },
    });

    await queryInterface.addIndex("weekly_schedules", ["userId"], {
      unique: true,
      name: "weekly_schedules_user_unique",
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("weekly_schedules");
  },
};


