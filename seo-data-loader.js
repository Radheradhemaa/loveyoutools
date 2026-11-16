import fs from 'fs';
import vm from 'vm';

export function loadSiteData() {
  const toolsSrc = fs
    .readFileSync('src/data/tools.ts', 'utf8')
    .replace(/export\s+const\s+/g, 'var ');

  const toolsCtx = {};
  vm.runInNewContext(toolsSrc, toolsCtx, { filename: 'tools.ts' });

  const blogSrc = fs
    .readFileSync('src/data/blog.ts', 'utf8')
    .replace(/export\s+interface\s+BlogPost\s*\{[\s\S]*?\}\s*/m, '')
    .replace(/:\s*BlogPost\[\]\s*=/g, ' =')
    .replace(/export\s+const\s+/g, 'var ');

  const blogCtx = {};
  vm.runInNewContext(blogSrc, blogCtx, { filename: 'blog.ts' });

  return {
    categories: Array.isArray(toolsCtx.categories) ? toolsCtx.categories : [],
    tools: Array.isArray(toolsCtx.tools) ? toolsCtx.tools : [],
    blogPosts: Array.isArray(blogCtx.blogPosts) ? blogCtx.blogPosts : [],
  };
}
