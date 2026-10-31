import 'dotenv/config';
import { betterAuth } from 'better-auth';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import { db } from './db.js';

const googleEnabled =
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET;

export const auth = betterAuth({
  // Where this auth server lives (the Express backend)
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,

  // Store users/sessions/accounts in MongoDB (same DB as the rest of the app)
  database: mongodbAdapter(db),

  // The Next.js frontend runs on a different origin, so it must be trusted,
  // otherwise Better Auth rejects every request with "Invalid origin".
  trustedOrigins: [process.env.CLIENT_URL],

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },

  // Google login only turns on when both keys exist in .env
  ...(googleEnabled && {
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      },
    },
  }),
});
