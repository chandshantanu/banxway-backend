import communicationsRouter from '../communications';

/**
 * Inbox router - Direct alias to communications router
 * This provides backward compatibility for frontend calling /inbox endpoints
 */

// Simply re-export the communications router
// This makes /inbox/* behave exactly like /communications/*
export default communicationsRouter;

