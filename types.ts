
export type BlockType = 'text' | 'image' | 'video';

export interface ContentBlock {
  id: string;
  type: BlockType;
  content: string; // contains text, base64 data for images/videos
  mimeType?: string; // for images and videos
}

export interface DocumentState {
  title: string;
  blocks: ContentBlock[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'ai';
  content: string;
  timestamp: string | number | Date;
  image?: string;
}
