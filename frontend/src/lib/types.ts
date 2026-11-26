export type Requirement = {
  id: string;
  statement: string;
  category: string;
  priority: string;
  acceptance: string;
  source: string;
};
export type SRS = {
  title: string;
  summary: string;
  requirements: Requirement[];
  assumptions: string[];
  stakeholders: string[];
  findings: { type: string; text: string }[];
  risks: { title: string; text: string }[];
  openIssues: string[];
  traceability: { req: string; test: string; check: string }[];
};
export type SDLC = {
  chosen: string;
  justification: string;
  ranking: {
    model: string;
    score: number;
    base: number;
    drivers: { factor: string; level: string; points: number }[];
    fit: string;
    miss: string;
  }[];
  factors: {
    name: string;
    value: string;
    cites: string;
    implication: string;
  }[];
};
export type AgentId = "analyst" | "planner" | "writer";
export type Ieee = {
  purpose: string; included: string[]; excluded: string[];
  definitions: { term: string; definition: string }[]; perspective: string;
  productFunctions: string[]; users: { user: string; characteristics: string }[];
  constraints: string[]; dependencies: string[];
  interfaces: { user: string[]; hardware: string[]; software: string[]; communication: string[]; file: string[] };
  functions: { name: string; input: string; processing: string[]; output: string; requirement: string }[];
  performance: string[]; entities: { entity: string; attributes: string[] }[];
  relationships: string[]; designConstraints: string[];
  quality: { attribute: string; requirement: string }[];
  actors: { actor: string; useCases: string[] }[]; businessRules: string[]; references: string[];
};
export type Span = {
  name: string;
  kind: string;
  start: number;
  end: number;
  tokens: number;
  input: string;
  output: string;
  error?: string;
};
export type Item = {
  id: string;
  kind: string;
  text?: string;
  title?: string;
  strong?: string;
  srs?: SRS;
  sdlc?: SDLC;
  ieee?: Ieee;
  steps?: Span[];
  messages?: { from: string; to: string; text: string }[];
};
export type RunEvent = {
  type: string;
  stage?: string;
  agents?: AgentId[];
  item?: Item;
  id?: string;
  patch?: Partial<Item>;
};
export type Project = {
  id: string;
  title: string;
  created: number;
  brief?: string;
};
