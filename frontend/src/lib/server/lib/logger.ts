const isDev = process.env.NODE_ENV !== "production";

export const logger = {
  info: (msg: string, meta?: Record<string, unknown>) => {
    const entry = { level: "info", msg, ...meta, timestamp: new Date().toISOString() };
    if (isDev) {
      console.log(JSON.stringify(entry, null, 2));
    } else {
      console.log(JSON.stringify(entry));
    }
  },
  warn: (msg: string, meta?: Record<string, unknown>) => {
    const entry = { level: "warn", msg, ...meta, timestamp: new Date().toISOString() };
    if (isDev) {
      console.warn(JSON.stringify(entry, null, 2));
    } else {
      console.warn(JSON.stringify(entry));
    }
  },
  error: (msg: string, meta?: Record<string, unknown>) => {
    const entry = { level: "error", msg, ...meta, timestamp: new Date().toISOString() };
    if (isDev) {
      console.error(JSON.stringify(entry, null, 2));
    } else {
      console.error(JSON.stringify(entry));
    }
  },
};
