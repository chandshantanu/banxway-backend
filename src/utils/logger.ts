import winston from 'winston';
import dotenv from 'dotenv';

dotenv.config();

const logLevel = process.env.LOG_LEVEL || 'info';
const isProduction = process.env.NODE_ENV === 'production';

/**
 * Clean error formatter - removes stack traces and sensitive data
 */
const cleanErrorFormat = winston.format((info: any) => {
  // Remove stack traces completely
  if (info.stack) {
    delete info.stack;
  }
  
  // Clean error objects in metadata
  if (info.error) {
    if (typeof info.error === 'object') {
      const cleanError: any = {
        message: info.error.message || 'Unknown error',
        code: info.error.code,
        name: info.error.name,
      };
      // Remove stack trace from error object
      info.error = cleanError;
    }
  }
  
  // Clean any nested error objects
  Object.keys(info).forEach(key => {
    if (info[key] && typeof info[key] === 'object') {
      if (info[key].stack) {
        delete info[key].stack;
      }
      if (info[key].error && info[key].error.stack) {
        delete info[key].error.stack;
      }
    }
  });
  
  return info;
});

export const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    cleanErrorFormat(), // Custom format to remove stack traces
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'banxway-backend' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          let msg = `${timestamp} [${level}]: ${message}`;
          if (Object.keys(meta).length > 0 && meta.service) {
            const { service, ...rest } = meta;
            // Clean up any remaining stack traces
            const cleanRest = JSON.parse(JSON.stringify(rest, (key, value) => {
              if (key === 'stack' || key === 'stackTrace') return undefined;
              return value;
            }));
            if (Object.keys(cleanRest).length > 0) {
              msg += ` ${JSON.stringify(cleanRest)}`;
            }
          }
          return msg;
        })
      ),
    }),
  ],
});

// Add file transports in production
if (isProduction) {
  logger.add(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  );

  logger.add(
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  );
}

export default logger;
