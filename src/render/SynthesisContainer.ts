import { Editor } from 'obsidian'
import {
	CodeBlockRenderer,
	SourceReasonBlockContents
} from './CodeBlockRenderer'
import { AggregatorMetadata } from '../notebook/RankedSourceBuilder'
import { DataviewSource } from '../notebook/ReasonAgent'

export type ChatMessageWithMetadata = {
	role: string
	content: string
	metadata: AssistantMessageMetadata[]
}

export type SynthesisMessageMetadata = {
	id: string
	assistantMessageType: 'synthesis'
}

export type SynthesisPlanMessageMetadata = {
	id: string
	assistantMessageType: 'synthesisPlan'
	sources: DataviewSource[]
	prompt: string
}

export type AssistantMessageMetadata =
	| SynthesisMessageMetadata
	| SynthesisPlanMessageMetadata

/**
 * The `SynthesisContainer` class is responsible for managing the insertion of text into the editor
 * at a specified location and for handling the scrolling of the editor to ensure that the inserted
 * text is visible to the user. It also provides functionality to display a placeholder in the editor
 * and to remove it later.
 */
export class SynthesisContainer {
	constructor(
		public editor: Editor,
		public curLine: number,
		public curCh: number,
		public endOfCodeFenceLine: number,
		public renderer: CodeBlockRenderer
	) {}

	_appendText(text: string) {
		let formattedText = text.split('\n').join('\n> ')

		const splitText = formattedText.split('\n')

		this.editor.replaceRange(formattedText, {
			ch: this.curCh,
			line: this.curLine
		})
		const lastLineLength = splitText[splitText.length - 1].length
		if (splitText.length > 1) {
			this.curCh = lastLineLength
		} else {
			this.curCh += lastLineLength
		}
		this.curLine += splitText.length - 1
	}

	/**
	 * Appends the given text to the editor and ensures the newly added text is visible.
	 * This method wraps the private `_appendText` method to insert the text, and then
	 * calls `scrollIntoView` on the editor to scroll to the location where the text was added.
	 *
	 * @param {string} text - The text to be appended to the editor content.
	 */
	appendText(text: string) {
		this._appendText(text)
		this.editor.scrollIntoView(
			{
				from: { line: this.curLine, ch: this.curCh },
				to: { line: this.curLine, ch: this.curCh }
			},
			true
		)
	}

	/**
	 * Displays a placeholder in the editor and returns a function to remove it.
	 * This method inserts a temporary placeholder string into the editor at the current cursor position.
	 * The placeholder is styled to pulsate, indicating an ongoing process. The method returns a cleanup
	 * function that, when called, removes the placeholder from the editor.
	 *
	 * @param {string} placeholder - The text to be displayed as a placeholder.
	 * @returns {Function} A function that removes the placeholder from the editor when called.
	 */
	waitPlaceholder(placeholder: string) {
		const placeholderStr = ` <span style="animation: pulsate 1s infinite">${placeholder}</span>`
		this.editor.replaceRange(placeholderStr, {
			ch: this.curCh,
			line: this.curLine
		})
		return () => {
			this.editor.replaceRange(
				'',
				{
					ch: this.curCh,
					line: this.curLine
				},
				{
					ch: this.curCh + placeholderStr.length,
					line: this.curLine
				}
			)
		}
	}

	/**
	 * Resets the text in the editor starting from the line after the end of the code fence.
	 * It replaces the range of text from the specified starting point to the current cursor
	 * position with a new line, a prompt indicator, and a space. This is typically used to
	 * clear the editor content and prepare it for new input or messages.
	 */
	resetText() {
		this.editor.replaceRange(
			'\n> [!💭]+\n> ',
			{
				ch: 0,
				line: this.endOfCodeFenceLine + 1
			},
			{
				ch: this.curCh,
				line: this.curLine
			}
		)
	}

	/**
	 * Appends the provided metadata as a hidden div element to the editor.
	 * This function takes an array of AssistantMessageMetadata objects and converts it into a JSON string.
	 * The JSON string is then wrapped in a div element with a style set to display:none, which is appended
	 * to the editor content. This allows the metadata to be included in the document without being visible
	 * to the user.
	 *
	 * @param {AssistantMessageMetadata[]} metadata - An array of metadata objects to be appended.
	 */
	renderMetadata(metadata: AssistantMessageMetadata[]) {
		const text = `\n<div style="display:none">${JSON.stringify(
			metadata
		)}</div>\n`
		this._appendText(text)
	}

