import cheerio from "cheerio";
import fs from "fs/promises";
import path from "path";
import Queue from 'queue';
import { md5, mkdir } from "./utils";
import { baseUrl, getWikiHtml, getWikiText, httpClient } from "./wiki";

const exportPath = "./export";
const excludes = [
  "特殊",
  "Special",
  "檔案",
  "File",
  "模板",
  "Template",
  "MediaWiki",
];

const queue = new Queue({
  concurrency: 5,
  autostart: false
});

async function main() {
  const mainpageName = await getWikiText("MediaWiki:Mainpage");
  qadded.add(mainpageName);
  await processPage(mainpageName);
  await writeRedirectPage("index", mainpageName);
  queue.start();
}

const downloaded = new Set<string>();
const qadded = new Set<string>();

async function processPage(pagename: string) {
  const outPath = path.join(exportPath, `${normFilename(pagename)}.html`);
  // check exists
  if (downloaded.has(pagename)) return;
  downloaded.add(pagename);

  if (excludes.find(ns => pagename.startsWith(`${ns}:`))) return;

  try {
    const html = await getWikiHtml(pagename, "view");
    const $ = cheerio.load(html);

    // check is redirect page
    if ($('.mw-redirectedfrom').length > 0) {
      const canonical = $('link[rel="canonical"]')?.attr('href')?.replace(/.*\/index\.php\//, "");
      if (canonical) {
        await writeRedirectPage(pagename, decodeURIComponent(canonical));
        return;
      }
    }

    // download stylesheets and scripts
    $('link[rel="stylesheet"],script[src]').each((index, element) => {
      const href = $(element).attr("href");
      if (href) {
        if (href.includes("load.php")) {
          const path = `./styles/${md5(href)}.css`;
          $(element).attr("href", path);
          if (!qadded.has(href)) {
            qadded.add(href);
            queue.push(() => downloadFile(href, path));
          }
        }
        return;
      }
      const src = $(element).attr("src");
      if (src) {
        if (src.includes("load.php")) {
          const path = `./scripts/${md5(src)}.js`;
          $(element).attr("src", path);
          if (!qadded.has(src)) {
            qadded.add(src);
            queue.push(() => downloadFile(src, path));
          }
        }
        return;
      }
    });

    $('a[href*="/index.php/"]').each((index, element) => {
      const href = $(element).attr("href")?.replace(/\/index\.php\//, "");
      if (href) {
        const linkedPageName = decodeURIComponent(href.replace(/#(.*)$/, ""));
        if (linkedPageName) {
          $(element).attr("href", `./${normFilename(href).replace(/(#(?:.*))?$/, ".html$1")}`);
          if (!qadded.has(linkedPageName)) {
            qadded.add(linkedPageName);
            queue.push(() => processPage(linkedPageName));
          }
        }
      }
    });

    $('img[src],a[href*=".mp3"]').each((index, element) => {
      $(element).attr("srcset", "");
      const src = $(element).attr("src");
      if (src && src.startsWith("/")) {
        const out = `.${decodeURIComponent(src)}`;
        $(element).attr("src", `.${src}`);
        if (!qadded.has(src)) {
          qadded.add(src);
          queue.push(() => downloadFile(src, out));
        }
      }
      const href = $(element).attr("href");
      if (href && href.endsWith(".mp3")) {
        const out = `.${decodeURIComponent(href.replace(new RegExp(baseUrl), ""))}`;
        $(element).attr("href", `.${href.replace(new RegExp(baseUrl), "")}`);
        if (!qadded.has(href)) {
          qadded.add(href);
          queue.push(() => downloadFile(href, out));
        }
      }
    });

    // save
    await mkdir(path.dirname(outPath));
    await fs.writeFile(outPath, $.html());
    console.log(`Downloaded page: ${pagename}`);

  } catch (error) {
    console.error(`Error on download page ${pagename}:`, error);
  }
}

async function downloadFile(fullurl: string, out: string) {
  const outPath = path.join(exportPath, out);
  // check exists
  if (downloaded.has(fullurl)) return;
  downloaded.add(fullurl);

  try {
    const res = await httpClient.get(fullurl, {
      responseType: 'arraybuffer',
    });
    const data = res.data as ArrayBuffer;
    await mkdir(path.dirname(outPath));
    await fs.writeFile(outPath, new Uint8Array(data));
    console.log(`Downloaded file: ${fullurl}`);

  } catch (error) {
    console.error(`Error on download file ${fullurl}:`, error);
  }
}

async function writeRedirectPage(pagename: string, to: string) {
  const outPath = path.join(exportPath, `${normFilename(pagename)}.html`);

  try {
    const toUrl = `./${normFilename(to).replace(/(#(?:.*))?$/, ".html$1")}`;
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="refresh" content="0; url=${toUrl}" />
    <title>${to}</title>
</head>
<body>
    <p>If you are not redirected automatically, follow this <a href='${toUrl}'>link to ${to.replace(/(#(?:.*))?$/, "")}</a>.</p>
    <script type="text/javascript">
        window.location.href = "${toUrl}"
    </script>
</body>
</html>`;

    // save
    await mkdir(path.dirname(outPath));
    await fs.writeFile(outPath, html);
    console.log(`Create redirect page: ${pagename}`);

  } catch (error) {
    console.error(`Error on create redirect page ${pagename}:`, error);
  }
}

function normFilename(filename: string) {
  return filename.replace(/[\/:*?"<>|]/g, "__");
}

main().catch((error) => console.error(error));
