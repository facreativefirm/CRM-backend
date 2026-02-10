import winston from 'winston';

const levels = {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    debug: 4,
};

const level = () => {
    const env = process.env.NODE_ENV || 'development';
    const isDevelopment = env === 'development';
    return isDevelopment ? 'debug' : 'warn';
};

const colors = {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    http: 'magenta',
    debug: 'white',
};

winston.addColors(colors);

const format = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
    winston.format.printf(
        (info) => {
            const { timestamp, level, message, ...metadata } = info;
            let msg = `${timestamp} ${level}: ${message}`;
            if (Object.keys(metadata).length > 0) {
                msg += ` ${JSON.stringify(metadata)}`;
            }
            return msg;
        },
    ),
);

const transports = [
    new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize({ all: true })
        )
    }),
    new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
    }),
    new winston.transports.File({ filename: 'logs/all.log' }),
];

const logger = winston.createLogger({
    level: level(),
    levels,
    format,
    transports,
});

export default logger;
