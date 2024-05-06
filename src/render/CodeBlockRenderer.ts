import {
	App,
	MarkdownPostProcessorContext,
	MarkdownRenderer,
	Component
} from 'obsidian'
import { EnzymeAgent, StrategyMetadata } from '../notebook/EnzymeAgent'
import { SynthesisContainer } from './SynthesisContainer'
import * as yaml from 'yaml'
import { Notice } from 'obsidian'
import { DQLStrategy, SELECTABLE_STRATEGIES } from 'source/extract/Strategy'
import { DataviewCandidateRetriever } from 'source/retrieve'

type EnzymeBlockContents = {
	prompt: string
	sources: StrategyMetadata[]
	choice?: {
		strategy: string
		line: number
	}
}

let dropdownChangeListener: (event: Event) => void

/**
 * This class is responsible for rendering custom code blocks within Obsidian markdown files.
 * It registers a markdown code block processor for the 'enzyme' code block type and defines
 * the rendering logic for these blocks. The class interacts with various components of the
 * Enzyme plugin, such as EnzymeAgent, and the markdown code block processor
 * registration function, to facilitate the rendering of 'enzyme' blocks with interactive
 * elements and integration with the enzymeing engine.
 */
export class CodeBlockRenderer {
	enzymeResponseContainer: HTMLElement

	constructor(
		public app: App,
		public enzymeAgent: EnzymeAgent,
		public registerMarkdownCodeBlockProcessor: any,
		public candidateRetriever: DataviewCandidateRetriever
	) {
		this.registerMarkdownCodeBlockProcessor(
			'enzyme',
			this.renderEnzyme.bind(this)
		)

		// Backwards compatibility for 'reason' code blocks
		this.registerMarkdownCodeBlockProcessor(
			'reason',
			this.renderEnzyme.bind(this)
		)
	}

	renderIntoEl(
		el: HTMLElement,
		content: string,
		context: MarkdownPostProcessorContext,
		executionLock: { isExecuting: boolean },
		doRenderButton: boolean = true
	) {
		el.setText('')
		const container = el.createEl('div')
		const body = container.createDiv('enzyme-preview')
		const s = body.createSpan()

		MarkdownRenderer.render(this.app, content, s, '/', new Component())

		if (doRenderButton) {
			const button = body.createEl('button')
			button.addClass('enzyme-generate-button')
			button.setText('Send')
			button.addEventListener('click', async () => {
				if (!this.enzymeAgent.checkSetup()) {
					new Notice(
						'Please check that Enzyme is set up properly (i.e. API Key, etc.)'
					)
					return
				}
				this.createSynthesisContainerAction(
					el,
					context,
					executionLock,
					async (synthesisContainerEl) => {
						await this.enzymeAgent.synthesize(synthesisContainerEl)
					}
				)
			})
		}
	}

