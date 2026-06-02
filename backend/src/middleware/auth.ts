import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/User';

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';

interface AuthRequest extends Request {
  userId?: string;
  user?: any;
}

function extractBearerToken(authHeader?: string): string | null {
  if (!authHeader) return null;
  const [scheme, value] = authHeader.trim().split(/\s+/, 2);
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !value) return null;
  return value.trim();
}

function looksLikeJwt(token: string): boolean {
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token);
}

export const authenticateToken = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = extractBearerToken(req.headers['authorization']);

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }
    if (!looksLikeJwt(token)) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    
    // Check if user still exists
    const user = await User.findByPk(decoded.userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Add user info to request
    req.userId = decoded.userId;
    req.user = user;
    
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ error: 'Token expired' });
    }
    console.error('Auth middleware error:', error);
    return res.status(500).json({ error: 'Authentication failed' });
  }
};

// Optional auth middleware (doesn't fail if no token)
export const optionalAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = extractBearerToken(req.headers['authorization']);

    if (token && looksLikeJwt(token)) {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      const user = await User.findByPk(decoded.userId);
      
      if (user) {
        req.userId = decoded.userId;
        req.user = user;
      }
    }
    
    next();
  } catch (error) {
    // Continue without authentication
    next();
  }
};
