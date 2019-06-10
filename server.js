process.env.MONGODB = 'mongodb+srv://admin:zBAjDRAuS5KVmi2@paltn01-qtyrk.mongodb.net/test?retryWrites=true';
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'development';
}
require('./dist/src/index');
