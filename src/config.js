import Sequelize from 'sequelize';
import setupLogger from './logger';
import setupAudioSource from './audioSource';
import env from './lib/env';

function removeTrailingSlash(string) {
  if (string) {
    return string.replace(/\/$/, '');
  }
  return string;
}

export default function loadConfig() {
  const DOMAIN = removeTrailingSlash(env.optional.string('DOMAIN'));
  const ADMIN_API_SERVER = removeTrailingSlash(env.optional.string('ADMIN_API_SERVER', DOMAIN ? `https://api.${DOMAIN}` : undefined));
  const LOGIN_API_SERVER = removeTrailingSlash(env.optional.string('LOGIN_API_SERVER', DOMAIN ? `https://login-api.${DOMAIN}` : undefined));
  const LOGIN_APP = removeTrailingSlash(env.optional.string('LOGIN_APP', DOMAIN ? `https://login.${DOMAIN}` : undefined));
  if (!ADMIN_API_SERVER || !LOGIN_API_SERVER || !LOGIN_APP) {
    throw new Error('Missing DOMAIN or ADMIN_API_SERVER/LOGIN_API_SERVER/LOGIN_APP');
  }

  const config = {
    env: env.required.string('NODE_ENV'),
    audioSource: {
      // Root directory for audio files. Paths in the database are relative to this root
      fileRoot: env.optional.string('FILE_AUDIO_ROOT', 'recordings'),
      s3Root: env.optional.string('S3_AUDIO_ROOT', ''),
      // Will fetch audio from s3 bucket if both S3_REGION and S3_BUCKET are set,
      // otherwise will fetch from file system.
      region: env.optional.string('S3_REGION', undefined),
      bucket: env.optional.string('S3_BUCKET', undefined),
      apiVersion: '2006-03-01',
      // S3 credential. If not set will use AWS environment variables
      accessKeyId: env.optional.string('S3_CREDENTIALS_ACCESS_KEY_ID'),
      secretAccessKey: env.optional.string('S3_CREDENTIALS_SECRET_ACCESS_KEY'),
    },
    server: {
      // http or https
      protocol: env.optional.string('PROTOCOL', 'https'),
      // HTTP port to listen to
      port: env.optional.number('PORT', 8005),
    },
    authentication: {
      // The client id for this client (for GroupTalk OAuth2 authentication)
      clientId: env.optional.string('OAUTH_CLIENT_ID', 'recorder'),
      // The client secret for this client (for GroupTalk OAuth2 authentication)
      clientSecret: env.optional.string('OAUTH_CLIENT_SECRET', 'recorder'),
      // Base64 encoded public key for verifying GroupTalk authentication tokens
      publicKeyBase64: env.optional.string('OAUTH_PUBLIC_KEY_BASE64', undefined),
      // Path to the public key file.
      publicKeyFile: env.optional.string('OAUTH_PUBLIC_KEY_FILE', undefined),
      apiServer: ADMIN_API_SERVER,
      loginServer: LOGIN_API_SERVER,
      loginApp: LOGIN_APP,
      issuer: removeTrailingSlash(env.optional.string('OAUTH_ISSUER', LOGIN_API_SERVER)),
    },
    // Sequelize option format
    database: {
      // Database dialect. mysql, sqlite or tedious (MSSQL)
      dialect: env.optional.string('DB_DIALECT', 'mysql'),
      // Database host
      host: env.optional.string('DB_HOST', 'localhost'),
      // Database port
      port: env.optional.number('DB_PORT'),
      // Database name
      database: env.optional.string('DB_DATABASE', 'grouptalk_recorder'),
      // Database user
      username: env.optional.string('DB_USER', 'root'),
      // Database password
      password: env.optional.string('DB_PASSWD', undefined),
      // Turn on logging of DB commands
      logging: env.optional.string('DB_LOG', false),
      // To avoid warning
      operatorsAliases: false,
    },
    cleanup: {
      // Interval in ms to run cleanup of expired recordings.
      // 0 means no cleanup will be done. Adjust MAX_PROCESSED accordingly
      interval: env.optional.number('CLEANUP_INTERVAL', 5 * 60 * 1000),
      // Maximum number of recordings to remove per cleanup run.
      maxProcessed: env.optional.number('MAX_PROCESSED', 30000),
      // Maximum number of recordings that will be destroyed per
      // DB call. config.cleanup.maxProcessed will be divided into
      // chunks of this size
      maxDeletePerTransaction: env.optional.number('MAX_DELETE_PER_TRANSACTION', 1000),
    },
    logger: {
      // Logging level. Levels are: fatal, crit, warn, info, debug, trace
      level: env.optional.string('LOG_LEVEL', 'info'),
      // Outputs to console log if set to true
      outputToConsole: env.optional.string('LOG_OUTPUT_TO_CONSOLE', false),
      // Outputs to file log (LOG_FILE) if set to true
      outputToFile: env.optional.string('LOG_OUTPUT_TO_FILE', true),
      // Where to store the logs. Default is ./server.log
      logFile: env.optional.string('LOG_FILE', 'server.log'),
    },
  };
  const logger = setupLogger(config.logger);
  return {
    config,
    database: new Sequelize({ ...config.database, timezone: '+00:00' }),
    logger,
    audioSource: setupAudioSource(config.audioSource, logger),
  };
}
