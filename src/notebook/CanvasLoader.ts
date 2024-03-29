import { TFile } from 'obsidian'
import { App, TFolder, Vault } from 'obsidian'
import { CanvasData } from 'obsidian/canvas'
import * as path from 'path'

export const DEFAULT_BASE_REASON_PATH = 'reason'
export const DEFAULT_CANVAS_PATH = path.join(
	DEFAULT_BASE_REASON_PATH,
	'reason_canvas.canvas'
)

/**
 * `CanvasLoader` is responsible for loading and managing canvas data within the Obsidian application.
 * It interacts with the Obsidian `Vault` to read and write canvas files, and maintains the state of the canvas data.
 */
export class CanvasLoader {
	canvasData: CanvasData
	constructor(public app: App) {}
	async onload() {
		await this.reload()
	}
	public async reload() {
		const canvasFile = this.app.metadataCache.getFirstLinkpathDest(
			DEFAULT_CANVAS_PATH,
			'/'
		)
		if (!canvasFile) {
			this.canvasData = { nodes: [], edges: [] }
		} else {
			if (!(canvasFile instanceof TFile)) {
				throw new Error(`Canvas file not found: ${DEFAULT_CANVAS_PATH}`)
			}
			this.canvasData = JSON.parse(
				await this.app.vault.read(canvasFile)
			) as CanvasData
		}

		let reasonPath: TFolder | undefined = this.app.vault.getAbstractFileByPath(
			DEFAULT_BASE_REASON_PATH
		) as TFolder

		if (!reasonPath) {
			reasonPath = await this.app.vault.createFolder(DEFAULT_BASE_REASON_PATH)
		} else if (!(reasonPath instanceof TFolder)) {
			throw new Error(`Expected ${DEFAULT_BASE_REASON_PATH} to be a folder.`)
		}

		// Read the base path and remove any files which are no longer nodes in the canvas
		Vault.recurseChildren(reasonPath, async (file) => {
			if (
				file.path !== DEFAULT_BASE_REASON_PATH &&
				!file.path.contains('.canvas') &&
				!this.canvasData.nodes.find((node) => node.file === file.path)
			) {
				await this.app.vault.delete(file)
			}
		})
	}
}
