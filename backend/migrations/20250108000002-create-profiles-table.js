'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('profiles', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false
      },
      userId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      email: {
        type: Sequelize.STRING,
        allowNull: false
      },
      name: {
        type: Sequelize.STRING,
        allowNull: true
      },
      profilePicture: {
        type: Sequelize.STRING,
        allowNull: true
      },
      themeColor: {
        type: Sequelize.STRING,
        allowNull: true,
        defaultValue: '#007bff'
      },
      darkMode: {
        type: Sequelize.BOOLEAN,
        allowNull: true,
        defaultValue: false
      },
      school: {
        type: Sequelize.STRING,
        allowNull: true
      },
      department: {
        type: Sequelize.STRING,
        allowNull: true
      },
      level: {
        type: Sequelize.STRING,
        allowNull: true
      },
      academicYear: {
        type: Sequelize.STRING,
        allowNull: true
      },
      subjects: {
        type: Sequelize.JSON,
        allowNull: true
      },
      bio: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      notificationSettings: {
        type: Sequelize.JSON,
        allowNull: true
      },
      studyGoals: {
        type: Sequelize.JSON,
        allowNull: true
      },
      preferences: {
        type: Sequelize.JSON,
        allowNull: true
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
      }
    });

    // Index automatically created by foreign key constraint
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('profiles');
  }
};
