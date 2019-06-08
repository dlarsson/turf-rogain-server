import { asyncMiddleware } from '../lib/resourcelib';
import * as turfApi from '../lib/turfapi';

export default (app, logger) => {
  app.route('/users/')
    .get(asyncMiddleware((req, res) => {
      res.json({});
    }));
  app.route('/users/id/:id/')
    .get(asyncMiddleware(async (req, res) => {
      const user = await turfApi.fetchUsers([{ id: req.params.id }], logger);
      res.json(user);
    }));
  app.route('/users/name/:name/')
    .get(asyncMiddleware(async (req, res) => {
      const user = await turfApi.fetchUsers([{ name: req.params.name }], logger);
      res.json(user);
    }));
  app.route('/users/email/:email/')
    .get(asyncMiddleware(async (req, res) => {
      const user = await turfApi.fetchUsers([{ email: req.params.email }], logger);
      res.json(user);
    }));
};
