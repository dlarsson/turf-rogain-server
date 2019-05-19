#!/bin/env node

import prompt from 'prompt-promise';
import { parser, addDbArgs } from './arguments';
import server from './index';
import { hash } from './lib/crypto';
import Login from './models/login';

/* eslint no-console: "off", no-await-in-loop: "off" */

addDbArgs(parser);
const args = parser.parseArgs();

server.loadConfig(args).then((conf) => {
  const login = Login(conf.database.instance);

  conf.database.instance.sync();

  async function findUser(username) {
    const result = await login.Login.findOne({ where: { username } });
    if (result == null) {
      throw new Error('User does not exist');
    }
    return result;
  }


  async function promptUser() {
    try {
      const username = await prompt('Username: ');
      const user = await findUser(username);
      const pw = await prompt.password('Password: ');
      user.pwhash = hash(pw);
      await user.save();

      console.log(`Password updated for user ${username}`);
      return true;
    } catch (err) {
      console.log('Failed to update password:', err);
      return false;
    }
  }

  promptUser().then(status => process.exit(status ? 0 : 1));
});
