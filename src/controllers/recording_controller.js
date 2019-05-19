import path from 'path';
import Sequelize from 'sequelize';
import passport from 'passport';
import _debug from 'debug';
import recording from '../models/recording';
import audit from '../models/audit';
import { paginatedHeaders, formatAudio } from '../lib/resourcelib';
import { arr, limit, intervalParams, paginated, paginatedRaw } from '../lib/util';
import combine from '../lib/opus_concat';

const debug = _debug('recorder:handlers');
const { Op } = Sequelize;

const MIN_COMPRESS_SILENCE = 5000; // ms
const MIN_INDICATION_SILENCE = 30000; // ms
const MAX_ARTISTS = 5; // Max number of participant names in an exported conversation

function eq(match) {
  return { [Op.eq]: match };
}

function like(search) {
  return { [Op.like]: `%${search}%` };
}

function or(left, right) {
  if (left && right) {
    return { [Op.or]: [left, right] };
  } else {
    return left || right;
  }
}

function buildWhere(ls, mapper, reducer) {
  return arr(ls).map(mapper).reduce(reducer, undefined);
}

function getWhere(acc) {
  if (!acc.where) {
    acc.where = {};
  }
  return acc.where;
}

function setWhere(params, field, value) {
  if (value) {
    getWhere(params)[field] = value;
  }
}

function setOrganizationWhere(params, req, organization) {
  setWhere(params, 'organizationId', {
    [Op.in]: req.user.recorder.roles.map(r => r.org),
    [Op.eq]: organization,
  });
}

