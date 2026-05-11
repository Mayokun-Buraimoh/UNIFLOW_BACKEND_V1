import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHash } from 'crypto';
import { User } from '../models/User';
import { Profile } from '../models/profile';
import { OAuth2Client } from 'google-auth-library';
import { verifyAppleIdentityToken } from '../utils/verifyAppleIdentityToken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';
/** Trimmed — trailing newline/spaces in `.env` cause Google token endpoint `unauthorized_client`. */
const GOOGLE_CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || '').trim();
const GOOGLE_CLIENT_SECRET = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
/** Native iOS / Capacitor OAuth client; id_token `aud` may be this or the web client when using serverClientId. */
const GOOGLE_IOS_CLIENT_ID = (process.env.GOOGLE_IOS_CLIENT_ID || '').trim();
/** Optional override; otherwise redirect_uri is derived from the incoming request (local + hosted). */
const GOOGLE_CALLBACK_URL = (process.env.GOOGLE_CALLBACK_URL || '').trim();
/** Public SPA origin (no path); used if FRONTEND_GOOGLE_REDIRECT_URI is unset (e.g. on Render). */
const FRONTEND_URL = (process.env.FRONTEND_URL || '').trim().replace(/\/$/, '');
const FRONTEND_GOOGLE_REDIRECT_URI = (
  (process.env.FRONTEND_GOOGLE_REDIRECT_URI || '').trim() ||
  (FRONTEND_URL ? `${FRONTEND_URL}/auth/google/callback` : '') ||
  'http://localhost:5173/auth/google/callback'
).trim();

interface GoogleOAuthStatePayload {
  origin?: string;
  timestamp?: number;
  /** Exact redirect_uri sent to Google on /auth/google — must be reused on token exchange. */
  redirectUri?: string;
}

function parseGoogleOAuthState(state: string | undefined): GoogleOAuthStatePayload {
  if (!state) return {};
  try {
    const data = JSON.parse(Buffer.from(state, 'base64').toString()) as GoogleOAuthStatePayload;
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

/** Send browser back to SPA (e.g. `/auth/google/callback`) with query params — never leave users on API JSON. */
function redirectToFrontendAfterGoogle(res: Response, params: Record<string, string>) {
  const url = new URL(FRONTEND_GOOGLE_REDIRECT_URI);
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v.slice(0, 800));
  }
  return res.redirect(302, url.toString());
}

/** Audiences accepted when verifying Google `id_token` (web + native). */
function getGoogleJwtAudiences(): string[] {
  return [...new Set([GOOGLE_CLIENT_ID, GOOGLE_IOS_CLIENT_ID].filter(Boolean))];
}

/** OAuth client for `verifyIdToken` only (no OAuth redirect). */
function createGoogleIdTokenVerifierClient(): OAuth2Client {
  return new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
}

/** Must match the URL Google redirects to for this request (same host used in /auth/google). */
function getGoogleOAuthRedirectUri(req: Request): string {
  if (GOOGLE_CALLBACK_URL) {
    return GOOGLE_CALLBACK_URL.replace(/\/$/, '');
  }
  // Only trust Render URL when actually on Render — a copied RENDER_EXTERNAL_URL in local .env
  // would otherwise force redirect_uri to production while /auth/google is opened on localhost,
  // breaking the code exchange (and confusing local testing).
  const renderBase = (process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, '');
  if (renderBase && process.env.RENDER === 'true') {
    return `${renderBase}/api/auth/google/callback`;
  }
  const xfProto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0]?.trim();
  const xfHost = (req.headers['x-forwarded-host'] as string | undefined)?.split(',')[0]?.trim();
  const protocol = xfProto || req.protocol || 'https';
  const host = xfHost || req.get('host') || '';
  return `${protocol}://${host}/api/auth/google/callback`;
}

function createGoogleOAuthClient(redirectUri: string): OAuth2Client {
  return new OAuth2Client({
    clientId: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    redirectUri,
  });
}

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

interface AppleSignInRequest {
  identityToken: string;
  givenName?: string;
  familyName?: string;
  /** Only sent by Apple on first authorization; optional fallback if absent from JWT */
  email?: string;
}

function syntheticEmailForAppleSub(appleSub: string): string {
  const h = createHash('sha256').update(appleSub).digest('hex');
  return `apple_${h}@users.uniflow.internal`;
}

