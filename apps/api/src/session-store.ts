import session from "express-session";
import { connection } from "./queue";

const PREFIX = "reachinbox:session:";
const DEFAULT_TTL_SECONDS = 24 * 60 * 60;

export class RedisSessionStore extends session.Store {
  get(
    sid: string,
    callback: (error?: unknown, session?: session.SessionData | null) => void,
  ) {
    connection
      .get(PREFIX + sid)
      .then((value) => callback(null, value ? JSON.parse(value) : null))
      .catch(callback);
  }

  set(
    sid: string,
    value: session.SessionData,
    callback?: (error?: unknown) => void,
  ) {
    const ttl = Math.max(
      1,
      Math.ceil((value.cookie.maxAge ?? DEFAULT_TTL_SECONDS * 1000) / 1000),
    );
    connection
      .set(PREFIX + sid, JSON.stringify(value), "EX", ttl)
      .then(() => callback?.())
      .catch((error) => callback?.(error));
  }

  destroy(sid: string, callback?: (error?: unknown) => void) {
    connection
      .del(PREFIX + sid)
      .then(() => callback?.())
      .catch((error) => callback?.(error));
  }

  touch(
    sid: string,
    value: session.SessionData,
    callback?: (error?: unknown) => void,
  ) {
    const ttl = Math.max(
      1,
      Math.ceil((value.cookie.maxAge ?? DEFAULT_TTL_SECONDS * 1000) / 1000),
    );
    connection
      .expire(PREFIX + sid, ttl)
      .then(() => callback?.())
      .catch((error) => callback?.(error));
  }
}
