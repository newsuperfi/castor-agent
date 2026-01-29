/**
 * Tools - 도구 모듈 통합 export
 */

export { applyDiffTool, diffTools } from "./diff.js";
export { fileTools, listDirTool, readFileTool, writeFileTool } from "./file.js";
export { toolRegistry, ToolRegistry, type ITool } from "./registry.js";
export { codebaseSearchTool, searchTools } from "./search.js";
export { runCommandTool, terminalTools } from "./terminal.js";
export { readUrlTool } from "./url.js";

// 모든 도구를 레지스트리에 등록하는 함수
import { diffTools } from "./diff.js";
import { fileTools } from "./file.js";
import { toolRegistry } from "./registry.js";
import { searchTools } from "./search.js";
import { terminalTools } from "./terminal.js";
import { readUrlTool } from "./url.js";

export function registerAllTools(): void {
  // 파일 도구
  for (const tool of fileTools) {
    toolRegistry.register(tool);
  }
  // 터미널 도구
  for (const tool of terminalTools) {
    toolRegistry.register(tool);
  }
  // URL 도구
  toolRegistry.register(readUrlTool);
  // 검색 도구
  for (const tool of searchTools) {
    toolRegistry.register(tool);
  }
  // Diff 도구
  for (const tool of diffTools) {
    toolRegistry.register(tool);
  }
}
