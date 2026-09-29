import { randomBytes, scrypt as callbackScrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scrypt = promisify(callbackScrypt);

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(24).toString("hex");
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${hash.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [algorithm, salt, hex] = stored.split(":");
  if (algorithm !== "scrypt" || !salt || !hex || hex.length !== 128)
    return false;
  const expected = Buffer.from(hex, "hex");
  const actual = (await scrypt(password, salt, expected.length)) as Buffer;
  return timingSafeEqual(expected, actual);
}
