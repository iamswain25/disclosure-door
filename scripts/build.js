/**
 * Disclosure Door — Build Script
 *
 * YouTube-inspired UFO disclosure blog site.
 * Reads blog posts from ufology-llm-wiki youtube directory.
 *
 * Structure:
 *   /              — Homepage: grid of video cards
 *   /videos/<slug>/ — Video page: blog posts + sidebar
 *   /posts/<slug>/  — Individual blog post
 */

const fs = require('fs');
const path = require('path');
const { marked } = require('marked');
const matter = require('gray-matter');

// ─── Configuration ────────────────────────────────────────────

const REPO_ROOT = path.resolve(__dirname, '..');
const WIKI_ROOT = path.resolve(process.env.HOME, 'Documents/ufology-llm-wiki/youtube');
const OUTPUT_DIR = path.join(REPO_ROOT, 'dist');
const SRC_DIR = path.join(REPO_ROOT, 'src');

// ─── Helpers ───────────────────────────────────────────────────

function slugify(text) {
  return text
    .replace(/[^\w가-힣ㄱ-ㅎㅏ-ㅣ\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase();
}

function videoSlug(dirName) {
  // Short hash-like slug from directory name
  let hash = 0;
  for (let i = 0; i < dirName.length; i++) {
    const char = dirName.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  const shortName = dirName
    .replace(/[^a-zA-Z0-9가-힣ㄱ-ㅎㅏ-ㅣ]/g, '')
    .substring(0, 20)
    .toLowerCase();
  return `${shortName}-${Math.abs(hash).toString(36).substring(0, 6)}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function shortDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const now = new Date();
  const diff = now - d;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return '오늘';
  if (days === 1) return '어제';
  if (days < 7) return `${days}일 전`;
  if (days < 30) return `${Math.floor(days / 7)}주 전`;
  return formatDate(dateStr);
}

function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getYoutubeId(url) {
  if (!url) return null;
  // https://www.youtube.com/watch?v=VIDEO_ID
  const match = url.match(/[?&]v=([^&]+)/);
  if (match) return match[1];
  // https://youtu.be/VIDEO_ID
  const short = url.match(/youtu\.be\/([^?&]+)/);
  if (short) return short[1];
  // /embed/VIDEO_ID
  const embed = url.match(/\/embed\/([^/?&]+)/);
  if (embed) return embed[1];
  return null;
}

function youtubeThumbnailUrl(videoId) {
  if (!videoId) return null;
  // maxresdefault may not exist for all videos; onerror fallback in HTML
  return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
}

function normalizeTags(tags) {
  if (!tags) return [];
  if (typeof tags === 'string') return tags.split(/\s+/).filter(Boolean);
  if (Array.isArray(tags)) return tags;
  return [];
}

const CHANNEL_COLORS = ['c0', 'c1', 'c2', 'c0', 'c1'];

// ─── Content Discovery ────────────────────────────────────────

function discoverVideos() {
  const videos = [];

  if (!fs.existsSync(WIKI_ROOT)) {
    console.error(`Wiki directory not found: ${WIKI_ROOT}`);
    return videos;
  }

  const videoDirs = fs.readdirSync(WIKI_ROOT, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  for (const videoDir of videoDirs) {
    const blogDir = path.join(WIKI_ROOT, videoDir, 'blog');
    if (!fs.existsSync(blogDir)) continue;

    const blogFiles = fs.readdirSync(blogDir).filter(f => f.endsWith('.md'));

    // Gather video metadata from translation or raw files
    let videoMeta = {};

    const translationDir = path.join(WIKI_ROOT, videoDir, 'translation');
    if (fs.existsSync(translationDir)) {
      const transFiles = fs.readdirSync(translationDir).filter(f => f.endsWith('.md'));
      if (transFiles.length > 0) {
        const content = readFileSafe(path.join(translationDir, transFiles[0]));
        if (content) {
          const parsed = matter(content);
          videoMeta = {
            source_url: parsed.data.source || parsed.data.source_url || '',
            channel: parsed.data.channel || '',
            video_title: parsed.data.title || videoDir,
            description: parsed.data.description || '',
            published_date: parsed.data.published_date || '',
          };
        }
      }
    }

    if (!videoMeta.source_url) {
      const rawDir = path.join(WIKI_ROOT, videoDir, 'raw');
      if (fs.existsSync(rawDir)) {
        const rawFiles = fs.readdirSync(rawDir).filter(f => f.endsWith('.md'));
        for (const rf of rawFiles) {
          const content = readFileSafe(path.join(rawDir, rf));
          if (content) {
            const parsed = matter(content);
            videoMeta.source_url = parsed.data.source_url || parsed.data.source || videoMeta.source_url;
            videoMeta.video_title = parsed.data.title || videoDir;
            videoMeta.channel = parsed.data.channel || videoMeta.channel;
            break;
          }
        }
      }
    }

    const posts = blogFiles.map(filename => {
      const filePath = path.join(blogDir, filename);
      const raw = readFileSafe(filePath);
      if (!raw) return null;

      const parsed = matter(raw);
      const slug = filename.replace(/\.md$/, '');
      let htmlContent = marked.parse(parsed.content, { breaks: true, gfm: true });
      // Post-process: catch **bold** markers missed by marked (esp. with Korean + English parens)
      htmlContent = htmlContent.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

      return {
        slug,
        filename,
        title: parsed.data.title || slug,
        date: parsed.data.date || '',
        tags: normalizeTags(parsed.data.tags),
        htmlContent,
      };
    }).filter(Boolean);

    if (posts.length === 0) continue;

    // If no published_date from translation/raw, check the first blog post
    if (!videoMeta.published_date) {
      const firstPostParsed = matter(readFileSafe(path.join(blogDir, blogFiles[0])) || '');
      videoMeta.published_date = firstPostParsed.data?.published_date || '';
    }

    posts.sort((a, b) => {
      if (a.date && b.date) return new Date(b.date) - new Date(a.date);
      return 0;
    });

    videos.push({
      dir: videoDir,
      slug: videoSlug(videoDir),
      title: videoMeta.video_title || videoDir,
      channel: videoMeta.channel || '',
      source_url: videoMeta.source_url || '',
      thumbnail_url: youtubeThumbnailUrl(getYoutubeId(videoMeta.source_url)),
      published_year: videoMeta.published_date
        ? (/^\d{4}$/.test(videoMeta.published_date)
          ? parseInt(videoMeta.published_date, 10)
          : new Date(videoMeta.published_date).getFullYear())
        : null,
      description: videoMeta.description || '',
      posts,
      postCount: posts.length,
    });
  }

  // Sort by most recent post
  videos.sort((a, b) => {
    const aDate = a.posts[0]?.date || '';
    const bDate = b.posts[0]?.date || '';
    return new Date(bDate) - new Date(aDate);
  });

  return videos;
}

// ─── Marked renderer override ──────────────────────────────────

// heading token: { text, depth, tokens }
// We override to add id attributes for anchor linking
const renderer = {
  heading({ text, depth, tokens }) {
    const level = depth;
    const plainText = tokens ? tokens.map(t => t.text || t.raw || '').join('') : String(text);
    const id = slugify(plainText);
    return `<h${level} id="${id}">${text}</h${level}>`;
  }
};
marked.use({ renderer });

// ─── Templates ─────────────────────────────────────────────────

function baseHtml(title, content, extraHead = '') {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} — Disclosure Door</title>
  <meta name="description" content="UFO disclosure blog — Korean translations of YouTube content">
  <link rel="stylesheet" href="/style.css">
  ${extraHead}
</head>
<body>
  <div class="top-bar">
    <div class="top-bar-inner">
      <a href="/" class="logo">Disclosure Door</a>
    </div>
  </div>
  <div class="page">
    ${content}
  </div>
  <footer>
    <p><a href="/">Disclosure Door</a> — UFO 진실을 한국어로</p>
  </footer>
</body>
</html>`;
}

function renderHomePage(videos) {
  const totalPosts = videos.reduce((s, v) => s + v.postCount, 0);

  let cards = '';
  videos.forEach((video, idx) => {
    const colorClass = CHANNEL_COLORS[idx % CHANNEL_COLORS.length];
    cards += `
  <a href="/videos/${video.slug}/" class="video-card">
    <div class="video-thumb">
      ${video.thumbnail_url
        ? `<img src="${video.thumbnail_url}" alt="${escapeHtml(video.title)}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'play-icon\\'></div>';this.parentElement.querySelector('.play-icon').after(document.createTextNode(' '))">`
        : `<div class="play-icon"></div>`}
      <span class="duration-badge">${video.postCount} posts</span>
    </div>
    <div class="video-info">
      <div class="channel-icon ${colorClass}">${video.channel ? video.channel.charAt(0).toUpperCase() : 'D'}</div>
      <div class="video-meta">
        <div class="video-title">${escapeHtml(video.title)}</div>
        <div class="video-channel">${escapeHtml(video.channel || 'Disclosure Door')}</div>
        <div class="video-stats">블로그 ${video.postCount}개${video.published_year ? ` · ${video.published_year}` : ''}</div>
      </div>
    </div>
  </a>`;
  });

  const content = `
  <div class="video-grid">
    ${cards}
  </div>`;

  return baseHtml('홈 — UFO 블로그', content);
}

function renderVideoPage(video, allVideos) {
  // Blog post list
  const GRADIENTS = [
    'linear-gradient(135deg, #1a1a3e, #2a1a1a)',
    'linear-gradient(135deg, #1a2a1a, #1a1a3e)',
    'linear-gradient(135deg, #2a1a1a, #1a2a1a)',
    'linear-gradient(135deg, #0a2a3e, #2a1a2a)',
    'linear-gradient(135deg, #1a2a2a, #3a1a1a)',
    'linear-gradient(135deg, #2a1a3e, #0a2a1a)',
    'linear-gradient(135deg, #1a0a2e, #2a2a1a)',
    'linear-gradient(135deg, #2a2a3e, #1a0a1a)',
    'linear-gradient(135deg, #0a1a2e, #3a2a1a)',
    'linear-gradient(135deg, #1a3a2a, #2a0a3e)',
    'linear-gradient(135deg, #3a1a2a, #1a2a0a)',
    'linear-gradient(135deg, #0a2a2e, #2a1a0a)',
  ];
  const EMOJIS = ['📄', '🛸', '🔬', '🧬', '🌌', '⚡', '🧠', '🔭', '👽', '📡', '🌀', '🎯'];
  let postList = '';
  for (const [idx, post] of video.posts.entries()) {
    const tagsHtml = post.tags.length > 0
      ? `<div class="post-tags">${post.tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>`
      : '';
    const gradient = GRADIENTS[idx % GRADIENTS.length];
    const emoji = EMOJIS[idx % EMOJIS.length];

    postList += `
  <a href="/posts/${video.slug}/${post.slug}/" class="post-card">
    <div class="post-thumb" style="background:${gradient}">${emoji}</div>
    <div class="post-body">
      <div class="post-title">${escapeHtml(post.title)}</div>
      <div class="post-meta">${shortDate(post.date)}</div>
      ${tagsHtml}
    </div>
  </a>`;
  }

  // Sidebar: other videos
  const otherVideos = allVideos.filter(v => v.slug !== video.slug);
  let sidebar = `
  <div class="sidebar-title">다른 영상</div>`;
  for (const v of otherVideos) {
    sidebar += `
  <a href="/videos/${v.slug}/" class="sidebar-card">
    <div class="sidebar-thumb">
      ${v.thumbnail_url
        ? `<img src="${v.thumbnail_url}" alt="${escapeHtml(v.title)}" style="width:100%;height:100%;object-fit:cover;" loading="lazy" onerror="this.parentElement.innerHTML='▶'">`
        : `▶`}
    </div>
    <div class="sidebar-info">
      <div class="sidebar-title">${escapeHtml(v.title)}</div>
      <div class="sidebar-channel">블로그 ${v.postCount}개${v.published_year ? ` · ${v.published_year}` : ''}</div>
    </div>
  </a>`;
  }

  const colorClass = CHANNEL_COLORS[allVideos.indexOf(video) % CHANNEL_COLORS.length];
  const channelInitial = video.channel ? video.channel.charAt(0).toUpperCase() : 'D';

  const content = `
  <div class="video-detail">
    <div class="video-detail-main">
      <div class="video-info-bar">
        ${video.thumbnail_url
          ? `<img src="${video.thumbnail_url}" alt="" class="video-info-thumb" loading="lazy" onerror="this.style.display='none'">`
          : ''}
        <div class="video-info-text">
          <h1 class="video-title-lg">${escapeHtml(video.title)}</h1>
          <div class="video-actions">
            <div class="channel-badge">
              <div class="icon ${colorClass}">${channelInitial}</div>
              <span>${escapeHtml(video.channel || 'Disclosure Door')}</span>
            </div>
            ${video.source_url ? `<a href="${escapeHtml(video.source_url)}" target="_blank" rel="noopener" class="yt-link">YouTube에서 보기</a>` : ''}
          </div>
        </div>
      </div>
      <div class="post-grid">
        ${postList}
      </div>
    </div>
    <div class="video-sidebar">
      ${otherVideos.length > 0 ? sidebar : ''}
    </div>
  </div>`;

  return baseHtml(`${video.title}`, content);
}

function renderPostPage(post, video) {
  const tagsHtml = post.tags.length > 0
    ? `<div class="tag-list">${post.tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>`
    : '';

  const content = `
  <div class="article-page">
    <a href="/videos/${video.slug}/" class="back-link">${escapeHtml(video.title)}</a>
    <article>
      <header class="post-header">
        <h1>${escapeHtml(post.title)}</h1>
        <div class="meta-line">
          ${post.date ? `<span>${formatDate(post.date)}</span>` : ''}
          ${video.source_url ? `<a href="${escapeHtml(video.source_url)}" target="_blank" rel="noopener">원본 영상</a>` : ''}
        </div>
        ${tagsHtml}
      </header>
      <div class="post-content">
        ${post.htmlContent}
      </div>
    </article>
  </div>`;

  return baseHtml(post.title, content);
}

// ─── Build ─────────────────────────────────────────────────────

function build() {
  console.log('🔍 Discovering blog posts...');
  const videos = discoverVideos();

  const total = videos.reduce((s, v) => s + v.postCount, 0);
  if (total === 0) {
    console.warn('⚠️  No blog posts found. Check wiki path:', WIKI_ROOT);
  } else {
    console.log(`📦 Found ${total} blog posts across ${videos.length} videos`);
  }

  // Clean output dir
  if (fs.existsSync(OUTPUT_DIR)) {
    fs.rmSync(OUTPUT_DIR, { recursive: true });
  }

  // Copy static assets
  const staticFiles = ['style.css', '_headers', '_redirects'];
  for (const file of staticFiles) {
    const src = path.join(SRC_DIR, file);
    const dst = path.join(OUTPUT_DIR, file);
    if (fs.existsSync(src)) {
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
      console.log(`📄 Copied ${file}`);
    }
  }

  // Build video pages
  for (const video of videos) {
    const videoDir = path.join(OUTPUT_DIR, 'videos', video.slug);
    fs.mkdirSync(videoDir, { recursive: true });

    const videoHtml = renderVideoPage(video, videos);
    fs.writeFileSync(path.join(videoDir, 'index.html'), videoHtml, 'utf-8');
    console.log(`  ✓ /videos/${video.slug}/ (${video.postCount} posts)`);
  }

  // Build blog posts
  let builtPosts = 0;
  for (const video of videos) {
    for (const post of video.posts) {
      const postDir = path.join(OUTPUT_DIR, 'posts', video.slug, post.slug);
      fs.mkdirSync(postDir, { recursive: true });

      const html = renderPostPage(post, video);
      fs.writeFileSync(path.join(postDir, 'index.html'), html, 'utf-8');
      builtPosts++;
    }
  }

  // Build homepage
  const homeHtml = renderHomePage(videos);
  fs.writeFileSync(path.join(OUTPUT_DIR, 'index.html'), homeHtml, 'utf-8');
  console.log('📄 Built index.html');

  console.log(`\n✅ Done! ${builtPosts} posts in ${videos.length} videos → ${OUTPUT_DIR}`);
}

// ─── Watch Mode ────────────────────────────────────────────────

const args = process.argv.slice(2);
if (args.includes('--watch')) {
  console.log('👀 Watch mode — rebuilding on change...');
  build();
  fs.watch(WIKI_ROOT, { recursive: true }, (eventType, filename) => {
    if (filename && filename.endsWith('.md')) {
      console.log(`\n🔄 Change detected: ${filename}`);
      build();
    }
  });
} else {
  build();
}