	/**
	 * Renders the 'enzyme' code block in the markdown preview.
	 *
	 * This function is responsible for parsing the contents of a 'enzyme' code block,
	 * creating the necessary HTML elements to display the block within the markdown preview,
	 * and setting up the interaction logic for the 'Send' button which triggers the enzymeing process.
	 *
	 * @param {string} blockContents - The raw text content of the 'enzyme' code block.
	 * @param {HTMLElement} el - The parent HTML element where the 'enzyme' block will be rendered.
	 * @param {MarkdownPostProcessorContext} context - The context provided by Obsidian for post-processing the markdown.
	 */
	async renderEnzyme(
		blockContents: string,
		el: HTMLElement,
		context: MarkdownPostProcessorContext
	) {
		if (!this.app.workspace.activeEditor) {
			return
		}

		// check if there are messages before this code block
		const tempSynthesisContainer = new SynthesisContainer(
			this.app.workspace.activeEditor.editor,
			context.getSectionInfo(el).lineStart,
			0,
			context.getSectionInfo(el).lineEnd + 1,
			this
		)

		let renderedString: string = ''
		let sources: StrategyMetadata[]
		const executionLock = { isExecuting: false }
		let editor = this.app.workspace.activeEditor.editor
		let dropdownId = ''
		if (blockContents.length > 0) {
			let parsedContents = this.parseEnzymeBlockContents(blockContents)

			// Extract sources and generate markdown sections
			sources = parsedContents.sources

			// Default to RecentMentions if no sources are provided and this is the first message
			// need to do this fudging in order to render it properly, but it's not needed for all uses of parseEnzymeBlockContents
			if (
				sources.length === 0 &&
				tempSynthesisContainer.getMessagesToHere().length === 1
			) {
				sources.push({
					strategy: DQLStrategy[DQLStrategy.RecentMentions]
				})
			} else if (sources.length === 1 && !sources[0].strategy) {
				sources[0].strategy = DQLStrategy[DQLStrategy.Basic]
			}

			let selectedStrategy: string = undefined
			if (parsedContents.choice) {
				selectedStrategy = parsedContents.choice.strategy
			} else if (sources.length == 0) {
				// Default to RecentMentions if no sources are provided
				selectedStrategy = DQLStrategy.RecentMentions.toString()
			}

			// Render the collapsible header and the dropdown
			if (selectedStrategy) {
				dropdownId = 'enzyme-choice-' + Math.random().toString(36).substr(2, 9)
				const strategiesHTML = SELECTABLE_STRATEGIES.map((strategy) => {
					const strategyStr = strategy.toString()
					return `<option value="${strategyStr}" ${strategyStr === selectedStrategy ? 'selected' : ''}>${strategyStr}</option>`
				})

				const dropdownHtml =
					`<select id="${dropdownId}">${strategiesHTML.join('')}</select>`.replace(
						/^\s+/gm,
						''
					)

				renderedString += `> [!Source ${selectedStrategy}]-\n> Update the source: ${dropdownHtml}\n> `
			} else {
				renderedString += '> [!Sources]-\n> '
			}

			// Render the sources
			if (selectedStrategy) {
				let sourceString =
					await this.candidateRetriever.contentRenderer.extractor.renderSourceBlock(
						{ strategy: selectedStrategy }
					)

				sourceString = sourceString.split('\n').join('\n> ')

				// Encase sources as collapsible Markdown block
				renderedString += sourceString + '\n\n'
			} else if (sources.length > 0) {
				const sourceStringParts = (
					await Promise.all(
						sources.map(async (source) =>
							this.candidateRetriever.contentRenderer.extractor.renderSourceBlock(
								source
							)
						)
					)
				).flat()

				// Encase sources as collapsible Markdown block
				renderedString +=
					sourceStringParts.join('\n\n').split('\n').join('\n> ') + '\n\n'
			}

			renderedString += parsedContents.prompt

			this.renderIntoEl(el, renderedString, context, executionLock)

			// Attach event listener after rendering to allow user to change the dropdown and update the choice
			if (dropdownId.length > 0) {
				setTimeout(() => {
					const dropdown = document.getElementById(dropdownId)
					dropdownChangeListener = (event) => {
						// Case preserving strategy selection
						const selectedStrategy = (event.target as HTMLSelectElement).value

						editor.setLine(
							parsedContents.choice.line +
								context.getSectionInfo(el).lineStart +
								1,
							'choice: ' + selectedStrategy
						)

						blockContents = blockContents.replace(
							/choice: [a-zA-Z]+/,
							`choice: ${selectedStrategy}`
						)

						this.renderEnzyme(blockContents, el, context)
					}
					if (dropdown) {
						dropdown.addEventListener('change', dropdownChangeListener)
					}
				}, 100) // hacky way to ensure that the dropdown is rendered before we attach the event listener
			}
		} else {
			renderedString += 'Invalid Enzyme block! 🫤'
			this.renderIntoEl(el, renderedString, context, executionLock, false)
		}
	}

