import path from 'path';
import { performance } from 'perf_hooks';
import Sequelize from 'sequelize';
import recording from '../models/recording';

const { Op } = Sequelize;

function pluralize(noun, count) {
  switch (count) {
    case 0:
      return `no ${noun}s`;
    case 1:
      return `one ${noun}`;
    default:
      return `${count} ${noun}s`;
  }
}

function reportPerformance(logger) {
  // eslint-disable-next-line no-restricted-syntax
  for (const measure of performance.getEntriesByType('measure')) {
    logger(measure.name, measure.duration);
  }
  performance.clearMarks();
  performance.clearMeasures();
}

export default ({
  database, logger, config, audioSource,
}) => {
  const { Recording } = recording(database);

  let cleaning = false;

  function expiredOptions() {
    const now = new Date();
    return {
      where: {
        deleteAfter: {
          [Op.lt]: now,
        },
      },
      order: [['deleteAfter', 'ASC'], ['id', 'ASC']],
      limit: config.cleanup.maxProcessed,
    };
  }

  function getExpiredRecords(queryOptions) {
    return Recording.findAll(queryOptions).catch((err) => {
      logger.warn(`Failed to get expired records: ${err}`);
      return [];
    });
  }

  /* eslint-disable */
  const DELETE_QUERY =
    config.database.dialect === 'mysql' ? 'delete from recording where deleteAfter < :timestamp order by deleteAfter ASC, id ASC limit :limit'
    : (config.database.dialect === 'sqlite' ? 'delete from recording where id in (select id from recording where deleteAfter < :timestamp order by deleteAfter ASC, id ASC limit :limit)'
    : (config.database.dialect === 'mssql' ? 'delete from recording where id in (select top :limit id from recording where deleteAfter < :timestamp order by deleteAfter ASC, id ASC)'
    : `UNSUPPORTED_${config.database.dialect}`));
  /* eslint-enable */

  function removeExpiredRecordsChunked(queryOptions, acc) {
    if (acc > 0) {
      const count = Math.min(config.cleanup.maxDeletePerTransaction, acc);
      // eslint-disable-next-line no-param-reassign
      acc -= count;
      // Use raw query here, since sequelize doesn't support order on destroy
      return database.query(DELETE_QUERY, {
        replacements: {
          timestamp: queryOptions.where.deleteAfter[Op.lt],
          limit: count,
        },
      }).then(() => (acc > 0 ? removeExpiredRecordsChunked(queryOptions, acc) : true));
    }
    return Promise.resolve(undefined);
  }

  function removeExpiredRecords(queryOptions, count) {
    return removeExpiredRecordsChunked(queryOptions, count)
      .catch(err => logger.warn(`Failed to remove expired records: ${err}`));
  }

  async function removeExpiredFiles(records) {
    const dirs = {}; // Keeps track of which directories we've visited
    const unlinks = [];
    // eslint-disable-next-line no-restricted-syntax
    for (const record of records) {
      const filepath = path.join(audioSource.root, record.path);
      unlinks.push(audioSource.removeFile(filepath).catch(err => logger.warn(`Failed to remove ${filepath} (${err})`)));

      // We removed a file in this directory. Remember to try remove it, if
      // it ends up empty at the end.
      dirs[path.dirname(filepath)] = 1;
    }
    await Promise.all(unlinks);

    return dirs;
  }

  async function cleanup() {
    if (cleaning) {
      logger.info('Still cleaning, skipping');
      return;
    }
    cleaning = true;
    logger.info('Running cleanup');
    performance.mark('begin');

    const queryOptions = expiredOptions();
    const records = await getExpiredRecords(queryOptions);
    performance.mark('afterQuery');

    logger.debug(`Cleaning ${pluralize('record', records.length)}`);

    const dirs = await removeExpiredFiles(records);
    performance.mark('afterFileRemoval');

    await removeExpiredRecords(queryOptions, records.length);
    performance.mark('afterRecordRemoval');

    // Now check if we can remove any of the directories we've touched (i.e.
    // if they're now empty)
    // eslint-disable-next-line no-restricted-syntax
    Object.keys(dirs).forEach((dir) => {
      // Remove the directory, if it's empty (though we never remove the root directory)
      audioSource.removeUpwards(dir, audioSource.root);
    });
    performance.mark('end');

    performance.measure('query', 'begin', 'afterQuery');
    performance.measure('fileremoval', 'afterQuery', 'afterFileRemoval');
    performance.measure('recordremoval', 'afterFileRemoval', 'afterRecordRemoval');
    performance.measure('dirremoval', 'afterRecordRemoval', 'end');
    performance.measure('cleanup', 'begin', 'end');

    const time = performance.getEntriesByName('cleanup', 'measure')[0].duration;
    performance.clearMeasures('cleanup');

    logger.info(`Cleanup done (${time.toFixed(2)}ms)`);
    reportPerformance((name, duration) => {
      logger.debug(`${name}: ${duration.toFixed(2)}ms`);
    });

    cleaning = false;
  }

  return cleanup;
};
