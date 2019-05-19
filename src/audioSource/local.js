import fs from 'fs';
import path from 'path';
import process from 'process';
import { WebAppError } from '../lib/resourcelib';

export const localReadStream = (decoder, filePath) => {
  const reader = fs.createReadStream(filePath);
  reader.pipe(decoder);
};

const removeUpwards = (dir, root) => {
  if (dir !== root) {
    // Try remove the directory, and if successful, try remove the parent
    fs.rmdir(dir, err => (err ? undefined : removeUpwards(path.dirname(dir), root)));
  }
};

export default (config, logger) => {
  const { fileRoot } = config;
  if (!fs.existsSync(fileRoot)) {
    logger.info(`Creating missing audio file root ${fileRoot}`);
    try {
      fs.mkdirSync(fileRoot);
    } catch (err) {
      logger.fatal(`Unable to create audio file root: ${err}`);
      process.exit(1);
    }
  }
  return {
    name: 'local filestore',
    pipeAudio: ({
      req, res, next, audioPath,
    }) => {
      req.logger.debug(`Sending audio file ${audioPath} from root ${fileRoot}`);
      try {
        res.format({
          'audio/ogg;codec=opus': () => {
            res.type('audio/ogg;codec=opus');
            res.sendFile(audioPath, { root: fileRoot });
          },
        });
      } catch (e) {
        console.error(e, e.stack);
        next(new WebAppError(404, 'Audio file not found'));
      }
    },
    root: fileRoot,
    stream: localReadStream,
    local: localReadStream,
    removeUpwards: dir => removeUpwards(dir, fileRoot),
    removeFile: filepath => new Promise((resolve, reject) => {
      fs.unlink(filepath, err => (err ? reject(err) : resolve(null)));
    }),
  };
};

