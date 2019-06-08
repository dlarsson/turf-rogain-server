export function assert(truthy, msg) {
  if (!truthy) {
    console.error(msg);
    process.exit(1);
  }
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
