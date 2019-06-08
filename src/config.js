import setupLogger from './logger';
import env from './lib/env';

export default function loadConfig() {
  const config = {
    env: env.required.string('NODE_ENV'),
    server: {
      // http or https
      protocol: env.optional.string('PROTOCOL', 'https'),
      // HTTP port to listen to
      port: env.optional.number('PORT', 8005),
    },
    // Sequelize option format
    database: {
      mongodbUrl: env.required.string('MONGODB'),
      db: env.optional.string('DATABASE', process.env.NODE_ENV),
    },
    logger: {
      // Logging level. Levels are: fatal, crit, warn, info, debug, trace
      level: env.optional.string('LOG_LEVEL', 'info'),
      // Outputs to console log if set to true
      outputToConsole: env.optional.string('LOG_OUTPUT_TO_CONSOLE', process.env.NODE_ENV !== 'production'),
      // Outputs to file log (LOG_FILE) if set to true
      outputToFile: env.optional.string('LOG_OUTPUT_TO_FILE', true),
      // Where to store the logs. Default is ./server.log
      logFile: env.optional.string('LOG_FILE', 'server.log'),
    },
  };
  const logger = setupLogger(config.logger);
  return {
    config,
    logger,
  };
}
