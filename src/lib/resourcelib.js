import { parseIntOrFail as utilParseIntOrFail } from './util';

export class WebAppError {
  constructor(status, message) {
    this.status = status;
    this.message = message;
  }
}

export function merge(params, add) {
  return Object.assign(params || {}, add);
}

export const asyncMiddleware = fn =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next))
      .catch(next);
  };

export function fail(msg) {
  return Promise.reject(new WebAppError(400, msg));
}

export function parseIntOrFail(str, msg) {
  return utilParseIntOrFail(str).catch(() => fail(msg));
}

export async function paginationParams(req, params) {
  const limit = await parseIntOrFail(req.query.limit, 'limit must be an integer') || 25;
  const offset = await parseIntOrFail(req.query.offset, 'offset must be an integer') || 0;
  return merge(params, { limit, offset });
}


export function paginatedHeaders(res, params, total) {
  if (params.limit !== undefined) {
    res.set('X-Collection-Limit', params.limit.toString());
  }
  if (params.offset !== undefined) {
    res.set('X-Collection-Offset', params.offset.toString());
  }
  res.set('X-Collection-Total', total.toString());
}

export function paginatedResponse(res, data, params) {
  paginatedHeaders(res, params, data.count);
  res.format({
    json: () => res.json(data.rows),
  });
}

function objMap(obj, f) {
  const res = {};
  Object.entries(obj)
    .map(([k, v]) => [k, f(v)])
    .forEach(([k, v]) => { res[k] = v; });
  return res;
}

const audioFormats = {};

function addAudioHandler(mime, handler) {
  handler.mimetype = mime; // eslint-disable-line no-param-reassign
  audioFormats[mime] = handler;
}

addAudioHandler('audio/ogg; codec=opus', res => res);

export function supportedAudio() {
  return Object.keys(audioFormats);
}

export function formatAudio(res, fun) {
  const formatMap = objMap(audioFormats, f => () => {
    res.req.logger.debug(`Serving audio as ${f.mimetype}`);
    fun(f(res));
  });
  return res.format(formatMap);
}
