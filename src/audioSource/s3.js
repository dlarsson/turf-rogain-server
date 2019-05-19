import AWS from 'aws-sdk';
import path from 'path';
import { WebAppError } from '../lib/resourcelib';
import { localReadStream } from './local';

const forwardS3Headers = (res, headers, keys) => {
  keys.forEach((key) => {
    if (headers[key]) {
      res.set(key, headers[key]);
    }
  });
};

export default (config) => {
  if (config.region) {
    AWS.config.update({ region: config.region });
  }
  if (config.apiVersion) {
    AWS.config.update({ apiVersion: config.apiVersion });
  }
  if (config.accessKeyId && config.secretAccessKey) {
    AWS.config.update({
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  const s3 = new AWS.S3();
  const { s3Root, bucket } = config;

  return {
    name: `s3 bucket ${bucket}`,
    pipeAudio: ({
      req, res, next, audioPath,
    }) => {
      req.logger.debug(`Sending audio from bucket: ${bucket}, path: ${audioPath}, root ${s3Root}`);
      s3.getObject({
        Bucket: bucket,
        Key: path.join(s3Root, audioPath),
        Range: req.header('Range'),
      })
        .on('httpHeaders', (code, headers) => {
          if (code < 300) {
            res.type('audio/ogg;codec=opus');
            forwardS3Headers(res, headers, [
              'content-length',
              'accept-ranges',
              'content-range',
              'last-modified',
              'range',
              'etag',
            ]);
          }
          res.status(code);
        })
        .createReadStream()
        .on('error', (err) => {
          console.error(err);
          next(new WebAppError(err.statusCode, err.message));
        })
        .pipe(res);
    },
    root: s3Root,
    local: localReadStream,
    stream: (decoder, audioPath, next) => {
      s3.getObject({ Bucket: bucket, Key: path.join(s3Root, audioPath) })
        .createReadStream()
        .on('error', (err) => {
          console.error(err);
          next(new WebAppError(err.statusCode, err.message));
        })
        .pipe(decoder);
    },
    removeUpwards: () => {
      // s3 automatically "removes" empty folders. So we do not need to manually remove them.
    },
    removeFile: filepath => new Promise((resolve, reject) => {
      s3.deleteObject({ Bucket: bucket, Key: filepath }, (err, data) => {
        if (data) {
          resolve();
        } else {
          reject(err);
        }
      });
    }),
  };
};
