const http = require('http');

// store a reference to the original request function
const originalRequest = http.request;

// override the function
http.request2 = (req, ...args) => {
  console.log(req.host, req.body);
  // do something with the req here
  // ...
  // call the original 'request' function
  return originalRequest.apply(this, args);
};

const fetch = require('node-fetch');

const user = process.argv[2];

const BASE_URL = 'http://api.turfgame.com/v4/';

const zoneHash = {};

function UnexpectedResponse(res) {
  this.response = res;
}

function turfRequest(url, method, data) {
  const URL = BASE_URL + url;
  return fetch(URL, {
    headers: {
      'Content-Type': 'application/json',
      'Accept-Encoding': 'gzip',
    },
    method,
    body: JSON.stringify(data),
  })
    .then((res) => {
      const contentType = res.headers.get('content-type');
      if (contentType.startsWith('application/json')) {
        return res.json();
      } else {
        console.log(contentType);
        throw new UnexpectedResponse(res);
      }
    });
}

function turfGetRequest(url) {
  return turfRequest(url, 'GET');
}

function turfPostRequest(url, data) {
  return turfRequest(url, 'POST', data);
}

function getUsers(data) {
  return turfPostRequest('users', data);
}

function zoneIdsToRequestData(zoneids) {
  return zoneids.map(id => ({ id }));
}

function getZones(data) {
  const resolvedZones = data.map(id => zoneHash[id] || id);
  const toResolve = resolvedZones.filter(id => typeof id === 'number');
  if (toResolve.length > 0) {
    return turfPostRequest('zones', zoneIdsToRequestData(toResolve))
      .then((res) => {
        res.forEach((z) => {
          zoneHash[z.id] = z;
        });
        return resolvedZones.map(z => (typeof z === 'number' ? zoneHash[z] : z));
      });
  } else {
    return resolvedZones;
  }
}

getUsers([{ name: user }])
  .then((res) => {
    console.log(res);
    return res;
  })
  .then(res => getZones(res[0].zones))
  .then((res) => {
    console.log(res);
    return res;
  })
  .catch(err => console.log(err));