	/**
	 * Creates a synthesis container and performs the provided action on it.
	 * This function is designed to be called when a user interaction requires
	 * a synthesis container to be created and an action to be executed with it.
	 * The action is an asynchronous callback that receives the created synthesis
	 * container as an argument. The execution of the action is guarded by an
	 * execution lock to prevent concurrent executions.
	 *
	 * @param el - The HTML element where the synthesis container will be attached.
	 * @param context - The context in which the synthesis container is being created.
	 * @param executionLock - An object with an 'isExecuting' property that indicates
	 *                        if an action is currently being executed.
	 * @param callback - The asynchronous function to be executed with the created
	 *                   synthesis container. It must return a Promise.
	 */
	async createSynthesisContainerAction(
		el: HTMLElement,
		context,
		executionLock: { isExecuting: boolean },
		callback: (synthesisContainerEl: SynthesisContainer) => Promise<void>
	) {
		if (!executionLock.isExecuting) {
			try {
				executionLock.isExecuting = true
				const synthesisContainerEl = this.createSynthesisContainer(el, context)
				await callback(synthesisContainerEl)
			} catch (e) {
				new Notice('Enzyme encountered an error: ' + e.message)
			} finally {
				executionLock.isExecuting = false
			}
		} else {
			new Notice('Please wait for Enzyme to finish.')
		}
	}

	createSynthesisContainer(
		codeblockEl: HTMLElement,
		context: MarkdownPostProcessorContext
	): SynthesisContainer {
		let endOfCodeFenceLine = context.getSectionInfo(codeblockEl).lineEnd
		let editor = this.app.workspace.activeEditor.editor
		editor.replaceRange('\n> [!💭]+\n> ', {
			ch: 0,
			line: endOfCodeFenceLine + 1
		})

		let curLine = endOfCodeFenceLine + 3
		endOfCodeFenceLine += 3
		let curCh = 2

		return new SynthesisContainer(
			editor,
			curLine,
			curCh,
			endOfCodeFenceLine + 1,
			this
		)
	}

	/**
	 * Parses the contents of a Enzyme code block as YAML, producing an Aggregator (with guidance + sources, or by ID)
	 *
	 * @param contents the raw contents, which we'll try to parse as valid YAML syntax.
	 * @returns metadata, i.e. Aggregator metadata
	 */
	parseEnzymeBlockContents(contents: string): EnzymeBlockContents {
		let prompt
		let sources

		try {
			const parsedYaml = yaml.parse(contents.replace(/\t/g, '    '))
			// First mode is having a UI picker that selects a default aggregator
			if (parsedYaml?.choice) {
				// Assume that if choice is present, we always present the user with a UI button to select between "default" sources, and we return EnzymeBlockContents with that chosen source and a flag
				// We treat choice identically to "strategy" but limited to the strategy's default parameters
				let guidance = ''
				if (parsedYaml?.guidance) {
					guidance = parsedYaml.guidance
				}

				// Get the line number where choice was defined
				const choiceLine = contents
					.split('\n')
					.findIndex((line) => line.includes('choice:'))

				return {
					prompt: guidance,
					sources: [],
					choice: {
						strategy: parsedYaml.choice, // No validation
						line: choiceLine
					}
				}
			}

			// Other mode is having a list of sources
			if (parsedYaml?.sources?.length > 0) {
				sources = parsedYaml.sources.map((source) => {
					return source as StrategyMetadata
				})
				prompt = parsedYaml.guidance
				return {
					prompt,
					sources
				}
			} else if (parsedYaml?.guidance) {
				return {
					prompt: parsedYaml.guidance,
					sources: []
				}
			} else {
				return {
					prompt: contents,
					sources: []
				}
			}
		} catch (e) {
			// By default return empty sources. Currently the caller sets this to RecentMentions; needs to be differentiated from valid YAML
			return {
				prompt: contents,
				sources: []
			}
		}
	}
}
