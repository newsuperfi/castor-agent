/**
 * Tools - 도구 모듈 통합 export
 */

export { fileTools, listDirTool, readFileTool, writeFileTool } from "./file.js";
export { toolRegistry, ToolRegistry, type ITool } from "./registry.js";
export { runCommandTool, terminalTools } from "./terminal.js";

// 모든 도구를 레지스트리에 등록하는 함수
import { fileTools } from "./file.js";
import { toolRegistry } from "./registry.js";
import { terminalTools } from "./terminal.js";

export function registerAllTools(): void {
  for (const tool of fileTools) {
    toolRegistry.register(tool);
  }
  for (const tool of terminalTools) {
    toolRegistry.register(tool);
  }
}
