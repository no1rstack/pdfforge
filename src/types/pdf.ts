export type OpType = 'add_text' | 'highlight' | 'draw' | 'place_image' | 'signature';

export interface BaseOp {
  id: string;
  type: OpType;
  page: number;
  timestamp: number;
}

export interface TextOp extends BaseOp {
  type: 'add_text';
  x: number;
  y: number;
  text: string;
  font: string;
  size: number;
  color: string;
  fontFamily?: string;
  fontWeight?: string;
  fontStyle?: string;
}

export interface HighlightOp extends BaseOp {
  type: 'highlight';
  rects: Array<[number, number, number, number]>; // [x, y, w, h]
  color: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}

export interface DrawOp extends BaseOp {
  type: 'draw';
  points: Array<{ x: number; y: number }>;
  color: string;
  width: number;
}

export interface SignatureOp extends BaseOp {
  type: 'signature';
  x: number;
  y: number;
  w: number;
  h: number;
  assetId: string;
}

export interface ImageOp extends BaseOp {
  type: 'place_image';
  x: number;
  y: number;
  w: number;
  h: number;
  assetId: string;
}

export type Operation = TextOp | HighlightOp | DrawOp | SignatureOp | ImageOp;

export interface EditSession {
  documentId: string;
  revision: number;
  ops: Operation[];
}

export interface Job {
  id: string;
  type: 'upload' | 'preview' | 'compile' | 'convert' | 'ocr';
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  progress: number;
  createdAt: number;
}
