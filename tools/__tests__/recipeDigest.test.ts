import { promises as fs } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { generateRecipeDigest } from '../sunset/recipeDigest';

const START_MARKER = '<!-- RECIPE_DIGEST:START -->';
const END_MARKER = '<!-- RECIPE_DIGEST:END -->';

function normalize(content: string): string {
  return content.replace(/\r\n/g, '\n');
}

describe('generateRecipeDigest', () => {
  const repoRoot = path.resolve('.');
  const recipesDir = path.join(repoRoot, 'data/recipes');
  const templatePath = path.join(repoRoot, 'project/recipe-digest.template.md');

  it('creates a markdown digest with sha256 hashes for each recipe', async () => {
    const workDir = await mkdtemp(path.join(tmpdir(), 'recipe-digest-'));
    const outputPath = path.join(workDir, 'recipe-digest.md');

    const result = await generateRecipeDigest({
      recipesDir,
      templatePath,
      outputPath,
    });

    expect(result.updated).toBe(true);
    expect(result.missingRecipes).toEqual([]);
    expect(result.entries.map((entry) => entry.path)).toEqual([
      'data/recipes/demo.sora2.yaml',
    ]);

    const digestContent = await fs.readFile(outputPath, 'utf8');
    const normalizedContent = normalize(digestContent);

    const recipeSource = await fs.readFile(
      path.join(repoRoot, 'data/recipes/demo.sora2.yaml'),
    );
    const expectedHash = createHash('sha256').update(recipeSource).digest('hex');

    const table = `| Recipe Path | SHA256 |\n| --- | --- |\n| data/recipes/demo.sora2.yaml | ${expectedHash} |`;
    const betweenMarkers = normalizedContent.slice(
      normalizedContent.indexOf(START_MARKER) + START_MARKER.length,
      normalizedContent.indexOf(END_MARKER),
    );

    expect(normalize(betweenMarkers)).toContain(table);
  });

  it('rewrites the digest when the current file is stale', async () => {
    const workDir = await mkdtemp(path.join(tmpdir(), 'recipe-digest-'));
    const outputPath = path.join(workDir, 'recipe-digest.md');

    await fs.writeFile(outputPath, '# stale digest');

    const result = await generateRecipeDigest({
      recipesDir,
      templatePath,
      outputPath,
    });

    expect(result.updated).toBe(true);
    const digestContent = await fs.readFile(outputPath, 'utf8');
    expect(digestContent).toContain('data/recipes/demo.sora2.yaml');
  });
});
