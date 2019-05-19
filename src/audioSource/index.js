import s3 from './s3';
import local from './local';

export default function setupAudioSource(config, logger) {
  if (config.region && config.bucket) {
    return s3(config, logger);
  } else {
    return local(config, logger);
  }
}
