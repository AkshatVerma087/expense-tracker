import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import pkg from '@prisma/client';
const { PrismaClient } = pkg;
import crypto from 'crypto';

const prisma = new PrismaClient();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

async function register(email, password, name) {
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    throw new Error('User already exists');
  }
  
  const passwordHash = await bcrypt.hash(password, 10);
  
  return prisma.user.create({
    data: {
      email,
      passwordHash,
      name
    }
  });
}

async function login(email, password) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) {
    throw new Error('Invalid email or password');
  }
  
  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    throw new Error('Invalid email or password');
  }
  
  return generateTokens(user);
}

async function googleAuth(idToken) {
  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  const { email, name, sub: googleId } = payload;
  
  let user = await prisma.user.findUnique({ where: { email } });
  
  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        name,
        googleId
      }
    });
  } else if (!user.googleId) {
    // Link Google ID to existing account
    user = await prisma.user.update({
      where: { email },
      data: { googleId }
    });
  }
  
  return generateTokens(user);
}

async function refresh(refreshToken) {
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  
  const tokenRecord = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true }
  });
  
  if (!tokenRecord || tokenRecord.revoked || tokenRecord.expiresAt < new Date()) {
    throw new Error('Invalid or expired refresh token');
  }
  
  const accessToken = jwt.sign(
    { userId: tokenRecord.user.id },
    process.env.JWT_SECRET || 'fallback_secret',
    { expiresIn: '15m' }
  );
  
  // Optional: Refresh token rotation can be implemented here
  return { accessToken };
}

async function logout(refreshToken) {
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  await prisma.refreshToken.updateMany({
    where: { tokenHash },
    data: { revoked: true }
  });
}

async function generateTokens(user) {
  const accessToken = jwt.sign(
    { userId: user.id },
    process.env.JWT_SECRET || 'fallback_secret',
    { expiresIn: '7d' }
  );
  
  const refreshToken = crypto.randomBytes(40).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7 days
  
  await prisma.refreshToken.create({
    data: {
      tokenHash,
      userId: user.id,
      expiresAt
    }
  });
  
  return { user, accessToken, refreshToken };
}

export {
  register,
  login,
  googleAuth,
  refresh,
  logout,
  generateTokens
};
