'use strict';

const gulp = require('gulp');
const log = require('fancy-log');
const source = require('vinyl-source-stream');
const browserify = require('browserify');
const babelify = require("babelify");
const del = require('del');
const zip = require('gulp-zip');
const replace = require('gulp-replace');
const pkg = require('./package.json');

const OUTPUT_DIR = 'buzz-star';
let debug = true;

gulp.task('clean', () => del(OUTPUT_DIR, {force: true}));

gulp.task('copy', gulp.series('clean', () => {
    return gulp.src([
        'src/*.js',
        'src/*.html',
        'src/css/**',
        'src/fonts/**',
        'src/img/**'
    ], {'base': 'src'})
        .pipe(gulp.dest(OUTPUT_DIR));
}));

gulp.task('manifest', gulp.series('copy', (cb) => {
    log('pkg.version: ' + pkg.version);
    gulp.src(['src/manifest.json'])
        .pipe(replace('$$version$$', pkg.version))
        .pipe(gulp.dest(OUTPUT_DIR));
    cb();
}));

function compileJS(src, dst) {
    return browserify({
        entries: [src],
        debug: debug
    })
        .transform(babelify.configure({
            "presets": [
                [
                    "env",
                    {
                        "targets": {
                            "chrome": "109"
                        }
                    }
                ]
            ]
        }))
        .bundle().on('error', (e) => {
            log(e);
        })
        .pipe(source(dst))
        .pipe(replace('$$version$$', pkg.version))
        .pipe(gulp.dest(OUTPUT_DIR));
}

gulp.task('bundle', gulp.series('manifest',
    () => compileJS('src/lib/BuzzWorker.js','buzz-worker.js'),
    () => compileJS('src/lib/BuzzOffscreen.js','buzz-offscreen.js'),
    () => compileJS('src/lib/BuzzPopup.js','buzz-popup.js'),
    () => compileJS('src/lib/BuzzOptions.js','buzz-options.js'),
    (done) => done()
));

gulp.task('default', gulp.series('bundle', (cb) => {
    log('complete!');
    cb();
}));

gulp.task('debug-off', (cb) => {
    log('Turn debug off');
    debug = false;
    cb();
});

gulp.task('zip', gulp.series('bundle', () => {
    return gulp.src(OUTPUT_DIR + '/**', {dot: true})
    .pipe(zip('buzz-star.zip'))
    .pipe(gulp.dest("."));
}));

gulp.task('prod', gulp.series('debug-off', 'zip', (cb) => {
    log('complete!');
    cb();
}));
