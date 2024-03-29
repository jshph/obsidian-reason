import { App, CachedMetadata, TFile } from 'obsidian'
import { LassoFromOffsetExtractor } from './LassoFromOffsetExtractor'
import { AllBacklinkersExtractor } from './AllBacklinkersExtractor'
import { TrimToEndExtractor } from './TrimToEndExtractor'
import { BaseExtractor, FileContents } from './BaseExtractor'
import { ReasonSettings } from '../../settings/ReasonSettings'
import { DQLStrategy } from '../../reason-node/SourceReasonNodeBuilder'
import { DataviewApi } from 'obsidian-dataview'
import { SingleBacklinkerExtractor } from './SingleBacklinkerExtractor'

/**
 * The `ExtractorDelegator` class manages the delegation of content extraction to specific extractors. It itself is an extractor.
 */
export class ExtractorDelegator extends BaseExtractor {
	// extractors can be recursive / call other extractors. Named for what they do, not what folders they are for.
	allBacklinkersExtractor: AllBacklinkersExtractor
	trimToEndExtractor: TrimToEndExtractor
	singleBacklinkerExtractor: SingleBacklinkerExtractor

	constructor(
		public app: App,
		dataviewAPI: DataviewApi,
		public settings: ReasonSettings,
		public lassoExtractor: LassoFromOffsetExtractor = new LassoFromOffsetExtractor()
	) {
		super()
		this.allBacklinkersExtractor = new AllBacklinkersExtractor(
			app,
			this.lassoExtractor,
			dataviewAPI
		)
		this.trimToEndExtractor = new TrimToEndExtractor(app)
		this.singleBacklinkerExtractor = new SingleBacklinkerExtractor(
			app,
			dataviewAPI,
			this.lassoExtractor
		)
	}

	/**
	 * Extracts content from a file based on the specified strategy and evergreen status.
	 * This method delegates to specific extractors depending on the strategy provided.
	 * If no strategy is specified, it defaults to extracting the raw contents of the file,
	 * performing embed replacements, and cleaning the contents.
	 *
	 * @param file - The file from which to extract content.
	 * @param metadata - The cached metadata of the file.
	 * @param strategy - The strategy to use for content extraction (optional).
	 * @param evergreen - The evergreen status to consider during extraction (optional).
	 * @returns A Promise that resolves to an array of FileContents objects.
	 */
	async extract(
		file: TFile,
		metadata: CachedMetadata,
		strategy?: string,
		evergreen?: string
	): Promise<FileContents[]> {
		switch (
			strategy // TODO put the block reference in the json itself so the small model can use it
		) {
			case DQLStrategy[DQLStrategy.AllEvergreenReferrers]:
				return this.allBacklinkersExtractor.extract(file, metadata)
			case DQLStrategy[DQLStrategy.LongContent]:
				return this.trimToEndExtractor.extract(file, metadata)
			case DQLStrategy[DQLStrategy.SingleEvergreenReferrer]:
				return this.singleBacklinkerExtractor.extract(
					file,
					metadata,
					strategy,
					evergreen
				)
			default:
				let rawContents = await this.app.vault.cachedRead(file)
				rawContents = await this.replaceEmbeds(rawContents, metadata)
				rawContents = this.cleanContents(rawContents)

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
}
