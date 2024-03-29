import { App, CachedMetadata, TFile } from 'obsidian'
import { BaseExtractor, FileContents } from './BaseExtractor'

// Designed to handle notes that usually long, i.e. because they are append-only, such as Readwise Book notes
export class TrimToEndExtractor extends BaseExtractor {
	constructor(public app: App) {
		super()
	}

	/**
	 * Extracts the last part of the file, starting from the last 5 sections.
	 *
	 * @param file - The file to extract from.
	 * @param metadata - The cached metadata of the file.
	 * @returns A promise resolving to an array of FileContents, each representing the contents of a file.
	 */
	async extract(
		file: TFile,
		metadata: CachedMetadata
	): Promise<FileContents[]> {
		let rawContents = await this.app.vault.cachedRead(file)

		rawContents = this.cleanContents(rawContents)

		rawContents = await this.replaceEmbeds(rawContents, metadata)

		const startSectionBoundary = Math.max(
			0,
			(metadata.sections?.length ?? 0) - 5
		)
		const fiveSectionBoundary =
			metadata.sections[startSectionBoundary].position.start.offset
		rawContents = rawContents.substring(fiveSectionBoundary)

		let { substitutions, contents } = this.substituteBlockReferences(
			file.basename,
			rawContents
		)

		return [
			{
				file: file.basename,
				last_modified_date: new Date(file.stat.mtime).toLocaleDateString(),
				contents: contents,
				substitutions: substitutions
			}
		]
	}
}
