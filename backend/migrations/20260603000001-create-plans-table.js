'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('plans', {
      id: {
        type: Sequelize.DataTypes.UUID,
        defaultValue: Sequelize.DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      userId: {
        type: Sequelize.DataTypes.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      title: {
        type: Sequelize.DataTypes.STRING,
        allowNull: false,
      },
      isCustom: {
        type: Sequelize.DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      bannerImage: {
        type: Sequelize.DataTypes.STRING,
        allowNull: true,
      },
      targets: {
        type: Sequelize.DataTypes.JSON,
        allowNull: false,
        defaultValue: [],
      },
      tasks: {
        type: Sequelize.DataTypes.JSON,
        allowNull: false,
        defaultValue: [],
      },
      progress: {
        type: Sequelize.DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      createdAt: {
        type: Sequelize.DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
      updatedAt: {
        type: Sequelize.DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
    });

    await queryInterface.addIndex('plans', ['userId'], {
      name: 'plans_user_id',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('plans');
  },
};
