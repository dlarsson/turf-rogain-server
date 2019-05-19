import dotenv from 'dotenv';
import startServer from './server';
import loadConfig from './config';

dotenv.config();
startServer(loadConfig());
