import axios from 'axios';
import { Course } from '../models/Course';

interface MoodleCourse {
  id: number;
  shortname: string;
  fullname: string;
  displayname?: string;
  summary?: string;
  categoryid?: number;
  startdate?: number;
  enddate?: number;
  visible?: number;
  courseimage?: string;
  [key: string]: any;
}

interface MoodleApiResponse {
  courses?: MoodleCourse[];
  errorcode?: string;
  message?: string;
  exception?: string;
}

/**
 * Service to interact with Moodle REST API
 */
export class MoodleService {
  /**
   * Fetch courses from Moodle using web service token
   */
  static async fetchCourses(moodleUrl: string, token: string): Promise<MoodleCourse[]> {
    try {
      // Normalize URL (remove trailing slash, ensure it has protocol)
      let normalizedUrl = moodleUrl.trim();
      if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
        normalizedUrl = 'https://' + normalizedUrl;
      }
      normalizedUrl = normalizedUrl.replace(/\/$/, '');

      const apiUrl = `${normalizedUrl}/webservice/rest/server.php`;
      
      const response = await axios.get<MoodleApiResponse>(apiUrl, {
        params: {
          wstoken: token,
          wsfunction: 'core_course_get_courses',
          moodlewsrestformat: 'json',
        },
        timeout: 10000, // 10 second timeout
      });

      // Check for Moodle API errors
      if (response.data.errorcode || response.data.exception) {
        throw new Error(
          response.data.message || 
          response.data.exception || 
          'Failed to fetch courses from Moodle'
        );
      }

      // Filter out site course (id=1) and return only user courses
      const courses = (response.data.courses || []).filter(
        (course: MoodleCourse) => course.id !== 1 && course.visible !== 0
      );

      return courses;
    } catch (error: any) {
      if (error.response) {
        // Moodle API error
        throw new Error(
          error.response.data?.message || 
          `Moodle API error: ${error.response.status}`
        );
      } else if (error.request) {
        // Network error
        throw new Error(
          'Unable to reach Moodle server. Please check the URL and your internet connection.'
        );
      } else {
        // Other error
        throw new Error(error.message || 'Failed to fetch courses from Moodle');
      }
    }
  }

  /**
   * Transform Moodle course to our Course format
   */
  static transformMoodleCourse(moodleCourse: MoodleCourse, userId: string): Partial<Course> {
    // Extract course code from shortname (e.g., "CS101" or "ENG-101")
    const code = moodleCourse.shortname || moodleCourse.id.toString();
    
    // Generate a color based on course name/code for visual distinction
    const colors = [
      '#4A90E2', '#50C878', '#FF6B6B', '#FFA07A', '#20B2AA',
      '#9370DB', '#FFD700', '#FF69B4', '#00CED1', '#FF6347'
    ];
    const colorIndex = code.charCodeAt(0) % colors.length;
    const color = colors[colorIndex];

    return {
      userId,
      moodleCourseId: moodleCourse.id,
      code,
      name: moodleCourse.fullname || moodleCourse.displayname || code,
      shortName: moodleCourse.shortname,
      summary: moodleCourse.summary || undefined,
      categoryId: moodleCourse.categoryid,
      startDate: moodleCourse.startdate 
        ? new Date(moodleCourse.startdate * 1000) 
        : undefined,
      endDate: moodleCourse.enddate 
        ? new Date(moodleCourse.enddate * 1000) 
        : undefined,
      visible: moodleCourse.visible === 1,
      courseImage: moodleCourse.courseimage || undefined,
      color,
      iconColor: '#FFFFFF',
      fileIcon: '/assets/icons/course-icon.svg',
      week: 1, // Default to week 1
      moodleData: moodleCourse, // Store raw Moodle data
    };
  }

  /**
   * Test Moodle connection
   */
  static async testConnection(moodleUrl: string, token: string): Promise<boolean> {
    try {
      await this.fetchCourses(moodleUrl, token);
      return true;
    } catch {
      return false;
    }
  }
}
