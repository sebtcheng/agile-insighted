import { multistream, pino } from "pino";
import { devPinoStream } from "./devtools/dev-diagnostics";
import { env } from "./env";

const options = {
  level: env.NODE_ENV === "test" ? "silent" : env.LOG_LEVEL,
  redact: ["req.headers.cookie", "req.headers.authorization", "res.headers['set-cookie']"],
};

// Dev diagnostics adds a stream for warn and above beside the normal stdout output; undefined in production.
const devStream = devPinoStream();
export const logger = devStream
  ? pino(
      options,
      multistream([
        { level: "trace", stream: process.stdout },
        { level: "warn", stream: devStream },
      ]),
    )
  : pino(options);
