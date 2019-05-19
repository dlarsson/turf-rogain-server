import fs from 'fs';
import express from 'express';
import url from 'url';
import cors from 'cors';
import request from 'request';
import bodyParser from 'body-parser';
import morgan from 'morgan';
import URLStrategy from './authentication/url';
import loglevels from './lib/loglevels';
import { asyncMiddleware } from './lib/resourcelib';

const TYPE_OBJECT = typeof ({});
const TYPE_FUNCTION = typeof (() => 0);
const TYPE_STRING = typeof ('');
const TYPE_NUMBER = typeof (0);
const TYPE_BOOLEAN = typeof (true);

function indentStr(s, indent) {
  return s.padStart(s.length + indent);
}

function configToString(obj, skip = [], indent = 0) {
  let result = '';
  // eslint-disable-next-line no-restricted-syntax
  for (const field of Object.getOwnPropertyNames(obj)) {
    // Skip 'instance' fields
    if (!skip.includes(field)) {
      switch (typeof (obj[field])) {
        case TYPE_STRING:
        case TYPE_NUMBER:
        case TYPE_BOOLEAN:
          result += `${indentStr(field, indent)}: ${obj[field]}\n`;
          break;
        case TYPE_OBJECT:
          if (obj[field] === null || obj[field] === undefined) {
            result += `${indentStr(field, indent)}: ${obj[field]}\n`;
          } else if (obj[field].length) {
            result += `${indentStr(field, indent)}: [${obj[field].length}]\n`;
          } else {
            result += `${indentStr(field, indent)}:\n`;
            result += configToString(obj[field], skip, indent + 2);
          }
          break;
        case TYPE_FUNCTION:
          result += `${indentStr(field, indent)}: function\n`;
          break;
        default:
          result += `${indentStr(field, indent)}: ${typeof (obj[field])}\n`;
      }
    }
  }
  return result;
}

