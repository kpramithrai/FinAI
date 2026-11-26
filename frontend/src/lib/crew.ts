import type { AgentId } from "./types";

export const crew: Record<AgentId, { name: string; shape: "circle" | "diamond" | "hexagon"; color: string }> = {
  analyst: { name: "Analyst", shape: "circle", color: "blue" },
  planner: { name: "SDLC Planner", shape: "diamond", color: "amber" },
  writer: { name: "IEEE Writer", shape: "hexagon", color: "green" },
};