module.exports = ({ database }) => {
  const { Recording } = recording(database);
  const { Audit } = audit(database);

  function orderBy(values, defaultValue) {
    function colref(str) {
      const order = str.split(':');
      const col = database.col(order[0]);
      return (order.length > 1)
        ? [col, order[1]]
        : col;
    }

    return values
      ? arr(values).map(colref)
      : defaultValue;
  }

  function getAuthorizedUser(req, res) {
    /* const orgs = await req.user.getOrganizations();
    const response = {
      username: req.user.username,
      createdAt: req.user.createdAt,
      organizations: orgs.map(org => ({
        name: org.name,
        id: org.organizationId,
      })),
    }; */
    res.format({
      json: () => res.json(req.user.recorder),
    });
  }

  function getUsers(req, res, organization, from, to) {
    // Parse ?from and ?to params
    const params = intervalParams(from, to);

    // Parse the ?filter param. If there's multiple values, combine them
    // with 'or'
    setWhere(params, 'senderName', buildWhere(req.query.filter, like, or));
    setWhere(params, 'recordingType', buildWhere(req.query.type, eq, or));
    setOrganizationWhere(params, req, organization);

    // Fetch only distinct rows. We do that by calling DISTINCT on the
    // first column. It's a syntax error in MariaDB to call it on the
    // 2nd column.
    params.attributes = [
      // Two element array denotes "expr AS name"
      [database.fn('DISTINCT', database.col('senderId')), 'senderId'],
      'senderName',
    ];
    // Since we're doing a distinct query, don't use findAndCountAll, since
    // the count would be wrong
    Recording.findAll(params).then(data => res.format({
      json: () => res.json(data),
    }));
  }

  function getSessions(req, res, organization, from, to) {
    const params = intervalParams(from, to);
    setWhere(params, 'senderId', buildWhere(req.query.user, eq, or));
    setWhere(params, 'recordingType', buildWhere(req.query.type, eq, or));
    setOrganizationWhere(params, req, organization);

    params.order = orderBy(req.query.order, database.col('sessionName'));

    // Fetch only distinct rows. We do that by calling DISTINCT on the
    // first column. It's a syntax error in MariaDB to call it on the
    // 2nd column.
    params.attributes = [
      // Two element array denotes "expr AS name"
      [database.fn('DISTINCT', database.col('sessionId')), 'sessionId'],
      'sessionName',
    ];
    Recording.findAll(params).then(data => res.format({
      json: () => res.json(data),
    }));
  }

  function getRecordings(req, res, organization, session, from, to) {
    return paginated(req, res, from, to, (params) => {
      // We only support a single, mandatory sessionId filter
      // This call would support multiple filters, ORed together
      // setWhere(params, 'sessionId', buildWhere(req.query.session, eq, or));
      setWhere(params, 'sessionId', { [Op.eq]: session });
      setWhere(params, 'senderId', buildWhere(req.query.user, eq, or));
      setOrganizationWhere(params, req, organization);
      // eslint-disable-next-line no-param-reassign
      params.order = orderBy(req.query.order, [[database.col('timestamp'), 'ASC']]);

      // Save an audit record for this search
      Audit.create({
        user: req.user.username,
        organizationId: req.user.org,
        accessed: new Date(),
        from,
        to,
        sessionId: session,
      });
      return Recording.findAndCountAll(params).then(async (result) => {
        const rows = [];
        const fields = Object.keys(Recording.tableAttributes);
        // eslint-disable-next-line no-restricted-syntax
        for (const row of result.rows) {
          // We need to copy the row to a new object, since each
          // row is a Recording instance, with a toJSON method that
          // only serializes known fields. We want to add some new
          // fields here.
          const newrow = {};
          // eslint-disable-next-line no-restricted-syntax
          for (const field of fields) {
            newrow[field] = row[field];
          }

          newrow.uri = `/rest/recordings/${row.id}`;
          // eslint-disable-next-line no-underscore-dangle, no-await-in-loop
          const audioUri = await passport._strategy('url').toAuthUrl(req, `${newrow.uri}/audio`);
          newrow.audioUri = audioUri;
          rows.push(newrow);
        }
        // eslint-disable-next-line no-param-reassign
        result.rows = rows;
        return result;
      });
    });
  }

  function getRecordingsAudio(req, res, next, organization, session, from, to, audioSource) {
    return paginatedRaw(req, from, to, (params) => {
      // We only support a single, mandatory sessionId filter
      // This call would support multiple filters, ORed together
      // setWhere(params, 'sessionId', buildWhere(req.query.session, eq, or));
      setWhere(params, 'sessionId', { [Op.eq]: session });
      setWhere(params, 'senderId', buildWhere(req.query.user, eq, or));
      setOrganizationWhere(params, req, organization);
      // eslint-disable-next-line no-param-reassign
      params.order = orderBy(req.query.order, [[database.col('timestamp'), 'ASC']]);

      // Save an audit record for this search
      Audit.create({
        user: req.user.username,
        organizationId: organization,
        accessed: new Date(),
        from,
        to,
        sessionId: session,
      });
      return Recording.findAndCountAll(params).then((result) => {
        // eslint-disable-next-line no-restricted-syntax
        let previousEnd = 0;
        const audio = [];
        const artists = {};
        let title = 'Unknown';
        let genre = 'Unknown';

        // eslint-disable-next-line no-restricted-syntax
        for (const row of result.rows) {
          title = row.sessionName;
          genre = row.recordingType;
          artists[row.senderName] = 1;

          let sincePrevious = previousEnd === 0
            ? 0
            : row.timestamp - previousEnd;
          debug('Since previous:', sincePrevious);

          if (sincePrevious > MIN_INDICATION_SILENCE) {
            audio.push({ silence: 1000 });
            audio.push({ separator: 'audio/separator.opus' });
            audio.push({ silence: 1000 });
            sincePrevious = 0;
          }

          const pause = Math.min(sincePrevious, MIN_COMPRESS_SILENCE);
          if (pause > 0) {
            audio.push({ silence: pause });
          }
          audio.push({ input: path.join(audioSource.root, row.path) });

          debug('Timestamp:', row.timestamp);
          debug('Duration:', row.duration);
          previousEnd = new Date(row.timestamp.getTime() + row.duration);
          debug('Ends at:', previousEnd);
        }
        // eslint-disable-next-line no-param-reassign
        paginatedHeaders(res, params, result.count);
        debug('Concatenating audio:', audio);

        // Build the tags structure
        const [date, time] = from.toJSON().split('T');
        const artist = limit(Object.keys(artists), MAX_ARTISTS).join(', ');
        const tags = {
          artist,
          title,
          date,
          time,
          genre,
        };
        formatAudio(res, stream => combine(tags, audio, stream, next, audioSource));
      });
    });
  }

  function getRecording(req, res, id) {
    const params = {};
    setWhere(params, 'organizationId', { [Op.in]: req.user.organizations });
    return Recording.findById(id, params).then(data => res.format({
      json: () => res.json(data),
    }));
  }

  function getRecordingAudio(req, res, next, id, audioSource) {
    const params = {};
    setWhere(params, 'organizationId', { [Op.in]: req.user.organizations });
    return Recording.findById(id, params).then((data) => {
      audioSource.pipeAudio({
        req, res, next, audioPath: data.path,
      });
    });
  }

  function getAudits(req, res) {
    return paginated(req, res, null, null, (params) => {
      setWhere(params, 'user', buildWhere(req.query.user, like, or));
      setWhere(params, 'organizationId', { [Op.in]: req.user.organizations });
      // eslint-disable-next-line no-param-reassign
      params.order = orderBy(req.query.order, [[database.col('accessed'), 'DESC']]);
      return Audit.findAndCountAll(params);
    });
  }

  function getAudit(req, res, id) {
    Audit.findById(id).then(e => res.format({
      json: () => res.json(e),
    }));
  }

  return {
    getAuthorizedUser,
    getUsers,
    getSessions,
    getRecordings,
    getRecordingsAudio,
    getRecording,
    getRecordingAudio,
    getAudits,
    getAudit,
  };
};