/** Create or update user from Google profile; returns UniFlow JWT (same claims as web callback). */
async function signInOrRegisterWithGoogleProfile(
  googleId: string,
  email: string,
  name: string,
  avatar?: string | null,
): Promise<{ user: User; token: string }> {
  let user = await User.findOne({ where: { email } });

  if (user) {
    if (user.googleId !== googleId) {
      await user.update({
        googleId,
        name: user.name || name,
        avatar: user.avatar || avatar || undefined,
      });
    } else {
      await user.update({
        name: user.name || name,
        avatar: user.avatar || avatar || undefined,
      });
    }
  } else {
    try {
      user = await User.create({ email, googleId, name, avatar: avatar || undefined });
      Profile.create({ userId: user.id, email: user.email, name: user.name }).catch((err) =>
        console.error('Profile creation error:', err),
      );
    } catch (error: any) {
      if (error.name === 'SequelizeUniqueConstraintError') {
        const err = new Error('Google account already associated with another email') as Error & { status?: number };
        err.status = 409;
        throw err;
      }
      throw error;
    }
  }

  const token = jwt.sign(
    { userId: user.id, email: user.email, name: user.name, avatar: user.avatar },
    JWT_SECRET,
    { expiresIn: '7d' },
  );
  return { user, token };
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

// Sign in with Apple (native / web identity token from Apple)
export const appleSignIn = async (req: Request<{}, {}, AppleSignInRequest>, res: Response) => {
  try {
    const { identityToken, givenName, familyName, email: emailFromClient } = req.body || {};
    if (!identityToken || typeof identityToken !== 'string') {
      return res.status(400).json({ error: 'identityToken is required' });
    }

    const bundleId = process.env.APPLE_CLIENT_ID || 'com.uniflow.app';
    const servicesId = process.env.APPLE_SERVICES_ID || '';
    const audiences = [bundleId, servicesId].filter(Boolean);

    let payload;
    try {
      payload = await verifyAppleIdentityToken(identityToken, audiences);
    } catch (e) {
      console.error('Apple JWT verify failed:', e);
      return res.status(401).json({ error: 'Invalid Apple identity token' });
    }

    const appleSub = typeof payload.sub === 'string' ? payload.sub : '';
    if (!appleSub) {
      return res.status(401).json({ error: 'Invalid Apple token: missing subject' });
    }

    const emailFromJwt = typeof payload.email === 'string' ? payload.email : undefined;
    const emailRaw = emailFromJwt || (typeof emailFromClient === 'string' ? emailFromClient : undefined);
    const email =
      emailRaw && typeof emailRaw === 'string' && emailRaw.includes('@') ? emailRaw.trim().toLowerCase() : undefined;

    const nameParts = [givenName, familyName].filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
    let fullName = nameParts.join(' ').trim() || undefined;

    let user = await User.findOne({ where: { appleId: appleSub } });

    if (!user && email) {
      user = await User.findOne({ where: { email } });
    }

    if (user) {
      if (user.appleId && user.appleId !== appleSub) {
        return res.status(409).json({ error: 'This Apple ID is already linked to another account' });
      }
      const updates: { appleId?: string; name?: string } = {};
      if (!user.appleId) updates.appleId = appleSub;
      if (fullName && !user.name) updates.name = fullName;
      if (Object.keys(updates).length > 0) {
        await user.update(updates);
      }
    } else {
      const finalEmail = email || syntheticEmailForAppleSub(appleSub);
      if (email) {
        const emailOwner = await User.findOne({ where: { email: finalEmail } });
        if (emailOwner) {
          return res.status(409).json({ error: 'Email already registered' });
        }
      }
      user = await User.create({
        email: finalEmail,
        appleId: appleSub,
        name: fullName || 'Apple User',
      });
      Profile.create({
        userId: user.id,
        email: user.email,
        name: user.name,
      }).catch((err) => console.error('Profile creation error:', err));
    }

    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      token,
    });
  } catch (error) {
    console.error('Apple sign-in error:', error);
    res.status(500).json({ error: 'Apple sign-in failed' });
  }
};

/** Register this URL as a Return URL on your Apple Services ID (used by some native Sign-in flows). */
export const appleRedirectPlaceholder = (_req: Request, res: Response) => {
  res.status(200).type('text/plain').send('UniFlow Apple Sign-In redirect endpoint');
};

interface GoogleNativeSignInRequest {
  idToken: string;
}

/** Capacitor / native iOS: verify Google `idToken` (aud = web and/or iOS client) and return UniFlow JWT. */
export const googleNativeSignIn = async (req: Request<{}, {}, GoogleNativeSignInRequest>, res: Response) => {
  try {
    const { idToken } = req.body || {};
    if (!idToken || typeof idToken !== 'string') {
      return res.status(400).json({ error: 'idToken is required' });
    }
    const audiences = getGoogleJwtAudiences();
    if (!audiences.length) {
      return res.status(500).json({ error: 'Google OAuth is not configured' });
    }
    const client = createGoogleIdTokenVerifierClient();
    let ticket;
    try {
      ticket = await client.verifyIdToken({
        idToken,
        audience: audiences.length === 1 ? audiences[0] : audiences,
      });
    } catch (e) {
      console.error('Google native id_token verify failed:', e);
      return res.status(401).json({ error: 'Invalid Google ID token' });
    }
    const payload = ticket.getPayload();
    if (!payload || !payload.sub || !payload.email) {
      return res.status(401).json({ error: 'Invalid Google token payload' });
    }
    const googleId = payload.sub;
    const email = payload.email;
    const name = payload.name || payload.given_name || 'Google User';
    const avatar = payload.picture;
    try {
      const { user, token } = await signInOrRegisterWithGoogleProfile(googleId, email, name, avatar);
      res.json({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          avatar: user.avatar,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
        token,
      });
    } catch (e: any) {
      if (e?.status === 409) {
        return res.status(409).json({ error: e.message || 'Google account conflict' });
      }
      throw e;
    }
  } catch (error) {
    console.error('Google native sign-in error:', error);
    res.status(500).json({ error: 'Google sign-in failed' });
  }
};

