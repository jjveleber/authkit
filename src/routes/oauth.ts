import { Router } from 'express';
import passport from '../config/passport.js';
import { oauthController } from '../controllers/oauthController.js';

const router = Router();

/**
 * GET /oauth/google
 * Initiate Google OAuth flow
 * Redirects to Google's OAuth consent screen
 */
router.get(
  '/google',
  passport.authenticate('google', {
    session: false,
    scope: ['profile', 'email'],
  })
);

/**
 * GET /oauth/google/callback
 * Google OAuth callback endpoint
 * Returns JWT tokens as JSON (not session-based)
 */
router.get(
  '/google/callback',
  passport.authenticate('google', {
    session: false,
    failureRedirect: '/oauth/error',
  }),
  oauthController.googleCallback
);

/**
 * GET /oauth/github
 * Initiate GitHub OAuth flow
 * Redirects to GitHub's OAuth authorization screen
 */
router.get(
  '/github',
  passport.authenticate('github', {
    session: false,
    scope: ['user:email'],
  })
);

/**
 * GET /oauth/github/callback
 * GitHub OAuth callback endpoint
 * Returns JWT tokens as JSON (not session-based)
 */
router.get(
  '/github/callback',
  passport.authenticate('github', {
    session: false,
    failureRedirect: '/oauth/error',
  }),
  oauthController.githubCallback
);

/**
 * GET /oauth/error
 * OAuth error fallback endpoint
 */
router.get('/error', (_req, res) => {
  res.status(401).json({
    error: 'OAuth authentication failed',
  });
});

export default router;
