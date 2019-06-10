// import fs from 'fs';
import chai from 'chai';
import chaiHttp from 'chai-http';
import { MongoMemoryServer } from 'mongodb-memory-server';
import startServer from '../src/server';
import loadConfig from '../src/config';

process.env.NODE_ENV = 'test';

const mongod = new MongoMemoryServer();

chai.should();
// const { expect } = chai;

chai.use(chaiHttp);

console.log('Running tests');

describe('Server tests', () => {
  describe('GET /status/', () => {
    const URL = '/status';

    it('/status should return 204', async () => {
      process.env.MONGODB = await mongod.getConnectionString();
      console.log(`MONGODB is ${process.env.MONGODB}`);
      const { config, logger } = loadConfig();
      const app = startServer({
        config, logger,
      });
      console.log('App started, performing test');
      chai.request(app)
        .get(URL)
        .end((err, res) => {
          console.log(`request returned with ${res.status}`);
          res.should.have.status(204);
        });
    });
  });
});
