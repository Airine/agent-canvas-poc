import { defineConfig, defineDocs, frontmatterSchema } from 'fumadocs-mdx/config';
import { z } from 'zod';

export const docs = defineDocs({
  dir: 'content/docs',
  docs: {
    schema: frontmatterSchema.extend({
      sources: z.array(z.string()).optional(),
      covers: z.array(z.string()).optional(),
      generated: z.string().optional(),
    }),
  },
});

export default defineConfig();
