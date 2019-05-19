import winston from 'winston';
import loglevels from './lib/loglevels';

const { combine, timestamp, printf } = winston.format;

const fileFormat = printf(info => `${info.timestamp} ${info.url ? `[${info.url}] ` : ''}${info.level}: ${info.message}`);
const fileformatter = combine(
//  colorize(),
  timestamp(),
  fileFormat,
);

export default function setupLogger(logConfig) {
  const loggers = [];
  if (logConfig.outputToFile) {
    loggers.push(new winston.transports.File({ filename: logConfig.logFile }));
  }
  if (logConfig.outputToConsole) {
    loggers.push(new winston.transports.Console({ format: fileformatter }));
  }
  const customColors = {
    trace: 'white',
    debug: 'green',
    info: 'blue',
    warn: 'yellow',
    crit: 'red',
    fatal: 'red',
  };
  const logger = winston.createLogger({
    // Log messages at this level and above
    level: logConfig.level,
    levels: loglevels,
    // Log format
    format: fileformatter,
    // Where to send logs
    transports: loggers,
    exitOnError: false,
    debugStdout: true,
  });
  winston.addColors(customColors);
  return logger;
}
