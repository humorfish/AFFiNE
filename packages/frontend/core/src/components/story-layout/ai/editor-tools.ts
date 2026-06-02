// @ts-nocheck

import type { StoryBlock, StoryEdit } from '../story-editor-panel';

// ─────────────────────────────────────────────────────────────
// Editor Tool Execution — line/col range coordinates
//
// Receives structured tool_use parameters from SSE stream,
// translates to StoryEdit operations, and applies to editor.
//
// Coordinate system: line number (1-based) + column (0-based)
//   LLM sees: [1] text...  [2] text...
//   LLM uses: { action, range: { startLine, startCol, endLine, endCol }, text }
//   Frontend maps: line → paragraph block index → blockId → BlockSuite API
// ─────────────────────────────────────────────────────────────

/**
 * Split text into non-empty lines. In BlockSuite each block is already a
 * visual paragraph, so `\n\n` (paragraph break) should produce separate blocks
 * without empty blocks in between.
 */
function splitToBlocks(text: string): string[] {
  return text.split('\n').filter(l => l !== '');
}

/**
 * Build tool edits into a StoryEdit (without applying).
 * Uses pre-computed paragraph list for consistent line→block mapping.
 */
export function buildToolEdit(
  call: { name: string; input: Record<string, any> },
  paragraphs: StoryBlock[],
  edit: StoryEdit
): { success: boolean; message: string } {
  switch (call.name) {
    case 'edit': {
      const { action, range, text } = call.input;
      if (!range) return { success: false, message: '缺少 range' };

      const { startLine, startCol, endLine, endCol } = range;
      if (startLine == null)
        return { success: false, message: '缺少 startLine' };

      const totalLines = paragraphs.length;
      const sLine = Math.max(1, Math.min(startLine, totalLines));
      const eLine =
        endLine != null ? Math.max(1, Math.min(endLine, totalLines)) : sLine;
      const firstTextLen = paragraphs[sLine - 1].text.length;
      const lastTextLen = paragraphs[eLine - 1].text.length;
      const sCol = Math.min(Math.max(0, startCol ?? 0), firstTextLen);
      const eCol = Math.min(Math.max(0, endCol ?? startCol ?? 0), lastTextLen);
      const newText = text ?? '';

      if (sLine === eLine) {
        const block = paragraphs[sLine - 1];
        if (newText.includes('\n')) {
          const lines = splitToBlocks(newText);
          if (lines.length > 0) {
            edit.replace(
              { blockId: block.id, startOffset: sCol, endOffset: eCol },
              lines[0]
            );
            for (let i = 1; i < lines.length; i++) {
              edit.addBlock(lines[i], { afterBlockId: block.id });
            }
          }
        } else if (newText === '' && sCol !== eCol) {
          edit.delete({
            blockId: block.id,
            startOffset: sCol,
            endOffset: eCol,
          });
        } else {
          edit.replace(
            { blockId: block.id, startOffset: sCol, endOffset: eCol },
            newText
          );
        }
      } else {
        const firstBlock = paragraphs[sLine - 1];
        const firstText = paragraphs[sLine - 1].text;
        const lastText = paragraphs[eLine - 1].text;

        const head = firstText.slice(0, sCol);
        const tail = lastText.slice(eCol);
        const fullText = head + newText + tail;

        if (fullText.includes('\n')) {
          const lines = splitToBlocks(fullText);
          if (lines.length > 0) {
            edit.replace(
              {
                blockId: firstBlock.id,
                startOffset: 0,
                endOffset: firstText.length,
              },
              lines[0]
            );
          }
          for (let i = eLine - 1; i >= sLine; i--) {
            edit.removeBlock(paragraphs[i].id);
          }
          for (let i = 1; i < lines.length; i++) {
            edit.addBlock(lines[i], { afterBlockId: firstBlock.id });
          }
        } else {
          edit.replace(
            {
              blockId: firstBlock.id,
              startOffset: 0,
              endOffset: firstText.length,
            },
            fullText
          );
          for (let i = eLine - 1; i >= sLine; i--) {
            edit.removeBlock(paragraphs[i].id);
          }
        }
      }

      return {
        success: true,
        message: `已${action === 'delete' ? '删除' : action === 'insert' ? '插入' : '替换'} [${sLine}:${sCol}-${eLine}:${eCol}]`,
      };
    }

    case 'append': {
      const { text } = call.input;
      if (!text) return { success: false, message: '缺少 text' };

      const lines = splitToBlocks(text);
      for (const line of lines) {
        edit.addBlock(line);
      }
      return { success: true, message: `已追加 ${lines.length} 个段落` };
    }

    default:
      return { success: false, message: `未知工具: ${call.name}` };
  }
}
