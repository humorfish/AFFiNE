export interface BookMeta {
  title: string;
  author: string;
  description: string;
  wordCountTarget: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChapterMeta {
  index: number;
  title: string;
  wordCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChapterContent {
  meta: ChapterMeta;
  content: string;
}

export interface NovelProject {
  id: string;
  path: string;
  meta: BookMeta;
}
