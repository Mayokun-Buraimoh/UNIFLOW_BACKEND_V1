import 'dotenv/config';
import { sequelize } from './src/config/database';
import { User, Profile, Task, WeeklySchedule, Course, MoodleConnection } from './src/models';

async function viewDatabase() {
  try {
    // Test connection
    await sequelize.authenticate();
    console.log('✅ Connected to database successfully!\n');

    // 1. Users
    console.log('='.repeat(60));
    console.log('📊 USERS TABLE');
    console.log('='.repeat(60));
    const users = await User.findAll({
      attributes: ['id', 'email', 'name', 'googleId', 'avatar', 'createdAt'],
      order: [['createdAt', 'DESC']],
    });
    console.log(`Total Users: ${users.length}`);
    if (users.length > 0) {
      console.table(users.map(u => ({
        id: u.id.substring(0, 8) + '...',
        email: u.email,
        name: u.name || 'N/A',
        googleId: u.googleId ? 'Yes' : 'No',
        createdAt: u.createdAt.toISOString().split('T')[0],
      })));
    }
    console.log('');

    // 2. Profiles
    console.log('='.repeat(60));
    console.log('👤 PROFILES TABLE');
    console.log('='.repeat(60));
    const profiles = await Profile.findAll({
      order: [['createdAt', 'DESC']],
    });
    console.log(`Total Profiles: ${profiles.length}`);
    if (profiles.length > 0) {
      console.table(profiles.map(p => ({
        id: p.id.substring(0, 8) + '...',
        email: p.email,
        name: p.name || 'N/A',
        school: p.school || 'N/A',
        department: p.department || 'N/A',
        darkMode: p.darkMode ? 'Yes' : 'No',
      })));
    }
    console.log('');

    // 3. Tasks
    console.log('='.repeat(60));
    console.log('✅ TASKS TABLE');
    console.log('='.repeat(60));
    const tasks = await Task.findAll({
      attributes: ['id', 'userId', 'title', 'description', 'priority', 'status', 'dueDate', 'completedAt', 'createdAt'],
      order: [['createdAt', 'DESC']],
      limit: 20,
    });
    console.log(`Total Tasks: ${await Task.count()}`);
    
    // Task status summary
    const taskStatusSummary = await Task.findAll({
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        'status'
      ],
      group: ['status'],
      raw: true,
    });
    console.log('\nTask Status Summary:');
    taskStatusSummary.forEach((item: any) => {
      console.log(`  ${item.status}: ${item.count}`);
    });

    if (tasks.length > 0) {
      console.log('\nRecent Tasks (last 20):');
      console.table(tasks.map(t => ({
        id: t.id.substring(0, 8) + '...',
        title: t.title.substring(0, 30) + (t.title.length > 30 ? '...' : ''),
        status: t.status,
        priority: t.priority,
        dueDate: t.dueDate ? t.dueDate.toISOString().split('T')[0] : 'N/A',
        completed: t.completedAt ? 'Yes' : 'No',
      })));
    }
    console.log('');

    // 4. Weekly Schedules
    console.log('='.repeat(60));
    console.log('📅 WEEKLY SCHEDULES TABLE');
    console.log('='.repeat(60));
    const schedules = await WeeklySchedule.findAll({
      order: [['createdAt', 'DESC']],
    });
    console.log(`Total Schedules: ${schedules.length}`);
    if (schedules.length > 0) {
      console.table(schedules.map(s => ({
        id: s.id.substring(0, 8) + '...',
        userId: s.userId.substring(0, 8) + '...',
        dataKeys: Object.keys(s.data || {}).length,
        updatedAt: s.updatedAt.toISOString().split('T')[0],
      })));
    }
    console.log('');

    // 5. Courses
    console.log('='.repeat(60));
    console.log('📚 COURSES TABLE');
    console.log('='.repeat(60));
    const courses = await Course.findAll({
      attributes: ['id', 'userId', 'code', 'name', 'moodleCourseId', 'visible', 'createdAt'],
      order: [['createdAt', 'DESC']],
    });
    console.log(`Total Courses: ${courses.length}`);
    if (courses.length > 0) {
      console.table(courses.map(c => ({
        id: c.id.substring(0, 8) + '...',
        code: c.code,
        name: c.name.substring(0, 30) + (c.name.length > 30 ? '...' : ''),
        moodleId: c.moodleCourseId || 'N/A',
        visible: c.visible ? 'Yes' : 'No',
      })));
    }
    console.log('');

    // 6. Moodle Connections
    console.log('='.repeat(60));
    console.log('🔗 MOODLE CONNECTIONS TABLE');
    console.log('='.repeat(60));
    const moodleConnections = await MoodleConnection.findAll({
      order: [['createdAt', 'DESC']],
    });
    console.log(`Total Moodle Connections: ${moodleConnections.length}`);
    if (moodleConnections.length > 0) {
      console.table(moodleConnections.map(m => ({
        id: m.id.substring(0, 8) + '...',
        userId: m.userId.substring(0, 8) + '...',
        moodleUrl: m.moodleUrl.substring(0, 40) + (m.moodleUrl.length > 40 ? '...' : ''),
        isActive: m.isActive ? 'Yes' : 'No',
        lastSynced: m.lastSyncedAt ? m.lastSyncedAt.toISOString().split('T')[0] : 'Never',
      })));
    }
    console.log('');

    // 7. Summary Statistics
    console.log('='.repeat(60));
    console.log('📈 DATABASE SUMMARY');
    console.log('='.repeat(60));
    const summary = {
      'Total Users': await User.count(),
      'Total Profiles': await Profile.count(),
      'Total Tasks': await Task.count(),
      'Completed Tasks': await Task.count({ where: { status: 'completed' } }),
      'Pending Tasks': await Task.count({ where: { status: 'pending' } }),
      'In Progress Tasks': await Task.count({ where: { status: 'in_progress' } }),
      'Total Schedules': await WeeklySchedule.count(),
      'Total Courses': await Course.count(),
      'Total Moodle Connections': await MoodleConnection.count(),
    };
    console.table(summary);

    // 8. Users with Profiles
    console.log('='.repeat(60));
    console.log('👥 USERS WITH PROFILES');
    console.log('='.repeat(60));
    const usersWithProfiles = await User.findAll({
      include: [{
        model: Profile,
        as: 'profile',
        required: false,
      }],
      order: [['createdAt', 'DESC']],
    });
    if (usersWithProfiles.length > 0) {
      const profileData = usersWithProfiles.map((u: any) => ({
        email: u.email,
        name: u.name || 'N/A',
        hasProfile: u.profile ? 'Yes' : 'No',
        school: u.profile?.school || 'N/A',
        department: u.profile?.department || 'N/A',
      }));
      console.table(profileData);
    }

    console.log('\n✅ Database view completed!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error viewing database:', error);
    process.exit(1);
  }
}

viewDatabase();
