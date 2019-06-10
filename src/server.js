import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import morgan from 'morgan';
import mongoose from 'mongoose';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import loglevels from './lib/loglevels';
import { asyncMiddleware } from './lib/resourcelib';
import Event from './models/event';
import eventRoutes from './routes/event';
import userRoutes from './routes/user';

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
  config, logger,
}) {
  logger.info(`Running server in ${config.env} environment from ${process.cwd()}`);
  logger.info(`Database: ${config.database.mongodbUrl}`);
  logger.debug(`Config is: \n${configToString(config, ['password', 'instance', 'format'])}`);

  // const DEBUG_LOG = msg => logger.debug(msg);

  const { port } = config.server;

  mongoose.connect(config.database.mongodbUrl, { useNewUrlParser: true });

  /*
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
  */

  // Typically serialize user ID and look it up when deserializing
  // Not used now, since we're not using sessions
  //  passport.serializeUser((user, done) => done(null, JSON.stringify(user)));
  //  passport.deserializeUser((user, done) => done(null, JSON.parse(user)));

  // Initialize web app
  const app = express();

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

  const GOOGLE_CLIENT_ID = '551424717997-9f3aonmvs6r4f9i2jr5bke52i3vh3kdf.apps.googleusercontent.com';
  const GOOGLE_CLIENT_SECRET = 'sekkrit';

  passport.use(new GoogleStrategy(
    {
      clientID: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      callbackURL: 'http://www.example.com/auth/google/callback',
    },
    (accessToken, refreshToken, profile, cb) => {
      // User.findOrCreate({ googleId: profile.id }, (err, user) => cb(err, user));
      cb(null, {});
    }
  ));

  // Set up routes
  app.options('*', cors());

  // Authentication routes (requires no authentication)
  // These are URLs used during OAuth authentication
  // var authRouter = express.Router();
  // authRoutes(authRouter);
  // app.use('/auth', authRouter);

  // Ping route, will just check DB access, and return success, else fail.
  // Doesn't require authentication
  app.get('/status', asyncMiddleware((req, res) => res.status(204).send()));

  app.get('/events', asyncMiddleware((req, res) => Event.find({}).exec().then(qr => res.json(qr))));

  /*
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
  */

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
  eventRoutes(app);
  userRoutes(app, logger);

  if (config.env !== 'test') {
    app.listen(port, () => logger.info(`server started on: ${port}`));
  }

  return app;
}
