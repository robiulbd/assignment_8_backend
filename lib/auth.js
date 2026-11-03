import 'dotenv/config';
import { betterAuth } from 'better-auth';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import { db } from './db.js';

const googleEnabled =
  Boolean(process.env.GOOGLE_CLIENT_ID) && Boolean(process.env.GOOGLE_CLIENT_SECRET);

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:5000',
  secret: process.env.BETTER_AUTH_SECRET,
  database: mongodbAdapter(db),
  trustedOrigins: [process.env.CLIENT_URL || 'https://vercel.com/robiul-islam/assignment-8-frontend-p247/DjczNqV7Unwb2BoytxdTccULSHpj'],
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  ...(googleEnabled && {
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      },
    },
  }),
});