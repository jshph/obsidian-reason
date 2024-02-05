import { TFile, ItemView } from 'obsidian-internal'

import { App } from 'obsidian-internal'
import { AllCanvasNodeData, CanvasData } from 'obsidian/canvas'

export interface CanvasNode {
	id: string
	app: App
	canvas: Canvas
	child: Partial<CanvasNode>
	color: string
	containerEl: HTMLElement
	containerBlockerEl: HTMLElement
	contentEl: HTMLElement
	destroyted: boolean
	height: number
	initialized: boolean
	isContentMounted: boolean
	isEditing: boolean
	nodeEl: HTMLElement
	placeholderEl: HTMLElement
	renderedZIndex: number
	resizeDirty: boolean
	text: string
	unknownData: Record<string, string>
	width: number
	x: number
	y: number
	zIndex: number
	convertToFile(): Promise<void>
	focus(): void
	getData(): AllCanvasNodeData
	initialize(): void
	moveAndResize(options: MoveAndResizeOptions): void
	render(): void
	setData(data: Partial<AllCanvasNodeData>): void
	setText(text: string): Promise<void>
	showMenu(): void
	startEditing(): void
}

export interface MoveAndResizeOptions {
	x?: number
	y?: number
	width?: number
	height?: number
}

export interface CanvasEdge {
	from: {
		node: CanvasNode
	}
	to: {
		node: CanvasNode
	}
}

export interface Canvas {
	edges: CanvasEdge[]
	selection: Set<CanvasNode>
	nodes: CanvasNode[]
	wrapperEl: HTMLElement | null
	addNode(node: CanvasNode): void
	createTextNode(options: CreateTextNodeOptions): CanvasNode
	createFileNode(options: CreateFileNodeOptions): CanvasNode
	deselectAll(): void
	getData(): CanvasData
	getEdgesForNode(node: CanvasNode): CanvasEdge[]
	importData(data: { nodes: object[]; edges: object[] }): void
	removeNode(node: CanvasNode): void
	requestFrame(): Promise<void>
	requestSave(): Promise<void>
	selectOnly(node: CanvasNode, startEditing: boolean): void
}

export interface CreateTextNodeOptions {
	text: string
	pos?: { x: number; y: number }
	position?: 'left' | 'right' | 'top' | 'bottom'
	size?: { height?: number; width?: number }
	focus?: boolean
}

export interface CreateFileNodeOptions {
	file: TFile
	filePath: string
	subpath: string
	pos?: { x: number; y: number }
	position?: 'left' | 'right' | 'top' | 'bottom'
	size?: { height?: number; width?: number }
	focus?: boolean
}

export type CanvasView = ItemView & {
	canvas: Canvas
}
