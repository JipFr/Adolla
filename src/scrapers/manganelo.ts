import chalk from "chalk";
import fetch from "node-fetch-extra";
import { JSDOM } from "jsdom";
import { error } from "./index";
import { Chapter, ScraperError, ScraperResponse } from "../types";
import { Scraper, SearchOptions } from "./types";
import { getProviderId, isProviderId } from "../routers/manga-page";
import updateManga from "../util/updateManga";

export class manganeloClass extends Scraper {
	constructor() {
		super();
		this.provider = "Manganelo";
		this.canSearch = true;
		this.nsfw = true;
	}

	public async search(query: string, options?: Partial<SearchOptions>) {
		// This is a better way of destructuring with default values
		// than doing it at the top. This took... many hours. Thanks Pandawan!
		const { resultCount } = {
			resultCount: 15,
			...options,
		};

		let pageUrl: string;

		if (query === "") {
			// Get popular page
			pageUrl = "https://manganelo.tv/genre?type=topview";
		} else {
			pageUrl = `https://manganelo.tv/search/${encodeURIComponent(query)}`;
		}

		// Fetch DOM for relevant page
		const pageReq = await fetch(pageUrl);
		const pageHtml = await pageReq.text();

		// Get DOM for popular page
		const dom = new JSDOM(pageHtml);
		const document = dom.window.document;

		// Get nodes
		const anchors = [...document.querySelectorAll("a.item-title")];

		// Get IDs from nodes
		const ids = anchors.map((anchor) => anchor.href.split("/").pop());

		// Get details for each search result
		const searchResultData: ScraperResponse[] = await Promise.all(
			ids.map((id) => updateManga("manganelo", id))
		);

		return searchResultData;
	}

	/**
	 * The scrape function
	 */
	public async scrape(slug: string, chapterId: string) {
		// Set a timeout for how long the request is allowed to take
		const maxTimeout: Promise<ScraperError> = new Promise((resolve) => {
			setTimeout(() => {
				resolve(error(0, "This request took too long"));
			}, 25e3);
		});

		// Attempt scraping series
		const scraping = this.doScrape(slug, chapterId);

		// Get first result of either scraping or timeout
		const raceResult = await Promise.race([maxTimeout, scraping]);

		// Check if it's the timeout instead of the scraped result
		if (
			raceResult.success === false &&
			raceResult.err === "This request took too long"
		) {
			console.error(
				chalk.red("[MANGANELO]") +
					` A request for '${slug}' at '${chapterId}' took too long and has timed out`
			);
		}

		// Return result
		return raceResult;
	}

	private async doScrape(
		slug: string,
		chapterId: string
	): Promise<ScraperResponse> {
		// Get HTML
		const pageReq = await fetch(`https://manganelo.tv/manga/${slug}`);
		const pageHtml = await pageReq.text();

		// Get variables
		const dom = new JSDOM(pageHtml);
		const document = dom.window.document;

		// Get title
		const title = document.querySelector("h1").textContent;

		// Get poster URL
		let posterUrl = document.querySelector(".info-image img").src;
		if (posterUrl.startsWith("/"))
			posterUrl = "https://manganelo.tv" + posterUrl;

		// Get genres from tags
		const genreWrapper = document.querySelector(".info-genres").parentNode
			.parentNode;
		const genreLinks = [...genreWrapper.querySelectorAll(".a-h")];
		const genres = genreLinks.map((v) => v.textContent);

		// Get alternate titles
		const altTitleWrapper = document.querySelector(".info-alternative")
			.parentNode.parentNode;
		const alternateTitles = altTitleWrapper
			.querySelector("h2")
			.textContent.split(";")
			.map((v) => v.trim());

		// Get status
		const statusWrapper = document.querySelector(".info-status").parentNode
			.parentNode;
		const status = statusWrapper
			.querySelectorAll("td")[1]
			.textContent.toLowerCase();

		// Get chapters
		const chapters: Chapter[] = [
			...document.querySelectorAll(".row-content-chapter li"),
		].map(
			(row): Chapter => {
				// Find all values
				const label = row.querySelector("a").textContent.split(":")[0];
				const slug = row.querySelector("a").href.split("/").pop();
				const chapter = Number(slug.split("_").pop());
				const date = new Date(row.querySelector(".chapter-time").textContent);

				// Return product of chapter
				return {
					label,
					hrefString: slug,
					season: 1,
					chapter,
					date,
				};
			}
		);

		// Find images
		let chapterImages = [];
		if (chapterId != "-1") {
			// Scrape page to find images
			const url = `https://manganelo.tv/chapter/${slug}/${chapterId}`;
			const chapterPageReq = await fetch(url);
			const chapterPageHtml = await chapterPageReq.text();

			// JSDOM it
			const dom = new JSDOM(chapterPageHtml);
			const chapterDocument = dom.window.document;

			const images = [
				...chapterDocument.querySelectorAll(".container-chapter-reader img"),
			];
			chapterImages = images.map((v) => v.getAttribute("data-src"));
		}

		// Find description
		const descriptionParagraphs = document
			.querySelector("#panel-story-info-description")
			.textContent.split(" :")
			.slice(1)
			.join(" :")
			.split(/\n|<br>/g);

		// Return it.
		const providerId = getProviderId(this.provider);
		return {
			constant: {
				title,
				slug,
				posterUrl,
				alternateTitles,
				descriptionParagraphs,
				genres,
				nsfw: false,
			},
			data: {
				chapters,
				chapterImages,
				status,
			},
			success: true,
			provider: isProviderId(providerId) ? providerId : null,
		};
	}
}

// Generate manganelo object and export it
const manganelo = new manganeloClass();
export default manganelo;