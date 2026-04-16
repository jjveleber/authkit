import passport from 'passport';
import { Strategy as GoogleStrategy, Profile as GoogleProfile } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy, Profile as GitHubProfile } from 'passport-github2';
import pool from './database.js';
import env from './env.js';

/**
 * Database row structure for users table
 */
interface UserRow {
  id: string;
  email: string;
  password_hash: string | null;
  name: string;
  email_verified: boolean;
  oauth_provider: string | null;
  oauth_id: string | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Find or create user from OAuth profile
 * Returns user row from database
 */
async function findOrCreateOAuthUser(
  provider: 'google' | 'github',
  oauthId: string,
  email: string,
  name: string
): Promise<UserRow> {
  // Try to find existing user by oauth_provider + oauth_id
  const existingResult = await pool.query<UserRow>(
    `SELECT id, email, password_hash, name, email_verified, oauth_provider, oauth_id, created_at, updated_at
     FROM users
     WHERE oauth_provider = $1 AND oauth_id = $2`,
    [provider, oauthId]
  );

  if (existingResult.rows.length > 0) {
    return existingResult.rows[0];
  }

  // Create new user with email_verified = true (OAuth providers verify email)
  const newUserResult = await pool.query<UserRow>(
    `INSERT INTO users (email, name, email_verified, oauth_provider, oauth_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, email, password_hash, name, email_verified, oauth_provider, oauth_id, created_at, updated_at`,
    [email, name, true, provider, oauthId]
  );

  return newUserResult.rows[0];
}

/**
 * Configure Google OAuth2 Strategy
 */
passport.use(
  new GoogleStrategy(
    {
      clientID: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      callbackURL: '/oauth/google/callback',
      scope: ['profile', 'email'],
    },
    async (
      _accessToken: string,
      _refreshToken: string,
      profile: GoogleProfile,
      done: (error: Error | null, user?: UserRow) => void
    ) => {
      try {
        // Extract email from profile
        const email = profile.emails?.[0]?.value;
        if (!email) {
          return done(new Error('No email found in Google profile'));
        }

        // Extract name (fallback to email username if no display name)
        const name = profile.displayName || email.split('@')[0];

        // Find or create user
        const user = await findOrCreateOAuthUser('google', profile.id, email, name);

        done(null, user);
      } catch (error) {
        done(error as Error);
      }
    }
  )
);

/**
 * Configure GitHub OAuth2 Strategy
 */
if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
  passport.use(
    new GitHubStrategy(
      {
        clientID: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
        callbackURL: '/oauth/github/callback',
        scope: ['user:email'],
      },
      async (
        _accessToken: string,
        _refreshToken: string,
        profile: GitHubProfile,
        done: (error: Error | null, user?: UserRow) => void
      ) => {
        try {
          // Extract email from profile (GitHub can have multiple emails)
          const email = profile.emails?.[0]?.value;
          if (!email) {
            return done(new Error('No email found in GitHub profile'));
          }

          // Extract name (fallback to username if no display name)
          const name = profile.displayName || profile.username || email.split('@')[0];

          // Find or create user
          const user = await findOrCreateOAuthUser('github', profile.id, email, name);

          done(null, user);
        } catch (error) {
          done(error as Error);
        }
      }
    )
  );
}

export default passport;