/* eslint-disable comma-dangle */
export default function startServer({
  config, database, logger, audioSource
}) {
  logger.info(`Running server in ${config.env} environment from ${process.cwd()}`);
  logger.info(`Database: ${config.database.dialect}, ${config.database.database}@${config.database.host}`);
  logger.info(`Using ${audioSource.name} as audio source with root ${audioSource.root}`);
  logger.debug(`Config is: \n${configToString(config, ['password', 'instance', 'format'])}`);

  const DEBUG_LOG = msg => logger.debug(msg);

  // Remap the logging function to use our logger instead
  if (config.database.logging) {
    database.options.logging = console.log; // eslint-disable-line no-console, no-param-reassign
  }
  const { port } = config.server;
  const { Audit } = audit(database);

  // Make sure the audit table exists
  Audit.sync();

  // Turn on cleanup, if requested
  if (config.cleanup.interval) {
    const audioCleanup = cleanup({
      config, database, logger, audioSource
    });
    logger.debug(`Running cleanup with interval ${config.cleanup.interval} milliseconds`);
    setInterval(audioCleanup, config.cleanup.interval);
  }

  let publicKey;
  if (config.authentication.publicKeyBase64 !== undefined &&
      config.authentication.publicKeyFile !== undefined) {
    throw new Error('Both OAUTH_PUBLIC_KEY_BASE64 and OAUTH_PUBLIC_KEY_FILE are defined!');
  } else if (config.authentication.publicKeyFile) {
    publicKey = fs.readFileSync(config.authentication.publicKeyFile);
  } else if (config.authentication.publicKeyBase64) {
    publicKey = Buffer.from(config.authentication.publicKeyBase64, 'base64');
  } else {
    throw new Error('Neither OAUTH_PUBLIC_KEY_BASE64 or OAUTH_PUBLIC_KEY_FILE are defined!');
  }

  passport.use(new URLStrategy({ logger: DEBUG_LOG }));

  // Typically serialize user ID and look it up when deserializing
  // Not used now, since we're not using sessions
  passport.serializeUser((user, done) => done(null, JSON.stringify(user)));
  passport.deserializeUser((user, done) => done(null, JSON.parse(user)));

  // Initialize web app
  const app = express();

  // Register extension .opus
  express.static.mime.define({ 'audio/ogg;codec=opus': ['opus'] });

  // Turn off etag support
  app.set('etag', false);

  if (config.env !== 'test') {
    // Don't log during testing
    app.use(morgan('combined')); // 'combined' outputs the Apache style LOGs
  }

  // Install logger reference to each request
  app.use((req, res, next) => {
    req.logger = {
      log: (lvl, message) => {
        let newMessage = message;
        if (typeof (message) === typeof ('')) {
          newMessage = { message };
        }
        newMessage.url = req.url;
        return logger.log(lvl, newMessage);
      }
    };
    Object.keys(loglevels).forEach((key) => {
      req.logger[key] = (message) => {
        let newMessage = message;
        if (typeof (message) === typeof ('')) {
          newMessage = { message };
        }
        newMessage.url = req.url;
        return logger[key](newMessage);
      };
    });
    next();
  });

  // Add CORS headers
  app.use(cors());

  // Parse url encoded body
  app.use(bodyParser.urlencoded({ extended: true }));

  app.use(passport.initialize());

  // Set up routes
  app.options('*', cors());

  // Authentication routes (requires no authentication)
  // These are URLs used during OAuth authentication
  // var authRouter = express.Router();
  // authRoutes(authRouter);
  // app.use('/auth', authRouter);

  // Ping route, will just check DB access, and return success, else fail.
  // Doesn't require authentication
  app.get('/rest/status', asyncMiddleware((req, res) =>
    Audit.count()
      .then(() => res.status(204).send())
      .catch(() => res.status(500).send('No database?'))));

  app.get('/rest/audio/support', (req, res) => {
    res.format({
      json: () => res.json(supportedAudio()),
    });
  });

  // Routes inside this router requires authentication
  const protectedRouter = express.Router();

  protectedRouter.use((req, res, next) => {
    if (req.path.startsWith('/temporary')) {
      passport.authenticate(['url'], { session: false })(req, res, next);
    } else {
      jwt({
        secret: publicKey,
        audience: config.authentication.clientId,
        issuer: config.authentication.issuer,
      })(req, res, next);
    }
  });

  // Check claims
  protectedRouter.use((req, res, next) => {
    if (['org', 'recorder', 'orgname', 'username'].every(key => req.user[key])) {
      next();
    } else {
      res.status(401).send();
    }
  });

  recRoutes({
    app: protectedRouter,
    database,
    audioSource,
  });

  app.use('/rest', protectedRouter);

  // Authorize
  app.get('/oauth/authorize', (req, res) => {
    res.redirect(307, url.format({
      pathname: `${config.authentication.loginServer}/auth/authorize`,
      query: { ...req.query, client_id: config.authentication.clientId }
    }));
  });

  // Token
  app.post('/oauth/token', (req, res) => {
    request.post({
      url: `${config.authentication.loginServer}/auth/token`,
      form: {
        ...req.body,
        client_id: config.authentication.clientId,
        client_secret: config.authentication.clientSecret
      },
    }, (err, remoteResponse, remoteBody) => {
      if (err) {
        logger.warn(err);
        return res.status(remoteResponse.statusCode).end(err);
      }
      return res.status(remoteResponse.statusCode).send(remoteBody);
    });
  });

  // Login-status
  app.get('/oauth/login-status', (req, res) => {
    res.redirect(307, url.format({
      pathname: config.authentication.loginApp,
      query: req.query
    }));
  });

  // Return errors if the exception has a status field
  app.use((err, req, res, next) => {
    if (err.status) {
      res.status(err.status).send(err.message);
      logger.warn(err.message);
    } else {
      next(err);
    }
  });

  // Start listening to requests
  if (config.env !== 'test') {
    app.listen(port, () => logger.info(`recorder RESTful API server started on: ${port}`));
  }

  return app;
}
