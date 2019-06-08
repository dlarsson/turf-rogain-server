import { asyncMiddleware } from '../lib/resourcelib';

export default (app) => {
  app.route('/events/')
    .get(asyncMiddleware((req, res) => {
      res.json({});
    }));
};