	/**
	 * Adds a confirm button to the editor.
	 * This function generates a unique ID for the button, appends the button to the editor content,
	 * and attaches an event listener to the button. When the button is clicked, it prevents the default
	 * form submission behavior and executes the provided callback function.
	 *
	 * @param {string} text - The text to be displayed on the button.
	 * @param {() => void} callback - The callback function to be executed when the button is clicked.
	 */
	addConfirmButton(text: string, callback: () => void) {
		const id = Math.random().toString(16).slice(2, 6)
		this._appendText(`\n<button id='${id}'>${text}</button>\n`)
		document.getElementById(id).addEventListener('click', (e) => {
			e.preventDefault()
			callback()
		})
	}

	/**
	 * Finalizes the editor content by appending a code fence for the 'reason' language.
	 * This function inserts a closing code fence for a 'reason' code block at the current
	 * cursor position within the editor. It then moves the cursor three lines down to
	 * position it within the newly created code block, ready for further input. Finally,
	 * it focuses the editor to allow for immediate typing.
	 */
	finalize() {
		this.editor.replaceRange('\n\n```reason\n\n```\n', {
			ch: this.curCh,
			line: this.curLine
		})
		let lineWithinCodeBlock = this.curLine + 3
		this.editor.setCursor({
			ch: 0,
			line: lineWithinCodeBlock
		})
		this.editor.focus()
	}

	/**
	 * Retrieves all messages up to the specified cursor position.
	 * This function extracts the content from the editor up to the given cursor position
	 * and identifies separate message blocks. It then parses each block to determine if it's
	 * a user or assistant message, extracts the displayed content, and if necessary, further
	 * processes user messages to extract metadata. The metadata is used to construct objects
	 * representing the messages with their associated metadata, which are then returned as an array.
	 *
	 * @param {number} curLine - The current line position of the cursor in the editor (defaults to the current line).
	 * @param {number} curCh - The current character position of the cursor in the editor (defaults to the current character).
	 * @returns {ChatMessageWithMetadata[]} An array of chat messages with metadata up to the specified cursor position.
	 */
	getMessagesToHere(
		curLine: number = this.curLine,
		curCh: number = this.curCh
	): ChatMessageWithMetadata[] {
		const rawContent = this.editor.getRange(
			{ ch: 0, line: 0 },
			{ ch: curCh, line: curLine }
		)

		const combinedBlocks = rawContent.match(
			/```reason\n([\s\S]*?)\n```|> \[!💭\]\+\n> ([\s\S]*?)(?=\n[^>])/g
		)
		const messages = combinedBlocks.map((block) => {
			const role = block.includes('```reason') ? 'user' : 'assistant'

			let displayedContent =
				role === 'user'
					? block.match(/```reason\n([\s\S]*?)\n```/)[1]
					: block.match(/> \[!💭\]\+\n> ([\s\S]*)/)[1]

			let content = displayedContent
			let metadata: AssistantMessageMetadata[]
			// Further process if the user message contains more than just a prompt
			if (role === 'user') {
				let { type, ...parsedContents } =
					this.renderer.parseReasonBlockContents(displayedContent)

				switch (type) {
					case 'source':
						metadata = [
							{
								id: Math.random().toString(16).slice(6),
								assistantMessageType: 'synthesisPlan',
								sources: (parsedContents as SourceReasonBlockContents).sources,
								prompt: (parsedContents as SourceReasonBlockContents).prompt
							}
						]
						break
					case 'aggregator':
						metadata = [
							{
								id: (parsedContents as AggregatorMetadata).aggregatorId,
								assistantMessageType: 'synthesisPlan',
								sources: (parsedContents as AggregatorMetadata).sources,
								prompt: (parsedContents as AggregatorMetadata).prompt
							}
						]
						break
					default:
						break
				}
			}

			if (role === 'assistant') {
				let rawMetadata = block.match(
					/<div style="display:none">([\s\S]*)<\/div>/
				)
				if (rawMetadata) {
					metadata = JSON.parse(rawMetadata[1])
				}

				content = displayedContent
					.replace(/<div style="display:none">([\s\S]*)<\/div>/, '')
					.replace(/```\n[^`]```\n/g, '')
					.split('\n> ')
					.join('\n')
			}

			return {
				role,
				content,
				metadata
			} as ChatMessageWithMetadata
		})

		return messages
	}
}
