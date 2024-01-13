import { App, CachedMetadata, TFile } from 'obsidian'
import { BaseExtractor, FileContents } from './BaseExtractor'
import { DataviewApi } from 'obsidian-dataview'
import { LassoFromOffsetExtractor } from './LassoFromOffsetExtractor'
import { DQLStrategy } from 'src/reasonNode/SourceReasonNodeBuilder'

export class SingleBacklinkerExtractor extends BaseExtractor {
	constructor(
		public app: App,
		public dataviewAPI: DataviewApi,
		public lassoExtractor: LassoFromOffsetExtractor
	) {
		super()
	}

	async extract(
		file: TFile,
		metadata: CachedMetadata,
		strategy: string,
		evergreen: string
	): Promise<FileContents[]> {
		let rawReferrerContents = await this.app.vault.cachedRead(file)

		rawReferrerContents = this.cleanContents(rawReferrerContents)

		const referrerContentsReplacedEmbeds = await this.replaceEmbeds(
			rawReferrerContents,
			metadata
		)

		const referenceContentWindows =
			await this.lassoExtractor.extractReferenceWindows(
				referrerContentsReplacedEmbeds,
				metadata,
				[evergreen]
			)

		const substitutions = referenceContentWindows.map((window) => {
			return this.substituteBlockReferences(file.basename, window)
		})

		let contents = {
			file: file.basename,
			last_modified_date: new Date(file.stat.mtime).toLocaleDateString(),
			contents: substitutions
				.map((substitution) => substitution.contents)
				.join('\n\n'),
			substitutions: substitutions.flatMap(
				(substitution) => substitution.substitutions
			)
		}

		return [contents]
	}
}
