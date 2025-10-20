import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

interface TemplateMetadata {
  expected_recipes?: string[];
}

interface ParsedTemplate {
  metadata: TemplateMetadata;
  frontMatter: string;
  body: string;
}

export interface RecipeDigestEntry {
  path: string;
  hash: string;
}

export interface GenerateRecipeDigestOptions {
  recipesDir: string;
  templatePath: string;
  outputPath: string;
  cwd?: string;
}

export interface GenerateRecipeDigestResult {
  entries: RecipeDigestEntry[];
  missingRecipes: string[];
  content: string;
  updated: boolean;
}

const START_MARKER = '<!-- RECIPE_DIGEST:START -->';
const END_MARKER = '<!-- RECIPE_DIGEST:END -->';

function normalizePath(value: string): string {
  return value.split(path.sep).join('/');
}

function parseTemplate(content: string): ParsedTemplate {
  if (!content.startsWith('---\n')) {
    return { metadata: {}, frontMatter: '', body: content };
  }

  const endIndex = content.indexOf('\n---', 4);
  if (endIndex === -1) {
    throw new Error('Template front matter is not terminated');
  }

  const frontMatterRaw = content.slice(0, endIndex + 4);
  const body = content.slice(endIndex + 4);
  const metadata = parseFrontMatter(frontMatterRaw);

  return { metadata, frontMatter: frontMatterRaw, body };
}

function parseFrontMatter(frontMatterRaw: string): TemplateMetadata {
  const lines = frontMatterRaw.split('\n').slice(1, -1);
  const metadata: TemplateMetadata = {};
  let currentKey: keyof TemplateMetadata | undefined;

  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }

    if (!line.startsWith(' ')) {
      const [key, ...rest] = line.split(':');
      if (!key) {
        continue;
      }

      const value = rest.join(':').trim();
      if (value) {
        metadata[key as keyof TemplateMetadata] = value
          .split(',')
          .map((item) => item.trim())
          .filter((item) => item.length > 0);
        currentKey = undefined;
      } else {
        currentKey = key as keyof TemplateMetadata;
        metadata[currentKey] = [];
      }
      continue;
    }

    if (currentKey && line.trim().startsWith('- ')) {
      const list = metadata[currentKey] ?? [];
      list.push(line.trim().slice(2));
      metadata[currentKey] = list;
    }
  }

  return metadata;
}

async function listRecipeFiles(recipesDir: string): Promise<string[]> {
  const entries = await fs.readdir(recipesDir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.isFile() && /\.ya?ml$/u.test(entry.name)) {
      files.push(path.join(recipesDir, entry.name));
    }
  }

  return files.sort();
}

function renderDigestTable(entries: RecipeDigestEntry[]): string {
  const header = ['| Recipe Path | SHA256 |', '| --- | --- |'];
  const rows = entries.map((entry) => `| ${entry.path} | ${entry.hash} |`);

  if (rows.length === 0) {
    rows.push('| _No recipes found_ | - |');
  }

  return [...header, ...rows].join('\n');
}

function replaceDigestSection(body: string, digestTable: string): string {
  const escapedStart = START_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedEnd = END_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`${escapedStart}[\\s\\S]*?${escapedEnd}`, 'u');

  if (!pattern.test(body)) {
    throw new Error('Template is missing digest markers');
  }

  return body.replace(
    pattern,
    `${START_MARKER}\n\n${digestTable}\n\n${END_MARKER}`,
  );
}

export async function generateRecipeDigest(
  options: GenerateRecipeDigestOptions,
): Promise<GenerateRecipeDigestResult> {
  const cwd = options.cwd ?? process.cwd();
  const resolvedRecipesDir = path.resolve(cwd, options.recipesDir);
  const resolvedTemplatePath = path.resolve(cwd, options.templatePath);
  const resolvedOutputPath = path.resolve(cwd, options.outputPath);

  const recipeFiles = await listRecipeFiles(resolvedRecipesDir);
  const entries: RecipeDigestEntry[] = [];

  for (const filePath of recipeFiles) {
    const source = await fs.readFile(filePath);
    const hash = createHash('sha256').update(source).digest('hex');
    const relativePath = normalizePath(path.relative(cwd, filePath));
    entries.push({ path: relativePath, hash });
  }

  const templateContent = await fs.readFile(resolvedTemplatePath, 'utf8');
  const parsed = parseTemplate(templateContent);
  const digestTable = renderDigestTable(entries);
  const outputBody = replaceDigestSection(parsed.body, digestTable);
  const content = `${parsed.frontMatter}${outputBody}`;

  const expected = (parsed.metadata.expected_recipes ?? []).map((item) =>
    normalizePath(item),
  );
  const actual = new Set(entries.map((entry) => entry.path));
  const missingRecipes = expected.filter((item) => !actual.has(item));

  let updated = true;
  try {
    const existing = await fs.readFile(resolvedOutputPath, 'utf8');
    if (existing === content) {
      updated = false;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  if (updated) {
    await fs.mkdir(path.dirname(resolvedOutputPath), { recursive: true });
    await fs.writeFile(resolvedOutputPath, content, 'utf8');
  }

  return { entries, missingRecipes, content, updated };
}

async function runCli(argv: string[]): Promise<void> {
  const args = [...argv];
  let outputPath: string | undefined;
  let recipesDir = 'data/recipes';
  let templatePath = 'project/recipe-digest.template.md';
  let checkOnly = false;

  while (args.length > 0) {
    const arg = args.shift();
    if (!arg) {
      continue;
    }

    switch (arg) {
      case '--output':
        outputPath = args.shift();
        break;
      case '--recipes-dir':
        recipesDir = args.shift() ?? recipesDir;
        break;
      case '--template':
        templatePath = args.shift() ?? templatePath;
        break;
      case '--check':
        checkOnly = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!outputPath) {
    throw new Error('--output is required');
  }

  const result = await generateRecipeDigest({
    recipesDir,
    templatePath,
    outputPath,
  });

  if (result.missingRecipes.length > 0) {
    const message = `Missing recipes: ${result.missingRecipes.join(', ')}`;
    if (checkOnly) {
      throw new Error(message);
    }
    console.error(message);
  }

  if (checkOnly && result.updated) {
    throw new Error('Recipe digest is outdated');
  }

  if (result.updated && !checkOnly) {
    console.log(`Updated ${outputPath}`);
  } else if (!result.updated) {
    console.log('Recipe digest is up to date');
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runCli(process.argv.slice(2)).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}

export const __filename = fileURLToPath(import.meta.url);
export const __dirname = path.dirname(__filename);
