import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Op } from 'sequelize';
import { User } from '../models/User';
import { Profile } from '../models/profile';
import { OAuth2Client } from 'google-auth-library';

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/api/auth/google/callback';
const FRONTEND_GOOGLE_REDIRECT_URI = process.env.FRONTEND_GOOGLE_REDIRECT_URI || 'http://localhost:5173/auth/google/callback';

const googleClient = new OAuth2Client({
  clientId:        GOOGLE_CLIENT_ID,
  clientSecret:    GOOGLE_CLIENT_SECRET,
  redirectUri:     GOOGLE_CALLBACK_URL,
});

interface RegisterRequest {
  name: string;
  email: string;
  password: string;
}

interface LoginRequest {
  email: string;
  password: string;
}

interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

// Register new user
export const register = async (req: Request<{}, {}, RegisterRequest>, res: Response) => {
  try {
    const { name, email, password } = req.body;

    // Validate input
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ where: { email } });
    let user;
    
    if (existingUser) {
      // If user exists and has a password, they can't register again
      if (existingUser.passwordHash) {
        return res.status(409).json({ error: 'User with this email already exists' });
      }
      
      // If user exists but only has Google account, add password to existing account
      console.log(`Adding password to existing Google user ${existingUser.id} (${existingUser.email})`);
      const saltRounds = 12;
      const passwordHash = await bcrypt.hash(password, saltRounds);
      
      await existingUser.update({ 
        passwordHash,
        name: existingUser.name || name 
      });
      
      user = existingUser;
    } else {
      // Create new user
      const saltRounds = 12;
      const passwordHash = await bcrypt.hash(password, saltRounds);

      user = await User.create({
        name,
        email,
        passwordHash,
      });
    }

    // Create or update profile
    let profile = await Profile.findOne({ where: { userId: user.id } });
    if (!profile) {
      profile = await Profile.create({
        userId: user.id,
        email: user.email,
        name: user.name,
      });
    } else {
      // Update existing profile
      await profile.update({
        email: user.email,
        name: user.name,
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Return user data (without password hash)
    const userResponse = {
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    res.status(201).json({
      user: userResponse,
      token,
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Failed to register user' });
  }
};

// Login user
export const login = async (req: Request<{}, {}, LoginRequest>, res: Response) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Check password
    if (!user.passwordHash) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Return user data (without password hash)
    const userResponse = {
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    res.json({
      user: userResponse,
      token,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
};

// Get current user profile
export const getMe = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId; // Set by auth middleware

    const user = await User.findByPk(userId, {
      attributes: { exclude: ['passwordHash'] },
      include: [{
        model: Profile,
        as: 'profile',
      }],
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to get user profile' });
  }
};

// Change password
export const changePassword = async (req: Request<{}, {}, ChangePasswordRequest>, res: Response) => {
  try {
    const userId = (req as any).userId; // Set by auth middleware
    const { currentPassword, newPassword } = req.body;

    // Validate input
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    // Find user
    const user = await User.findByPk(userId);
    if (!user || !user.passwordHash) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const saltRounds = 12;
    const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    await user.update({ passwordHash: newPasswordHash });

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
};

// Google OAuth callback (placeholder)
export const googleCallback = async (req: Request, res: Response) => {
  const code = req.query.code as string | undefined;
  const error = req.query.error as string | undefined;
  const state = req.query.state as string | undefined;
  
  // Handle OAuth cancellation or error FIRST (before try-catch)
  if (error || !code) {
    console.log('Google OAuth cancelled or error:', error);
    
    // Parse state to get origin
    let origin = 'signup'; // default
    if (state) {
      try {
        const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
        origin = stateData.origin || 'signup';
      } catch (e) {
        console.log('Failed to parse state:', e);
      }
    }
    
    // Redirect back to the appropriate page based on origin
    const redirectUrl = new URL(FRONTEND_GOOGLE_REDIRECT_URI);
    redirectUrl.searchParams.set('error', 'oauth_cancelled');
    redirectUrl.searchParams.set('origin', origin);
    console.log('Redirecting to:', redirectUrl.toString());
    return res.redirect(302, redirectUrl.toString());
  }

  try {

    // Exchange code for tokens
    const { tokens } = await googleClient.getToken(code);
    const idToken = tokens.id_token;
    if (!idToken) {
      return res.status(401).json({ error: 'Failed to obtain id_token from Google' });
    }

    // Verify ID token and extract payload
    const ticket = await googleClient.verifyIdToken({ idToken, audience: GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    if (!payload || !payload.sub || !payload.email) {
      return res.status(401).json({ error: 'Invalid Google token payload' });
    }

    const googleId = payload.sub;
    const email = payload.email;
    const name = payload.name || payload.given_name || 'Google User';
    const avatar = payload.picture;
    
    console.log(`Google OAuth: googleId=${googleId}, email=${email}, name=${name}`);

    // PRIORITIZE EMAIL: First check if email already exists
    let user = await User.findOne({ where: { email } });
    
    if (user) {
      // Email exists - this is the primary account
      console.log(`Email ${email} found for user ${user.id} - updating Google ID`);
      
      // Update Google ID if it's different (allows multiple Google accounts for same email)
      if (user.googleId !== googleId) {
        console.log(`Updating Google ID from ${user.googleId} to ${googleId} for email ${email}`);
        await user.update({ 
          googleId: googleId,
          name: user.name || name, 
          avatar: user.avatar || avatar 
        });
      } else {
        // Same Google ID, just update profile info
        await user.update({ 
          name: user.name || name, 
          avatar: user.avatar || avatar 
        });
      }
    } else {
      // Email doesn't exist - create new account with this email
      console.log(`Creating new user with email ${email} and Google ID ${googleId}`);
      try {
        user = await User.create({ email, googleId, name, avatar });
        
        // Create profile asynchronously (don't wait for it)
        Profile.create({ userId: user.id, email: user.email, name: user.name })
          .catch(err => console.error('Profile creation error:', err));
      } catch (error: any) {
        if (error.name === 'SequelizeUniqueConstraintError') {
          console.error(`Google ID conflict: ${googleId} already exists with different email`);
          return res.status(409).json({ error: 'Google account already associated with another email' });
        }
        throw error;
      }
    }

    // Issue our JWT with user data
    const token = jwt.sign({ 
      userId: user.id, 
      email: user.email,
      name: user.name,
      avatar: user.avatar
    }, JWT_SECRET, { expiresIn: '7d' });

    // Redirect back to frontend with token and user data
    const redirectUrl = new URL(FRONTEND_GOOGLE_REDIRECT_URI);
    redirectUrl.searchParams.set('token', token);
    redirectUrl.searchParams.set('user', JSON.stringify({
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    }));
    res.redirect(302, redirectUrl.toString());
  } catch (error) {
    console.error('Google OAuth error:', error);
    res.status(500).json({ error: 'Google OAuth failed' });
  }
};

// Start Google OAuth flow
export const googleStart = async (req: Request, res: Response) => {
  try {
    // Generate a state parameter to track the origin
    const state = Buffer.from(JSON.stringify({ 
      origin: 'signup',
      timestamp: Date.now() 
    })).toString('base64');
    
    const url = googleClient.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'openid',
        'email',
        'profile',
      ],
      prompt: 'consent',
      state: state, // Add state parameter for tracking
    });
    res.redirect(302, url);
  } catch (error) {
    console.error('Google OAuth start error:', error);
    res.status(500).json({ error: 'Failed to start Google OAuth' });
  }
};
