function getNumber({ key, required, def }) {
  const value = process.env[key];
  if (value === undefined) {
    if (required) {
      throw new Error(`Environment variable ${key} is not defined`);
    }
    return def;
  } else {
    const parsedValue = parseInt(value, 10);
    if (Number.isNaN(parsedValue)) {
      throw new Error(`${key} must be a number`);
    }
    return parsedValue;
  }
}
function getString({ key, required, def }) {
  const value = process.env[key];
  if (required && value === undefined) {
    throw new Error(`Environment variable ${key} is not defined`);
  } else if (value === undefined) {
    return def;
  } else {
    return value;
  }
}
function getters({ required }) {
  return ({
    string: (key, def) => getString({ key, required, def }),
    number: (key, def) => getNumber({ key, required, def }),
  });
}

export default ({
  required: getters({ required: true }),
  optional: getters({ required: false }),
});
