import fs from 'fs/promises';
import { createHash } from "crypto";
import path from 'path';

export function md5(str: string) {
  const md5hash = createHash('md5');
  str = md5hash.update(str).digest('hex');
  return str;
}

export async function mkdir(dirname: string) {
  const dirnames = [dirname];
  for (let i = 0; i < 3; i++) {
    const name = path.dirname(dirnames[dirnames.length - 1]);
    if (name == ".") break;
    dirnames.push(name);
  }
  while (dirnames.length) {
    try {
      const c = dirnames.pop();
      if (c) {
        await fs.mkdir(c);
      }
    }
    catch (e) { }
  }
}

export async function fsExists(filepath: string) {
  try {
    await fs.access(filepath);
  }
  catch (error) {
    return false;
  }
  return true;
}
