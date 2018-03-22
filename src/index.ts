import * as puppeteer from "puppeteer";
import { getFileTypeFromPath, renderSvg, stringifyFunction, writeFileAsync } from "./helpers";
import { config, defaultOptions, defaultPngShorthandOptions, defaultJpegShorthandOptions, defaultWebpShorthandOptions } from "./constants";
import { IOptions, IShorthandOptions } from "./typings/types";

let browserDestructionTimeout: any; // TODO: add proper typing
let browserInstance: puppeteer.Browser|undefined;

const getBrowser = async () => {
  clearTimeout(browserDestructionTimeout);

  if (!browserInstance) {
    browserInstance = await puppeteer.launch(config.puppeteer);
    await browserInstance.newPage();
  }

  return browserInstance;
};

const getPage = async (browser: puppeteer.Browser) => {
  if (!browser) {
    browser = await getBrowser();
  }

  const pages = await browser.pages();
  if (pages.length > 0) {
    return pages[0];
  }

  return await browser.newPage();
}

const scheduleBrowserForDestruction = () => {
  clearTimeout(browserDestructionTimeout);
  browserDestructionTimeout = setTimeout(() => {
    /* istanbul ignore next */
    if (browserInstance) {
      browserInstance.close(); // Closes the browser asynchronously (no await)
      browserInstance = undefined;
    }
  }, 1000);
};

const convertSvg = async (inputSvg: Buffer|string, passedOptions: IOptions): Promise<Buffer|string> => {
  const svg = Buffer.isBuffer(inputSvg) ? (inputSvg as Buffer).toString("utf8") : inputSvg;
  const options = {...defaultOptions, ...passedOptions};
  const browser = await getBrowser();
  const page = await getPage(browser);

  // ⚠️ Offline mode is enabled to prevent any HTTP requests over the network
  await page.setOfflineMode(true);

  // Infer the file type from the file path if no type is provided
  if (!passedOptions.type && options.path) {
    const fileType = getFileTypeFromPath(options.path);

    if (config.supportedImageTypes.includes(fileType)) {
      options.type = fileType as IOptions["type"];
    }
  }

  const base64 = await page.evaluate(stringifyFunction(renderSvg, svg, {
    width: options.width,
    height: options.height,
    type: options.type,
    quality: options.quality,
    background: options.background,
    clip: options.clip,
    jpegBackground: config.jpegBackground
  }));

  scheduleBrowserForDestruction();

  const buffer = Buffer.from(base64, "base64");

  if (options.path) {
    await writeFileAsync(options.path, buffer);
  }

  if (options.encoding === "base64") {
    return base64;
  }

  if (!options.encoding) {
    return buffer;
  }

  return buffer.toString(options.encoding);
};

const to = (svg: Buffer|string) => {
  return async (options: IOptions): Promise<Buffer|string> => {
    return convertSvg(svg, options);
  };
};

const toPng = (svg: Buffer|string) => {
  return async (options?: IShorthandOptions): Promise<Buffer|string> => {
    return convertSvg(svg, {...defaultPngShorthandOptions, ...options});
  };
};

const toJpeg = (svg: Buffer|string) => {
  return async (options?: IShorthandOptions): Promise<Buffer|string> => {
    return convertSvg(svg, {...defaultJpegShorthandOptions, ...options});
  };
};

const toWebp = (svg: Buffer|string) => {
  return async (options?: IShorthandOptions): Promise<Buffer|string> => {
    return convertSvg(svg, {...defaultWebpShorthandOptions, ...options});
  };
};

export const from = (svg: Buffer|string) => {
  return {
    to: to(svg),
    toPng: toPng(svg),
    toJpeg: toJpeg(svg),
    toWebp: toWebp(svg)
  };
};
