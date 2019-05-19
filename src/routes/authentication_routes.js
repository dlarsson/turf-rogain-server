import passport from 'passport';

module.exports = (app) => {
  app.route('/auth0')
    .get(passport.authenticate('auth0'), (req, res) => {
      res.redirect('/recordings');
    });

  app.route('/auth0-callback')
    .get(passport.authenticate('auth0'), (req, res) => {
      res.redirect('/recordings');
    });
};
