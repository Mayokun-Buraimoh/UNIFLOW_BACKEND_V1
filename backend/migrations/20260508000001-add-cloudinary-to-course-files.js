/**
 * Add Cloudinary fields for remote PDF storage (Render / multi-instance).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('course_files', 'cloudinaryUrl', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    await queryInterface.addColumn('course_files', 'cloudinaryPublicId', {
      type: Sequelize.STRING(512),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('course_files', 'cloudinaryPublicId');
    await queryInterface.removeColumn('course_files', 'cloudinaryUrl');
  },
};
