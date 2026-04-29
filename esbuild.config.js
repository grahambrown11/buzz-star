const esbuild = require('esbuild');
const pkg = require('./package.json');
const path = require('path');
const fs = require('fs-extra');
const glob = require('glob');
const archiver = require('archiver');

const OUTPUT_DIR = 'buzz-star';
const isWatch = process.argv.includes('--watch');
const isProduction = process.env.NODE_ENV === 'production';

// Clean output directory
if (fs.existsSync(OUTPUT_DIR)) {
  fs.removeSync(OUTPUT_DIR);
}
fs.mkdirpSync(OUTPUT_DIR);

// Copy static files
function copyStaticFiles() {
  const staticFiles = [
    { from: 'src/*.html', to: './' },
    { from: 'src/css/**/*', to: './css' },
    { from: 'src/fonts/**/*', to: './fonts' },
    { from: 'src/img/**/*', to: './img' },
    { from: 'src/manifest.json', to: './' },
    { from: 'src/*.js', to: './' },
  ];

  for (const file of staticFiles) {
    const files = glob.sync(file.from);
    for (const src of files) {
      const destDir = path.join(OUTPUT_DIR, file.to || '');
      const destFile = path.join(destDir, path.basename(src));
      
      fs.mkdirpSync(destDir);
      
      if (src.endsWith('.json')) {
        let content = fs.readFileSync(src, 'utf8');
        content = content.replace(/__VERSION__/g, pkg.version);
        fs.writeFileSync(destFile, content);
      } else {
        fs.copyFileSync(src, destFile);
      }
    }
  }

  // Copy other non-JS files
  const otherFiles = glob.sync('src/**/*.{html,css,png,jpg,jpeg,gif,svg,woff,woff2,ttf,eot}');
  for (const file of otherFiles) {
    if (file.includes('node_modules')) continue;
    
    const relativePath = path.relative('src', file);
    const destPath = path.join(OUTPUT_DIR, relativePath);
    const destDir = path.dirname(destPath);
    
    if (!fs.existsSync(destDir)) {
      fs.mkdirpSync(destDir, { recursive: true });
    }
    
    fs.copyFileSync(file, destPath);
  }
}

async function createZip() {
  return new Promise((resolve, reject) => {
    console.log('Creating zip archive...');
    const output = fs.createWriteStream('buzz-star.zip');
    const archive = archiver('zip', { zlib: { level: 9 } });
 
    output.on('close', () => {
      console.log(`Created buzz-star.zip (${archive.pointer()} bytes)`);
      resolve();
    });
 
    archive.on('error', (err) => {
      reject(err);
    });
 
    archive.pipe(output);
    archive.directory(OUTPUT_DIR, false);
    archive.finalize();
  });
}

// ESBuild configuration
const buildConfig = {
  entryPoints: {
    'buzz-worker': 'src/lib/BuzzWorker.js',
    'buzz-offscreen': 'src/lib/BuzzOffscreen.js',
    'buzz-popup': 'src/lib/BuzzPopup.js',
    'buzz-options': 'src/lib/BuzzOptions.js'
  },
  entryNames: '[name]',
  bundle: true,
  define: {
    '__VERSION__': JSON.stringify(pkg.version)
  },
  outdir: OUTPUT_DIR,
  minify: isProduction,
  sourcemap: !isProduction,
  target: ['chrome109'],
  logLevel: 'info',
  loader: {
    '.js': 'jsx',  // This ensures all JS files go through the transformation pipeline
  }
};

// Execute build
async function build() {
  try {
    // Copy static files first
    await copyStaticFiles();
    
    // Start ESBuild
    const context = await esbuild.context(buildConfig);

    if (isWatch) {
      await context.watch();
      console.log('Watching for changes...');
    } else {
      await context.rebuild();
      await context.dispose();

      // Only create zip for production builds
      if (isProduction) {
        await createZip();
      }

      console.log('Build complete!');
      process.exit(0);
    }
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();
