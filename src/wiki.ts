import axios from 'axios';
import axiosRetry from 'axios-retry';
import MWBot, { MWRevision, MWRevisionSlot } from "mwbot";
import dotenv from "dotenv";

dotenv.config();

const lastArg = process.argv[process.argv.length - 1];
export const baseUrl = lastArg.startsWith('http') ? lastArg : process.env.BASE_URL ?? "";

if (!baseUrl) {
  console.log(`Usage: npm start https://example.com`);
  process.exit(1);
}
console.log(`baseUrl=${baseUrl}`);

export const httpClient = axios.create({
  baseURL: baseUrl,
});

axiosRetry(httpClient, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error) =>
    axiosRetry.isNetworkOrIdempotentRequestError(error) ||
    error.code === 'ECONNABORTED',
  shouldResetTimeout: true,
});

export const bot = new MWBot({
  apiUrl: `${baseUrl}/api.php`,
});

export async function getWikiText(title: string, redirect = true, customRequestOptions?: MWBot.RequestOptions): Promise<string> {
  const res = await bot.read(title, redirect, customRequestOptions);
  for (const pageid in res.query.pages) {
    const page = res.query.pages[pageid];
    if (page.title == title && page.revisions) {
      if ("slots" in page.revisions[0]) {
        const slot = page.revisions[0] as MWRevisionSlot;
        return slot["slots"]["main"]["*"];
      }
      else {
        const revision = page.revisions[0] as MWRevision;
        return revision['*'];
      }
    }
  }
  return "";
};

export async function getWikiHtml(name: string, action = 'render') {
  const res = await httpClient.get(`${baseUrl}/index.php?title=${encodeURIComponent(name)}&action=${encodeURIComponent(action)}`, {
    responseType: 'text',
  });
  return res.data as string;
}

export async function getWikiFile(name: string) {
  const res = await httpClient.get(`${baseUrl}/index.php/Special:Redirect/file/${encodeURIComponent(name)}`, {
    responseType: 'arraybuffer',
  });
  return res.data as ArrayBuffer;
}
