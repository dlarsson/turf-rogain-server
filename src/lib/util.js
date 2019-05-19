import Sequelize from 'sequelize';
import { merge, paginatedResponse, paginationParams } from './resourcelib';

const { Op } = Sequelize;

export function assert(truthy, msg) {
  if (!truthy) {
    console.error(msg);
    process.exit(1);
  }
}

function dateString(d) {
  if (process.env.DB_DIALECT !== 'mssql') { return d; }
  const s = d.toISOString();
  // Cut off the trailing 'Z'
  return s.substring(0, s.length - 1);
}

/* eslint-disable no-param-reassign, comma-dangle */
function buildIntervalWhere(where, field, from, to) {
  if (from && to) {
    where[field] = {
      [Op.between]: [dateString(from), dateString(to)]
    };
  } else if (from) {
    where[field] = {
      [Op.gte]: dateString(from)
    };
  } else if (to) {
    where[field] = {
      [Op.lte]: dateString(to)
    };
  }
  return where;
}

export function arr(obj) {
  if (obj) {
    return Array.isArray(obj) ? obj : [obj];
  } else {
    return [];
  }
}

export const arrayChunks = (array, chunkSize) =>
  Array(Math.ceil(array.length / chunkSize))
    .fill()
    .map((_, index) => index * chunkSize)
    .map(begin => array.slice(begin, begin + chunkSize));

export function parseOrFail(parser, str) {
  return new Promise((resolve, reject) => {
    if (str) {
      const val = parser(str);
      if (Number.isNaN(val)) {
        reject(str);
      } else {
        resolve(val);
      }
    } else {
      resolve(str);
    }
  });
}

export function parseIntOrFail(str) {
  return parseOrFail(parseInt, str);
}

export function limit(a, max) {
  const slice = a.slice(0, max);
  if (a.length > max) {
    slice.push('...');
  }
  return slice;
}

/* eslint-enable no-param-reassign, comma-dangle */
export function intervalParams(from, to, params) {
  let p = (params && params.where) || {};

  p = buildIntervalWhere(p, 'timestamp', from, to);

  if (Object.keys(p).length > 0) {
    return merge(params, { where: p });
  } else {
    return params || {};
  }
}

export function paginatedRaw(req, from, to, fun) {
  return paginationParams(req)
    .then(params => intervalParams(from, to, params))
    .then(params => fun(params));
}

export function paginated(req, res, from, to, fun) {
  return paginatedRaw(req, from, to, params =>
    fun(params).then(result => paginatedResponse(res, result, params)));
}
