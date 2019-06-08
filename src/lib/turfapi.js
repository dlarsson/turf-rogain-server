import fetch from 'node-fetch';

const TURF_API = 'https://api.turfgame.com/v4/';

export class FetchError {
  constructor(res) {
    this.res = res;
  }
}

export function jsonFetch(url, options, logger) {
  const opts = {
    ...options,
  };
  if (!opts.headers) {
    opts.headers = {};
  }
  if (!opts.headers.Accept) {
    opts.headers.Accept = 'application/json';
  }
  if (opts.body && !opts.headers['Content-Type']) {
    opts.headers['Content-Type'] = 'application/json';
  }
  if (logger) {
    logger.debug(`Sending request to ${url} with options ${JSON.stringify(opts)}`);
  }
  return fetch(url, opts)
    .then((res) => {
      if (res.ok) {
        return res.json();
      } else {
        return res.text().then((txt) => {
          if (logger) {
            logger.warning(`Request to ${url} failed with ${res.status} ${res.statusText} and contents\n${txt}`);
          }
          throw new FetchError(res);
        });
      }
    });
}

export function fetchUsers(json, logger) {
  return jsonFetch(`${TURF_API}users/`, {
    method: 'POST',
    body: JSON.stringify(json),
  }, logger);
}
