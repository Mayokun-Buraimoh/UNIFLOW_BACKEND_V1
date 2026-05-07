/**
 * Migration: create course_notes table
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('course_notes', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('(UUID())'),
        allowNull: false,
        primaryKey: true,
      },
      courseId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'courses', key: 'id' },
        onDelete: 'CASCADE',
      },
      userId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      title: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      content: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });
    await queryInterface.addIndex('course_notes', ['courseId']);
    await queryInterface.addIndex('course_notes', ['userId']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('course_notes');
  }
};