/** Public client IDs for Capacitor (no secrets). Use web ID as `serverClientId` on iOS. */
export const googleAuthClientIds = (_req: Request, res: Response) => {
  res.json({
    google: {
      webClientId: GOOGLE_CLIENT_ID || undefined,
      iosClientId: GOOGLE_IOS_CLIENT_ID || undefined,
    },
  });
};

// Google OAuth callback (placeholder)
export const googleCallback = async (req: Request, res: Response) => {
  const code = req.query.code as string | undefined;
  const error = req.query.error as string | undefined;
  const state = req.query.state as string | undefined;
  
  // Handle OAuth cancellation or error FIRST (before try-catch)
  if (error || !code) {
    console.log('Google OAuth cancelled or error:', error);

    const stateData = parseGoogleOAuthState(state);
    const origin = stateData.origin || 'signup';
    
    // Redirect back to the appropriate page based on origin
    const redirectUrl = new URL(FRONTEND_GOOGLE_REDIRECT_URI);
    redirectUrl.searchParams.set('error', 'oauth_cancelled');
    redirectUrl.searchParams.set('origin', origin);
    console.log('Redirecting to:', redirectUrl.toString());
    return res.redirect(302, redirectUrl.toString());
  }

  try {
    const stateData = parseGoogleOAuthState(state);
    const redirectUri =
      typeof stateData.redirectUri === 'string' && stateData.redirectUri.startsWith('http')
        ? stateData.redirectUri
        : getGoogleOAuthRedirectUri(req);
    const oauthClient = createGoogleOAuthClient(redirectUri);

    // Exchange code for tokens (explicit redirect_uri must match authorize request)
    const { tokens } = await oauthClient.getToken({ code, redirect_uri: redirectUri });
    const idToken = tokens.id_token;
    if (!idToken) {
      return redirectToFrontendAfterGoogle(res, { error: 'google_no_id_token' });
    }

    // Verify ID token and extract payload
    const audiences = getGoogleJwtAudiences();
    const ticket = await oauthClient.verifyIdToken({
      idToken,
      audience: audiences.length === 1 ? audiences[0] : audiences,
    });
    const payload = ticket.getPayload();
    if (!payload || !payload.sub || !payload.email) {
      return redirectToFrontendAfterGoogle(res, { error: 'google_invalid_token_payload' });
    }

    const googleId = payload.sub;
    const email = payload.email;
    const name = payload.name || payload.given_name || 'Google User';
    const avatar = payload.picture;

    console.log(`Google OAuth: googleId=${googleId}, email=${email}, name=${name}`);

    let user: User;
    let token: string;
    try {
      ({ user, token } = await signInOrRegisterWithGoogleProfile(googleId, email, name, avatar));
    } catch (e: any) {
      if (e?.status === 409) {
        return redirectToFrontendAfterGoogle(res, {
          error: 'google_account_conflict',
          message: (e.message || 'Google account conflict').slice(0, 200),
        });
      }
      throw e;
    }

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
  } catch (error: any) {
    console.error('Google OAuth error:', error);
    const redirectUsed = getGoogleOAuthRedirectUri(req);
    console.error('Google OAuth redirect_uri used:', redirectUsed);
    const causeMsg =
      error?.cause?.message || error?.response?.data?.error_description || error?.message || 'unknown';
    const debug =
      process.env.NODE_ENV === 'development' || process.env.OAUTH_DEBUG === '1';
    return redirectToFrontendAfterGoogle(res, {
      error: 'google_oauth_failed',
      ...(debug ? { detail: String(causeMsg).slice(0, 300) } : {}),
      ...(process.env.OAUTH_DEBUG === '1' ? { redirect_uri: redirectUsed } : {}),
    });
  }
};

// Start Google OAuth flow
export const googleStart = async (req: Request, res: Response) => {
  try {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      console.error('Google OAuth: missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET');
      return res.status(503).json({ error: 'Google sign-in is not configured on this server' });
    }
    const redirectUri = getGoogleOAuthRedirectUri(req);
    const state = Buffer.from(
      JSON.stringify({
        origin: 'signup',
        timestamp: Date.now(),
        redirectUri,
      } satisfies GoogleOAuthStatePayload),
    ).toString('base64');

    const oauthClient = createGoogleOAuthClient(redirectUri);

    const url = oauthClient.generateAuthUrl({
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
