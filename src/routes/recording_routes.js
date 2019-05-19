import passport from 'passport';
import recordings from '../controllers/recording_controller';
import { asyncMiddleware, fail, parseIntOrFail } from '../lib/resourcelib';
import { parseOrFail } from '../lib/util';

function pd(str, message) {
  return parseOrFail(s => new Date(s), str).catch(() => fail(message));
}

function poid(str) {
  return parseIntOrFail(str, 'Organization id must be an integer');
}

module.exports = ({
  app, database, audioSource,
}) => {
  const Rec = recordings({ database });

  // Ignore this, jshint doesn't support await/async
  /* jshint ignore:start */
  app.get('/', asyncMiddleware((req, res) => Rec.getAuthorizedUser(req, res)));

  app.route('/users/organization/:orgId/from/:from/to/:to')
    .get(asyncMiddleware(async (req, res) => {
      const orgId = await poid(req.params.orgId);
      const from = await pd(req.params.from);
      const to = await pd(req.params.to);
      return Rec.getUsers(req, res, orgId, from, to);
    }));

  app.route('/sessions/organization/:orgId/from/:from/to/:to')
    .get(asyncMiddleware(async (req, res) => {
      const orgId = await poid(req.params.orgId);
      const from = await pd(req.params.from);
      const to = await pd(req.params.to);
      return Rec.getSessions(req, res, orgId, from, to);
    }));

  app.route('/recordings/organization/:orgId/from/:from/to/:to/session/:session')
    .get(asyncMiddleware(async (req, res) => {
      const orgId = await poid(req.params.orgId);
      const from = await pd(req.params.from);
      const to = await pd(req.params.to);
      return Rec.getRecordings(
        req,
        res,
        orgId,
        req.params.session,
        from,
        to,
      );
    }));

  app.route('/recordings/organization/:orgId/from/:from/to/:to/session/:session/audio')
    .get(asyncMiddleware(async (req, res, next) => {
      const orgId = await poid(req.params.orgId);
      const from = await pd(req.params.from);
      const to = await pd(req.params.to);
      return Rec.getRecordingsAudio(
        req,
        res,
        next,
        orgId,
        req.params.session,
        from,
        to,
        audioSource,
      );
    }));

  /* eslint-disable comma-dangle */
  app.route('/recordings/:recId(\\d+)')
    .get(asyncMiddleware(async (req, res) => {
      const recId = await parseIntOrFail(
        req.params.recId,
        'Recordings are identified by an integer value'
      );
      return Rec.getRecording(req, res, recId);
    }));

  app.route('/recordings/:recId/audio')
    .get(asyncMiddleware(async (req, res, next) => {
      const recId = await parseIntOrFail(
        req.params.recId,
        'Recordings are identified by an integer value'
      );
      return Rec.getRecordingAudio(req, res, next, recId, audioSource);
    }));

  app.route('/recordings/:recId/url')
    .get(asyncMiddleware(async (req, res) => {
      const recId = await parseIntOrFail(
        req.params.recId,
        'Recordings are identified by an integer value'
      );
      // eslint-disable-next-line no-underscore-dangle
      const url = await passport._strategy('url').toAuthUrl(req, `/recordings/${recId}/audio`);
      res.json(`/rest${url}`);
    }));
/*
  app.route('/audits')
    .get(asyncMiddleware((req, res) => Rec.getAudits(req, res)));

  app.route('/audits/:auditId')
    .get(asyncMiddleware(async (req, res) => {
      const auditId = parseIntOrFail(
        req.params.auditId,
        'Audits are identified by an integer value'
      );
      return Rec.getAudit(req, res, auditId);
    }));

  app.route('/audits/:auditId/recordings')
    .get(asyncMiddleware(async (req, res) => {
      let auditId = parseIntOrFail(
        req.params.auditId,
        'Audits are identified by an integer value'
      );
      return Rec.getAuditRecordings(req, res, auditId);
    }));
  */
};
