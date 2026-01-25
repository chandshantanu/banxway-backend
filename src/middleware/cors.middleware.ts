import cors from 'cors';

const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3003')
  .split(',')
  .map(origin => origin.trim());

// Check if origin matches allowed patterns (supports wildcards like *.vercel.app)
const isOriginAllowed = (origin: string): boolean => {
  return allowedOrigins.some(allowed => {
    // Exact match
    if (allowed === origin) return true;

    // Wildcard pattern (e.g., *.vercel.app)
    if (allowed.startsWith('*')) {
      const pattern = allowed.slice(1); // Remove the *
      return origin.endsWith(pattern);
    }

    return false;
  });
};

export const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, Postman, or server-to-server)
    if (!origin) {
      return callback(null, true);
    }

    // Allow in development mode
    if (process.env.NODE_ENV === 'development') {
      return callback(null, true);
    }

    // Check against allowed origins
    if (isOriginAllowed(origin)) {
      callback(null, true);
    } else {
      console.warn(`CORS: Blocked origin ${origin}. Allowed: ${allowedOrigins.join(', ')}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Total-Count'],
  maxAge: 86400, // 24 hours
};
